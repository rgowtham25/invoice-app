export interface LineItem {
  description: string;
  quantity: number;
  unit_of_measure?: string;
  unit_price: number;
  net_worth?: number;
  vat_percent?: number;
  line_total: number;
}

export interface InvoiceData {
  invoice_number: string;
  invoice_date: string;
  vendor_name: string;
  vendor_details?: string;
  client_name: string;
  client_details?: string;
  currency?: string;
  net_total?: number;
  vat_total?: number;
  total_amount: number;
  line_items: LineItem[];
}

export interface ReferenceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface ReferenceRecord {
  invoice_number: string;
  vendor_name: string;
  client_name: string;
  invoice_date: string;
  total_amount: number;
  currency: string;
  line_items: ReferenceLineItem[];
}

export interface Mismatch {
  field: string;
  extracted: string | number | null;
  reference: string | number | null;
  note?: string;
}

export interface ValidationResult {
  invoice_number: string;
  source_file: string;
  status: 'valid' | 'partially_valid' | 'invalid' | 'unmatched';
  extracted: InvoiceData;
  reference: ReferenceRecord | null;
  issues: Mismatch[];
}
