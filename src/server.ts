import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { extractInvoiceData } from './extractor';
import { validateInvoice, findBestMatch } from './validator';
import { ReferenceRecord, ValidationResult } from './types';

const app = express();
const PORT = process.env.PORT ?? 3000;

// Multer: store uploads in a temp dir, keep original filename
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'invoices-'));
    cb(null, tmpDir);
  },
  filename: (_req, file, cb) => cb(null, file.originalname)
});
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  }
});

// Load reference data once at startup
const referenceFile = path.join(process.cwd(), 'reference_data.json');
let referenceData: ReferenceRecord[] = [];
if (fs.existsSync(referenceFile)) {
  referenceData = JSON.parse(fs.readFileSync(referenceFile, 'utf-8'));
}

// POST /api/process — accepts multiple invoice image files
app.post('/api/process', upload.array('invoices'), async (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).json({ error: 'No invoice files uploaded' });
    return;
  }

  const results: ValidationResult[] = [];
  const errors: { file: string; error: string }[] = [];

  for (const file of files) {
    try {
      const extracted = await extractInvoiceData(file.path);
      const match = findBestMatch(extracted, referenceData);
      const reference = match?.record ?? null;
      const matchMethod = match?.method ?? 'none';
      const result = validateInvoice(extracted, reference, file.originalname, matchMethod);
      results.push(result);
    } catch (err) {
      errors.push({ file: file.originalname, error: err instanceof Error ? err.message : String(err) });
    } finally {
      // Clean up temp file
      try { fs.unlinkSync(file.path); } catch {}
    }
  }

  res.json({ results, errors });
});

app.listen(PORT, () => {
  console.log(`Invoice Extractor running at http://localhost:${PORT}`);
});