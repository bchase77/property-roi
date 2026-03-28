#!/usr/bin/env node
// TAD bulk data import: match scout_listings addresses to TAD account numbers
// Downloads: tad.org/data-download/ → PropertyData_R_YYYY.txt (pipe-delimited)
//
// Usage:
//   node scout/tad-import.js --dry-run          (preview matches, no DB writes)
//   node scout/tad-import.js                    (update DB)
//   node scout/tad-import.js --file path/to/PropertyData_R_2026.txt

import { createReadStream, readFileSync, readdirSync, statSync } from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sql } from '@vercel/postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(filename) {
  try {
    const content = readFileSync(join(__dirname, '..', filename), 'utf8');
    content.split('\n').forEach(line => {
      const eq = line.indexOf('=');
      if (eq > 0 && !line.startsWith('#')) {
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim();
        if (key) process.env[key] = val;
      }
    });
  } catch { /* no file */ }
}
loadEnv('.env.local');
loadEnv('.env');

const DRY_RUN   = process.argv.includes('--dry-run');
const fileArg   = process.argv.includes('--file')
  ? process.argv[process.argv.indexOf('--file') + 1]
  : null;

// Default: look for the most recently modified PropertyData_R_*.txt in scout/PropertyData-TarrantCounty/
function findDefaultFile() {
  const dir = join(__dirname, 'PropertyData-TarrantCounty');
  try {
    const files = readdirSync(dir)
      .filter(f => f.startsWith('PropertyData_R_') && f.endsWith('.txt'))
      .map(f => ({ name: f, mtime: statSync(join(dir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    return files.length ? join(dir, files[0].name) : null;
  } catch { return null; }
}

// ── Address normalization (same rules as tax-scraper.js) ─────────────────────
function normalizeAddr(raw) {
  return (raw || '').split(',')[0].trim().toUpperCase()
    .replace(/\bDRIVE\b/g,   'DR')   .replace(/\bSTREET\b/g,  'ST')
    .replace(/\bAVENUE\b/g,  'AVE')  .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bROAD\b/g,    'RD')   .replace(/\bLANE\b/g,    'LN')
    .replace(/\bCOURT\b/g,   'CT')   .replace(/\bCIRCLE\b/g,  'CIR')
    .replace(/\bPLACE\b/g,   'PL')   .replace(/\bTRAIL\b/g,   'TRL')
    .replace(/\bPARKWAY\b/g, 'PKWY') .replace(/\bTERRACE\b/g, 'TER')
    .replace(/\bCOURT\b/g,   'CT')   .replace(/\bWAY\b/g,     'WAY')
    .replace(/\s+/g, ' ').trim();
}

// Partial key: house number + first word of street name (direction-insensitive fallback)
function partialKey(norm) {
  const parts = norm.split(' ');
  // Skip directional prefix if present (N, S, E, W, NW, NE, SW, SE)
  const dirRe = /^(N|S|E|W|NW|NE|SW|SE)$/;
  if (parts.length >= 3 && dirRe.test(parts[1])) {
    return `${parts[0]} ${parts[2]}`; // e.g. "500 15TH"
  }
  return `${parts[0]} ${parts[1] || ''}`; // e.g. "7454 COACHWOOD"
}

// ── Parse TAD pipe-delimited file ─────────────────────────────────────────────
// Columns (1-indexed): 3=Account_Num, 13=Situs_Address, 53=Appraised_Value
async function parseTADFile(filePath) {
  console.log(`  Reading: ${filePath}`);
  const byAddr    = new Map(); // normalizedAddr → {acct, appraised}
  const byPartial = new Map(); // partialKey → [{acct, appraised, addr}]
  let total = 0;

  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  let first = true;

  for await (const line of rl) {
    if (first) { first = false; continue; } // skip header
    if (!line.startsWith('R|')) continue;   // skip non-property rows

    const cols = line.split('|');
    const acct      = (cols[2]  || '').trim();
    const situsAddr = (cols[12] || '').trim();
    const appraised = parseInt((cols[52] || '0').trim(), 10) || 0;

    if (!acct || !situsAddr) continue;
    total++;

    const norm    = normalizeAddr(situsAddr);
    const partial = partialKey(norm);

    byAddr.set(norm, { acct, appraised, raw: situsAddr });

    if (!byPartial.has(partial)) byPartial.set(partial, []);
    byPartial.get(partial).push({ acct, appraised, raw: situsAddr, norm });
  }

  console.log(`  Parsed ${total.toLocaleString()} TAD properties`);
  return { byAddr, byPartial };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`🏛  TAD Account Number Import${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log('━'.repeat(50));

  const filePath = fileArg || findDefaultFile();
  if (!filePath) {
    console.error('No TAD file found. Download PropertyData_R_YYYY.txt from tad.org/data-download/');
    console.error('and place it in scout/PropertyData-TarrantCounty/, or use --file <path>');
    process.exit(1);
  }

  const { byAddr, byPartial } = await parseTADFile(filePath);

  // Load all listings from DB
  const { rows } = await sql`
    SELECT mls_num, address, tax_account_num FROM scout_listings
    WHERE address IS NOT NULL
    ORDER BY address
  `;
  console.log(`  Loaded ${rows.length.toLocaleString()} listings from DB\n`);

  let exactMatches = 0, partialMatches = 0, noMatch = 0, alreadyHad = 0, skipped = 0;
  const updates = [];
  const unmatched = [];

  for (const row of rows) {
    if (row.tax_account_num) { alreadyHad++; continue; }

    const norm    = normalizeAddr(row.address);
    const partial = partialKey(norm);

    // 1. Exact normalized match
    const exact = byAddr.get(norm);
    if (exact) {
      updates.push({ mls_num: row.mls_num, acct: exact.acct, appraised: exact.appraised, how: 'exact', tadAddr: exact.raw, ourAddr: row.address });
      exactMatches++;
      continue;
    }

    // 2. Partial key match (house# + first street word) — only use if unique
    const candidates = byPartial.get(partial) || [];
    if (candidates.length === 1) {
      updates.push({ mls_num: row.mls_num, acct: candidates[0].acct, appraised: candidates[0].appraised, how: 'partial', tadAddr: candidates[0].raw, ourAddr: row.address });
      partialMatches++;
      continue;
    }

    noMatch++;
    unmatched.push({ mls_num: row.mls_num, address: row.address, candidates: candidates.length });
  }

  console.log(`  Results:`);
  console.log(`    Already had account #:  ${alreadyHad.toLocaleString()}`);
  console.log(`    Exact matches:          ${exactMatches.toLocaleString()}`);
  console.log(`    Partial matches:        ${partialMatches.toLocaleString()}`);
  console.log(`    No match found:         ${noMatch.toLocaleString()}`);
  console.log(`    Total to update:        ${updates.length.toLocaleString()}`);

  if (DRY_RUN) {
    console.log('\n  Sample matches (first 20):');
    updates.slice(0, 20).forEach(u =>
      console.log(`    [${u.how}] ${u.ourAddr.slice(0,40).padEnd(40)} → ${u.acct}  (TAD: ${u.tadAddr.trim()})`)
    );
    if (unmatched.length) {
      console.log(`\n  Sample unmatched (first 20):`);
      unmatched.slice(0, 20).forEach(u =>
        console.log(`    ${u.address.slice(0,50)} (${u.candidates} partial candidates)`)
      );
    }
    console.log('\n  Run without --dry-run to apply updates.');
    return;
  }

  // Apply updates in batches
  console.log('\n  Updating DB…');
  let done = 0;
  for (const u of updates) {
    await sql`
      UPDATE scout_listings
      SET tax_account_num = ${u.acct}
      WHERE mls_num = ${u.mls_num} AND tax_account_num IS NULL
    `;
    done++;
    if (done % 100 === 0) process.stdout.write(`\r    ${done}/${updates.length}…`);
  }

  console.log(`\r  ✅ Updated ${done.toLocaleString()} listings with TAD account numbers`);
  if (unmatched.length) {
    console.log(`  ⚠️  ${unmatched.length} listings had no match — check addresses or add account# manually`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
