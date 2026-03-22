# Invoice Data Extraction & Validation System

A Node.js/TypeScript system that uses AI vision models (via OpenRouter) to extract structured data from invoice images, then validates the extracted data against a reference dataset using fuzzy string matching and numeric tolerance checks.

---

## Project Overview

This system automates invoice processing by:

1. Reading invoice images (JPG, PNG, WebP) from a directory
2. Sending each image to the `google/gemini-2.0-flash-001` model via the OpenRouter API for structured data extraction
3. Matching each extracted invoice to a reference record using a 3-strategy fallback system (invoice number, then vendor+client+date, then vendor+client+total)
4. Validating extracted fields (vendor, client, date, totals, line items) against the reference
5. Outputting a detailed `results.json` with per-invoice validation status and issue details

---

## File Structure

```
invoice-app/
├── src/
│   ├── index.ts        # Entry point: orchestrates extraction and validation
│   ├── extractor.ts    # AI-powered invoice data extraction via OpenRouter API
│   ├── validator.ts    # Validation logic: field comparison, line item matching, and reference matching
│   ├── server.ts       # Optional Express API server for programmatic access
│   ├── types.ts        # TypeScript interfaces for all data structures
│   └── utils.ts        # Fuzzy string matching, Levenshtein distance, numeric helpers
├── package.json
├── tsconfig.json
├── .env.example        # Template for environment variables
└── README.md
```

---

## Setup Instructions

### Prerequisites

- Node.js v18 or higher (for native `fetch` support)
- npm v8 or higher
- An OpenRouter API key (sign up at https://openrouter.ai)

### 1. Install Dependencies

```bash
cd invoice-app
npm install
```

### 2. Configure Environment Variables

Create a `.env` file and fill in your API key:

```
OPENROUTER_API_KEY=your_actual_openrouter_api_key_here
```

---

## Usage

### Development Mode

Run directly without compiling:

```bash
npm run dev
```

By default, the app looks for invoice images and `reference_data.json` in the current working directory.

To specify a custom directory:

```bash
npx ts-node src/index.ts /path/to/invoices /path/to/reference_data.json
```

### Production Mode (compiled)

```bash
npm run build
npm start
# or with custom paths:
node dist/index.js /path/to/invoices /path/to/reference_data.json
```

### Input Files

- **Invoice images**: Any files named with the `invoice` prefix — `invoice*.jpg`, `invoice*.jpeg`, `invoice*.png`, or `invoice*.webp`
- **Reference data**: A JSON file containing an array of `ReferenceRecord` objects (see `src/types.ts`)

### Output

The system writes `results.json` to the invoice directory and prints a summary to stdout.

---

## Extraction Strategy

Each invoice image is encoded as a base64 string and sent to the OpenRouter API using the `google/gemini-2.0-flash-001` vision model.

**Prompt design:**
- A system prompt instructs the model to return ONLY valid JSON with no markdown, no explanations
- The user prompt provides the exact JSON schema and explicit rules: missing fields must be returned as `null`, never as `""` or `"N/A"`
- Temperature is set to `0.1` for deterministic, structured output
- The response is post-processed to strip any accidental markdown code fences before JSON parsing

**Extracted fields:**
- `invoice_number`, `invoice_date` (normalized to YYYY-MM-DD or null)
- `vendor_name`, `vendor_details` (address, phone, email)
- `client_name`, `client_details`
- `currency`, `net_total`, `vat_total`, `total_amount`
- `line_items[]`: description, quantity, unit_of_measure, unit_price, net_worth, vat_percent, line_total

---

## Matching Strategy

In real-world scenarios, invoice numbers can be missing, misread by the AI, or inconsistent across systems. To handle this, matching uses a 3-strategy waterfall — each strategy is tried in order and stops as soon as a confident match is found.

### Strategy 1 — Exact Invoice Number Match
The extracted invoice number is compared directly against the reference dataset. This is the primary and fastest path, covering most clean invoices.

### Strategy 2 — Vendor + Client + Date Similarity
Used when the invoice number is missing or incorrect. The system computes fuzzy similarity scores for vendor name, client name, and invoice date separately, then averages them. A combined score above 75% is required for a match.

This handles cases where the AI misreads the invoice number but correctly extracts the other fields.

### Strategy 3 — Vendor + Client + Total Amount
Used when both invoice number and date are unreliable or absent. The date signal is replaced with total amount as the third matching criterion. If vendor and client names are similar AND the total amount matches within ±$0.10, the invoice is matched.

This handles invoices where the date field is physically not present on the document.

If all three strategies fail, the invoice is marked `unmatched`.

---

## Validation Logic

### Field Comparison

| Field | Method | Tolerance |
|-------|--------|-----------|
| `vendor_name` | Fuzzy string similarity (Levenshtein) | Threshold: 75% |
| `client_name` | Fuzzy string similarity (Levenshtein) | Threshold: 75% |
| `invoice_date` | Fuzzy string similarity (Levenshtein) | Threshold: 75% |
| `total_amount` | Numeric comparison | ±$0.05 |

### Internal Consistency Check

The sum of all `line_item.line_total` values is compared to `total_amount`. A mismatch greater than $0.10 is flagged as `internal_total_check`.

### Line Item Matching

Line items are matched using best-fit description similarity (Levenshtein + word coverage). For each matched pair:

- `description`: similarity threshold 75%
- `quantity`: exact match
- `unit_price`: tolerance ±$0.05
- `line_total`: tolerance ±$0.05

Unmatched reference items and extra extracted items are both reported as issues.

### Fuzzy String Matching

Strings are normalized before comparison:
- Lowercased
- Punctuation (`&`, `,`, `.`) replaced with spaces
- Whitespace collapsed

Similarity score = `1 - (levenshtein_distance / max_string_length)`, ranging from 0.0 (completely different) to 1.0 (identical).

---

## Validation Status

| Status | Meaning |
|--------|---------|
| `valid` | All fields match within tolerance, no issues |
| `partially_valid` | Minor discrepancies in names, descriptions, or internal totals |
| `invalid` | Critical mismatch in `total_amount`, or processing error |
| `unmatched` | No matching reference record found across all 3 strategies |

---

## Output Format

`results.json` is an array of `ValidationResult` objects:

```json
[
  {
    "invoice_number": "61356291",
    "source_file": "invoice_1.jpg",
    "status": "valid",
    "extracted": { ... },
    "reference": { ... },
    "issues": []
  },
  {
    "invoice_number": "40378170",
    "source_file": "invoice_2.jpg",
    "status": "partially_valid",
    "extracted": { ... },
    "reference": { ... },
    "issues": [
      {
        "field": "vendor_name",
        "extracted": "Patel Thompson and Montgomery",
        "reference": "Patel Thompson & Montgomery",
        "note": "Similarity: 91.2%"
      }
    ]
  }
]
```

---

## Assumptions

1. **Invoice images are named with the `invoice` prefix** (e.g., `invoice_1.jpg`). Files not matching this pattern are ignored.
2. **Invoice numbers are preferred for matching but not required.** The system falls back to vendor, client, date, and total amount when the invoice number is missing or incorrect.
3. **Missing fields are returned as `null` by the AI model.** The extraction prompt explicitly instructs the model never to return empty strings or placeholder values for missing data.
4. **Dates are normalized to YYYY-MM-DD format.** The AI model is prompted to normalize dates; results may vary for unusual date formats.
5. **Currency is extracted from the image** but not validated against the reference.
6. **Node.js v18+ is required** for the native `fetch` API used in `extractor.ts`.
7. **The OpenRouter API key must have sufficient credits** to process all invoices. Each invoice image incurs one API call.

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `dotenv` | Load environment variables from `.env` file |
| `express` | Optional REST API server |
| `multer` | File upload handling for the optional server |
| `typescript` | TypeScript compiler |
| `ts-node` | Run TypeScript directly without pre-compilation |
| `@types/node` | Node.js type definitions |
