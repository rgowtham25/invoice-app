"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const extractor_1 = require("./extractor");
const validator_1 = require("./validator");
async function processInvoices(invoiceDir, referenceFile) {
    // Load reference data
    const referenceData = JSON.parse(fs_1.default.readFileSync(referenceFile, 'utf-8'));
    const referenceMap = new Map(referenceData.map(r => [r.invoice_number, r]));
    // Find invoice images
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const files = fs_1.default.readdirSync(invoiceDir)
        .filter(f => imageExtensions.includes(path_1.default.extname(f).toLowerCase()) && f.startsWith('invoice'))
        .sort();
    if (files.length === 0) {
        console.error('No invoice image files found in directory:', invoiceDir);
        process.exit(1);
    }
    console.log(`Found ${files.length} invoice(s): ${files.join(', ')}\n`);
    const results = [];
    for (const file of files) {
        const imagePath = path_1.default.join(invoiceDir, file);
        console.log(`Processing: ${file}`);
        try {
            console.log(`  Extracting data via AI...`);
            const extracted = await (0, extractor_1.extractInvoiceData)(imagePath);
            console.log(`  Extracted invoice #${extracted.invoice_number}`);
            const reference = referenceMap.get(extracted.invoice_number) ?? null;
            if (reference) {
                console.log(`  Matched to reference record #${reference.invoice_number}`);
            }
            else {
                console.log(`  No reference record found for invoice #${extracted.invoice_number}`);
            }
            const result = (0, validator_1.validateInvoice)(extracted, reference, file);
            console.log(`  Status: ${result.status.toUpperCase()} (${result.issues.length} issue(s))\n`);
            results.push(result);
        }
        catch (err) {
            console.error(`  ERROR processing ${file}:`, err instanceof Error ? err.message : err);
            results.push({
                invoice_number: 'unknown',
                source_file: file,
                status: 'invalid',
                extracted: null,
                reference: null,
                issues: [{ field: 'processing_error', extracted: null, reference: null, note: String(err) }]
            });
        }
    }
    // Output results
    const outputPath = path_1.default.join(invoiceDir, 'results.json');
    fs_1.default.writeFileSync(outputPath, JSON.stringify(results, null, 2));
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
const referenceFile = process.argv[3] ?? path_1.default.join(invoiceDir, 'reference_data.json');
processInvoices(invoiceDir, referenceFile).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
