import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { extractInvoiceData } from './extractor';
import { validateInvoice } from './validator';
import { ReferenceRecord, ValidationResult } from './types';

async function processInvoices(invoiceDir: string, referenceFile: string): Promise<void> {
  // Load reference data
  const referenceData: ReferenceRecord[] = JSON.parse(fs.readFileSync(referenceFile, 'utf-8'));
  const referenceMap = new Map(referenceData.map(r => [r.invoice_number, r]));

  // Find invoice images
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const files = fs.readdirSync(invoiceDir)
    .filter(f => imageExtensions.includes(path.extname(f).toLowerCase()) && f.startsWith('invoice'))
    .sort();

  if (files.length === 0) {
    console.error('No invoice image files found in directory:', invoiceDir);
    process.exit(1);
  }

  console.log(`Found ${files.length} invoice(s): ${files.join(', ')}\n`);

  const results: ValidationResult[] = [];

  for (const file of files) {
    const imagePath = path.join(invoiceDir, file);
    console.log(`Processing: ${file}`);

    try {
      console.log(`  Extracting data via AI...`);
      const extracted = await extractInvoiceData(imagePath);
      console.log(`  Extracted invoice #${extracted.invoice_number}`);

      const reference = referenceMap.get(extracted.invoice_number) ?? null;
      if (reference) {
        console.log(`  Matched to reference record #${reference.invoice_number}`);
      } else {
        console.log(`  No reference record found for invoice #${extracted.invoice_number}`);
      }

      const result = validateInvoice(extracted, reference, file);
      console.log(`  Status: ${result.status.toUpperCase()} (${result.issues.length} issue(s))\n`);
      results.push(result);
    } catch (err) {
      console.error(`  ERROR processing ${file}:`, err instanceof Error ? err.message : err);
      results.push({
        invoice_number: 'unknown',
        source_file: file,
        status: 'invalid',
        extracted: null as any,
        reference: null,
        issues: [{ field: 'processing_error', extracted: null, reference: null, note: String(err) }]
      });
    }
  }

  // Output results
  const outputPath = path.join(invoiceDir, 'results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);

  // Summary
  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    console.log(`  ${r.source_file} → #${r.invoice_number} [${r.status.toUpperCase()}]`);
    for (const issue of r.issues) {
      console.log(`    - ${issue.field}: extracted="${issue.extracted}" reference="${issue.reference}"${issue.note ? ` (${issue.note})` : ''}`);
    }
  }
}

// Get CLI args or use defaults
const invoiceDir = process.argv[2] ?? process.cwd();
const referenceFile = process.argv[3] ?? path.join(invoiceDir, 'reference_data.json');

processInvoices(invoiceDir, referenceFile).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
