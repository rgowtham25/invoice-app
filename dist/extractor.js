"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractInvoiceData = extractInvoiceData;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'google/gemini-2.0-flash-001';
async function extractInvoiceData(imagePath) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey)
        throw new Error('OPENROUTER_API_KEY is not set');
    const imageBuffer = fs_1.default.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const ext = path_1.default.extname(imagePath).toLowerCase().replace('.', '');
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
    const systemPrompt = `You are an invoice data extraction assistant. Extract structured data from invoice images and return ONLY valid JSON with no markdown, no code blocks, no explanation.`;
    const userPrompt = `Extract all data from this invoice image and return a JSON object with exactly this structure:
{
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD format",
  "vendor_name": "string",
  "vendor_details": "string (address, email, phone if present)",
  "client_name": "string",
  "client_details": "string (address if present)",
  "currency": "USD/EUR/etc",
  "net_total": number or null,
  "vat_total": number or null,
  "total_amount": number,
  "line_items": [
    {
      "description": "string",
      "quantity": number,
      "unit_of_measure": "string or null",
      "unit_price": number,
      "net_worth": number or null,
      "vat_percent": number or null,
      "line_total": number
    }
  ]
}

Return ONLY the JSON object, no other text.`;
    const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/invoice-extractor',
            'X-Title': 'Invoice Extractor'
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: { url: `data:${mimeType};base64,${base64Image}` }
                        },
                        { type: 'text', text: userPrompt }
                    ]
                }
            ],
            temperature: 0.1,
            max_tokens: 2000
        })
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenRouter API error ${response.status}: ${err}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    // Strip markdown code blocks if present
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try {
        return JSON.parse(cleaned);
    }
    catch {
        throw new Error(`Failed to parse extracted JSON: ${cleaned}`);
    }
}
