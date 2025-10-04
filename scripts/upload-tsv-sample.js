/*
Node script to validate a TSV/CSV snippet and POST it to the Next.js bulk upload route
Usage:
  # With embedded sample (default):
  node scripts/upload-tsv-sample.js

  # With a file path (tab- or comma-separated):
  node scripts/upload-tsv-sample.js path/to/file.tsv

Requires Node 18+ (for global fetch). The script defaults to http://localhost:3001/ — change with the BULK_URL env var if your server is on a different host or port.
*/

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_URL = 'http://localhost:3001/api/actuals/bulk';

const sample = `propertyId	year	grossIncome	totalExpenses	depreciation
4	2012	7975	8528	1756
4	2013	8700	7297	1833
4	2014	8879	7454	1833
`;

function parseText(text) {
  // Try to detect delimiter: tab or comma
  const delim = text.includes('\t') ? '\t' : ',';
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { error: 'no lines' };
  const headers = lines[0].split(delim).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delim);
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = (cols[j] !== undefined) ? cols[j].trim() : '';
    }
    rows.push(obj);
  }
  return { headers, rows };
}

function validateAndNormalize(rows) {
  const cleaned = [];
  const problems = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2; // account for header line
    const out = {};
    // expected keys: propertyId, year, grossIncome, totalExpenses, depreciation
    const pid = r.propertyId ?? r.property_id ?? r.propertyID ?? '';
    const year = r.year ?? '';
    if (!pid) problems.push(`${rowNum}: missing propertyId`);
    if (!year) problems.push(`${rowNum}: missing year`);
    const pidN = Number(pid);
    const yearN = Number(year);
    if (!Number.isFinite(pidN) || !Number.isInteger(pidN)) problems.push(`${rowNum}: invalid propertyId -> ${pid}`);
    if (!Number.isFinite(yearN) || !Number.isInteger(yearN)) problems.push(`${rowNum}: invalid year -> ${year}`);
    out.propertyId = pidN;
    out.year = yearN;

    const gross = r.grossIncome ?? r.gross_income ?? r.gross ?? '';
    const expenses = r.totalExpenses ?? r.total_expenses ?? r.totalExpense ?? '';
    const depr = r.depreciation ?? '';

    function toNum(val) {
      if (val === null || val === undefined || String(val).trim() === '') return 0;
      const n = Number(String(val).replace(/[,\$]/g, ''));
      return Number.isFinite(n) ? n : NaN;
    }

    const grossN = toNum(gross);
    const expensesN = toNum(expenses);
    const deprN = toNum(depr);

    if (Number.isNaN(grossN)) problems.push(`${rowNum}: invalid grossIncome -> ${gross}`);
    if (Number.isNaN(expensesN)) problems.push(`${rowNum}: invalid totalExpenses -> ${expenses}`);
    if (Number.isNaN(deprN)) problems.push(`${rowNum}: invalid depreciation -> ${depr}`);

    out.grossIncome = grossN;
    out.totalExpenses = expensesN;
    out.depreciation = deprN;

    cleaned.push(out);
  }
  return { cleaned, problems };
}

async function postRows(rows, url = DEFAULT_URL) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
    const contentType = res.headers.get('content-type') || '';
    let body;
    if (contentType.includes('application/json')) {
      body = await res.json();
    } else {
      body = await res.text();
    }
    console.log('Response status:', res.status);
    console.log('Response body:', body);
    return { status: res.status, body };
  } catch (err) {
    console.error('Request failed:', err.message || err);
    throw err;
  }
}

async function main() {
  const arg = process.argv[2];
  const url = process.env.BULK_URL || DEFAULT_URL;
  let text;
  if (!arg) {
    console.log('No file provided — using embedded sample. To use a file: node scripts/upload-tsv-sample.js path/to/file.tsv');
    text = sample;
  } else {
    const p = path.resolve(process.cwd(), arg);
    if (!fs.existsSync(p)) {
      console.error('File not found:', p);
      process.exit(2);
    }
    text = fs.readFileSync(p, 'utf8');
  }

  const parsed = parseText(text);
  if (parsed.error) {
    console.error('Parse error:', parsed.error);
    process.exit(2);
  }
  console.log('Detected headers:', parsed.headers.join(', '));
  const { cleaned, problems } = validateAndNormalize(parsed.rows);
  if (problems.length) {
    console.error('Validation problems found:');
    problems.forEach(p => console.error(' -', p));
    console.error('Please fix the rows before uploading.');
    process.exit(3);
  }

  console.log('Posting', cleaned.length, 'rows to', url);
  await postRows(cleaned, url);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
