import { InvoiceData, ReferenceRecord, ValidationResult, Mismatch, LineItem, ReferenceLineItem } from './types';
import { stringSimilarity, descriptionSimilarity, numbersMatch, round2 } from './utils';

const STRING_SIMILARITY_THRESHOLD = 0.75;

function compareStrings(field: string, extracted: string | null | undefined, reference: string | null | undefined): Mismatch | null {
  if (!extracted && !reference) return null;
  if (!extracted || !reference) {
    return { field, extracted: extracted ?? null, reference: reference ?? null, note: 'One value is missing' };
  }
  const sim = stringSimilarity(extracted, reference);
  if (sim < STRING_SIMILARITY_THRESHOLD) {
    return { field, extracted, reference, note: `Similarity: ${(sim * 100).toFixed(1)}%` };
  }
  return null;
}

function compareNumbers(field: string, extracted: number | null | undefined, reference: number | null | undefined, tolerance = 0.01): Mismatch | null {
  if (extracted == null && reference == null) return null;
  if (extracted == null || reference == null) {
    return { field, extracted: extracted ?? null, reference: reference ?? null, note: 'One value is missing' };
  }
  if (!numbersMatch(extracted, reference, tolerance)) {
    return { field, extracted: round2(extracted), reference: round2(reference) };
  }
  return null;
}

function matchLineItems(
  extractedItems: LineItem[],
  referenceItems: ReferenceLineItem[]
): Mismatch[] {
  const issues: Mismatch[] = [];
  const used = new Set<number>();

  for (const refItem of referenceItems) {
    // Find best matching extracted item by description similarity
    let bestIdx = -1;
    let bestSim = 0;
    for (let i = 0; i < extractedItems.length; i++) {
      if (used.has(i)) continue;
      const sim = descriptionSimilarity(extractedItems[i].description, refItem.description);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }

    if (bestIdx === -1 || bestSim < 0.4) {
      issues.push({
        field: 'line_item',
        extracted: null,
        reference: refItem.description,
        note: 'No matching line item found in extracted data'
      });
      continue;
    }

    used.add(bestIdx);
    const ext = extractedItems[bestIdx];
    const prefix = `line_item[${refItem.description.substring(0, 25)}]`;

    if (bestSim < STRING_SIMILARITY_THRESHOLD) {
      issues.push({ field: `${prefix}.description`, extracted: ext.description, reference: refItem.description, note: `Similarity: ${(bestSim * 100).toFixed(1)}%` });
    }

    const qtyIssue = compareNumbers(`${prefix}.quantity`, ext.quantity, refItem.quantity, 0);
    if (qtyIssue) issues.push(qtyIssue);

    const priceIssue = compareNumbers(`${prefix}.unit_price`, ext.unit_price, refItem.unit_price, 0.05);
    if (priceIssue) issues.push(priceIssue);

    const totalIssue = compareNumbers(`${prefix}.line_total`, ext.line_total, refItem.line_total, 0.05);
    if (totalIssue) issues.push(totalIssue);
  }

  // Check for extra items in extracted not in reference
  for (let i = 0; i < extractedItems.length; i++) {
    if (!used.has(i)) {
      issues.push({
        field: 'line_item',
        extracted: extractedItems[i].description,
        reference: null,
        note: 'Extra line item found in extracted data not present in reference'
      });
    }
  }

  return issues;
}

export function validateInvoice(
  extracted: InvoiceData,
  reference: ReferenceRecord | null,
  sourceFile: string,
  matchMethod: string = 'invoice_number'
): ValidationResult {
  if (!reference) {
    return {
      invoice_number: extracted.invoice_number,
      source_file: sourceFile,
      status: 'unmatched',
      extracted,
      reference: null,
      issues: [{ 
        field: 'invoice_number', 
        extracted: extracted.invoice_number, 
        reference: null, 
        note: 'No matching record in reference dataset' }]
    };
  }

  const issues: Mismatch[] = [];

  // Validate internal consistency: does extracted total match sum of line items?
  const computedTotal = extracted.line_items.reduce((sum, item) => sum + (item.line_total ?? 0), 0);
  if (!numbersMatch(computedTotal, extracted.total_amount, 0.10)) {
    issues.push({
      field: 'internal_total_check',
      extracted: round2(computedTotal),
      reference: round2(extracted.total_amount),
      note: 'Extracted line items sum does not match extracted total_amount'
    });
  }

  // Compare fields
  const vendorIssue = compareStrings('vendor_name', extracted.vendor_name, reference.vendor_name);
  if (vendorIssue) issues.push(vendorIssue);

  const clientIssue = compareStrings('client_name', extracted.client_name, reference.client_name);
  if (clientIssue) issues.push(clientIssue);

  const dateIssue = compareStrings('invoice_date', extracted.invoice_date, reference.invoice_date);
  if (dateIssue) issues.push(dateIssue);

  const totalIssue = compareNumbers('total_amount', extracted.total_amount, reference.total_amount, 0.05);
  if (totalIssue) issues.push(totalIssue);

  // Line items
  const lineItemIssues = matchLineItems(extracted.line_items, reference.line_items);
  issues.push(...lineItemIssues);

  let status: ValidationResult['status'];
  if (issues.length === 0) {
    status = 'valid';
  } else if (issues.some(i => i.field === 'total_amount' || i.field === 'invoice_number')) {
    status = 'invalid';
  } else {
    status = 'partially_valid';
  }

  return {
    invoice_number: extracted.invoice_number,
    source_file: sourceFile,
    status,
    extracted,
    reference,
    issues
  };
}

/**
 * Finds the best matching reference record for an extracted invoice.
 * Strategy:
 *   1. Exact invoice number match (primary key)
 *   2. Fallback: vendor + client + date similarity (when invoice number is missing/wrong)
 *   3. Fallback: vendor + client + total amount (when date is also unreliable)
 */
export function findBestMatch(
  extracted: InvoiceData,
  references: ReferenceRecord[]
): { record: ReferenceRecord; method: string } | null {

  // Strategy 1: exact invoice number match
  if (extracted.invoice_number) {
    const exact = references.find(
      r => r.invoice_number.trim() === extracted.invoice_number.trim()
    );
    if (exact) return { record: exact, method: 'invoice_number' };
  }

  // Strategy 2: vendor + client + date similarity
  const byDetails = references
    .map(r => {
      const vendorSim = stringSimilarity(extracted.vendor_name ?? '', r.vendor_name);
      const clientSim = stringSimilarity(extracted.client_name ?? '', r.client_name);
      const dateSim = stringSimilarity(extracted.invoice_date ?? '', r.invoice_date);
      const score = (vendorSim + clientSim + dateSim) / 3;
      return { record: r, score, method: 'vendor_client_date' };
    })
    .filter(m => m.score >= 0.75)
    .sort((a, b) => b.score - a.score);

  if (byDetails.length > 0) {
    return { record: byDetails[0].record, method: byDetails[0].method };
  }

  // Strategy 3: vendor + client + total amount
  const byTotal = references
    .map(r => {
      const vendorSim = stringSimilarity(extracted.vendor_name ?? '', r.vendor_name);
      const clientSim = stringSimilarity(extracted.client_name ?? '', r.client_name);
      const totalMatch = numbersMatch(extracted.total_amount, r.total_amount, 0.10) ? 1 : 0;
      const score = (vendorSim + clientSim + totalMatch) / 3;
      return { record: r, score, method: 'vendor_client_total' };
    })
    .filter(m => m.score >= 0.75)
    .sort((a, b) => b.score - a.score);

  if (byTotal.length > 0) {
    return { record: byTotal[0].record, method: byTotal[0].method };
  }

  return null;
}