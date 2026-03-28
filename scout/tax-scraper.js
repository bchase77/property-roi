#!/usr/bin/env node
// Tarrant County property tax scraper — uses ScrapingBee API to bypass Cloudflare.
//
// Setup: add SCRAPINGBEE_API_KEY=<key> to .env.local (sign up free at scrapingbee.com)
//
// Usage:  node scout/tax-scraper.js              (top 100 Active PAM listings missing tax)
//         node scout/tax-scraper.js --limit 50   (process fewer)
//         node scout/tax-scraper.js --all         (re-fetch even already-fetched ones)
//         node scout/tax-scraper.js --mls MLS123 (single property)
//         node scout/tax-scraper.js --debug       (save raw HTML for inspection)

import { readFileSync, writeFileSync } from 'fs';
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
  } catch { /* no file, use process.env */ }
}
loadEnv('.env.local');
loadEnv('.env');

const DEBUG       = process.argv.includes('--debug');
const REFETCH_ALL = process.argv.includes('--all');
const mlsArg      = process.argv.includes('--mls') ? process.argv[process.argv.indexOf('--mls') + 1] : null;
const limitArg    = process.argv.includes('--limit') ? parseInt(process.argv[process.argv.indexOf('--limit') + 1]) : 100;

const BASE        = 'https://www.tax.tarrantcountytx.gov';
const API_KEY     = process.env.SCRAPINGBEE_API_KEY;

if (!API_KEY) {
  console.error('❌  SCRAPINGBEE_API_KEY not set in .env.local');
  console.error('    Sign up free at https://www.scrapingbee.com and add the key.');
  process.exit(1);
}

// ── Fetch a page via ScrapingBee (handles Cloudflare automatically) ────────────
async function fetchPage(url, label = '') {
  const endpoint = 'https://app.scrapingbee.com/api/v1/?' + new URLSearchParams({
    api_key:   API_KEY,
    url:       url,
    render_js: 'true',  // execute JavaScript so the page fully renders (5 credits/request)
    // premium_proxy: 'true',  // uncomment if CF blocks — costs 25 credits/request instead of 5
  });

  if (DEBUG) console.log(`    ScrapingBee fetch${label ? ' (' + label + ')' : ''}: ${url}`);

  const res = await fetch(endpoint, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ScrapingBee ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.text();
}

function normalizeStreet(address) {
  return address.split(',')[0].trim().toUpperCase()
    .replace(/\bDRIVE\b/g, 'DR').replace(/\bSTREET\b/g, 'ST')
    .replace(/\bAVENUE\b/g, 'AVE').replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bROAD\b/g, 'RD').replace(/\bLANE\b/g, 'LN')
    .replace(/\bCOURT\b/g, 'CT').replace(/\bCIRCLE\b/g, 'CIR')
    .replace(/\bPLACE\b/g, 'PL').replace(/\bTRAIL\b/g, 'TRL')
    .replace(/\bPARKWAY\b/g, 'PKWY');
}

// Strip HTML tags and collapse whitespace to get plain text from an HTML chunk
function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Search Tarrant County for a property and return its account number ─────────
async function findAccountNumber(address) {
  const streetPart   = address.split(',')[0].trim();
  const searchTokens = streetPart.split(/\s+/).slice(0, 2).join(' '); // e.g. "1056 Mesa"
  const url = `${BASE}/Search/Results?Query.SearchField=5&Query.SearchText=${encodeURIComponent(searchTokens)}&Query.SearchAction=&Query.PropertyType=&Query.IncludeInactiveAccounts=False&Query.PayStatus=Both`;

  const html = await fetchPage(url, 'search');

  if (DEBUG) {
    writeFileSync(join(__dirname, 'debug-tax-search.html'), html);
    console.log(`    HTML saved → scout/debug-tax-search.html`);
  }

  const normalTarget = normalizeStreet(address);
  if (DEBUG) console.log(`    Matching against: "${normalTarget}"`);

  // Find all unique account numbers on the page
  const acctMatches = [...html.matchAll(/taxAccountNumber=(\d+)/g)];
  const seen        = new Set();

  for (const m of acctMatches) {
    const acct = m[1];
    if (seen.has(acct)) continue;
    seen.add(acct);

    // Extract a window of HTML around this account number, strip tags → plain text
    const start = Math.max(0, m.index - 300);
    const end   = Math.min(html.length, m.index + 800);
    const chunk = stripTags(html.slice(start, end)).toUpperCase();

    if (DEBUG) console.log(`      acct=${acct} chunk="${chunk.slice(0, 120)}"`);

    if (chunk.includes(normalTarget) ||
        chunk.includes(normalTarget.split(' ').slice(0, 3).join(' '))) {
      if (DEBUG) console.log(`      ✓ Matched!`);
      return acct;
    }
  }

  // Single result fallback
  const unique = [...seen];
  if (unique.length === 1) {
    if (DEBUG) console.log(`    Only one result — using it: ${unique[0]}`);
    return unique[0];
  }

  if (DEBUG) console.log(`    Not matched among ${unique.length} accounts`);
  return null;
}

// ── Get most recent annual tax payment for an account ─────────────────────────
async function fetchPaymentHistory(accountNum) {
  const url  = `${BASE}/Accounts/PaymentHistory?taxAccountNumber=${accountNum}`;
  const html = await fetchPage(url, 'payment history');

  if (DEBUG) {
    writeFileSync(join(__dirname, 'debug-tax-payment.html'), html);
    console.log(`    HTML saved → scout/debug-tax-payment.html`);
  }

  // Strip tags → plain text, then search for dollar amounts near years
  const text = stripTags(html);

  // Match lines containing a dollar amount and a 4-digit year
  const rowPattern = /\$([\d,]+\.\d{2})[^$\n]{0,80}?\b(20\d{2})\b|\b(20\d{2})\b[^$\n]{0,80}?\$([\d,]+\.\d{2})/g;
  const rowMatches = [...text.matchAll(rowPattern)];

  if (DEBUG) console.log(`    Payment row matches: ${rowMatches.length}`);

  let bestYear = 0, bestAmount = null;
  for (const m of rowMatches) {
    const amount = parseFloat((m[1] || m[4]).replace(/,/g, ''));
    const year   = parseInt(m[2] || m[3]);
    if (DEBUG) console.log(`      amount=$${amount} year=${year}`);
    if (amount > 0 && year > bestYear) {
      bestYear  = year;
      bestAmount = amount;
    }
  }

  return { taxAnnual: bestAmount, taxYear: bestYear || null };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🏛  Tarrant County Tax Scraper (via ScrapingBee)');
  console.log('━'.repeat(50));

  // Load properties from DB
  let rows;
  if (mlsArg) {
    const { rows: r } = await sql`SELECT mls_num, address FROM scout_listings WHERE mls_num = ${mlsArg}`;
    rows = r;
  } else if (REFETCH_ALL) {
    const { rows: r } = await sql`
      SELECT mls_num, address FROM scout_listings
      WHERE source = 'pam' AND address IS NOT NULL
        AND (listing_status = 'Active' OR listing_status IS NULL)
        AND price IS NOT NULL
      ORDER BY price DESC
      LIMIT ${limitArg}
    `;
    rows = r;
  } else {
    const { rows: r } = await sql`
      SELECT mls_num, address FROM scout_listings
      WHERE source = 'pam' AND address IS NOT NULL
        AND tax_annual IS NULL
        AND (listing_status = 'Active' OR listing_status IS NULL)
        AND price IS NOT NULL
      ORDER BY price DESC
      LIMIT ${limitArg}
    `;
    rows = r;
  }

  if (!rows.length) {
    console.log('No properties need tax data. Run with --all to re-fetch.');
    return;
  }
  console.log(`  Processing ${rows.length} properties…\n`);

  let found = 0, notFound = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const { mls_num, address } = rows[i];
    process.stdout.write(`  [${i + 1}/${rows.length}] ${address.slice(0, 45).padEnd(45)} `);

    try {
      const accountNum = await findAccountNumber(address);
      if (!accountNum) {
        console.log('— not found');
        notFound++;
        continue;
      }

      const { taxAnnual, taxYear } = await fetchPaymentHistory(accountNum);
      const now = new Date().toISOString();

      await sql`
        UPDATE scout_listings
        SET tax_account_num = ${accountNum},
            tax_annual      = ${taxAnnual},
            tax_fetched_at  = ${now}
        WHERE mls_num = ${mls_num}
      `;

      if (taxAnnual) {
        console.log(`$${taxAnnual.toLocaleString()} (${taxYear}) — acct ${accountNum}`);
        found++;
      } else {
        console.log(`acct ${accountNum} found, no payment data`);
        notFound++;
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      errors++;
    }

    // Polite delay between properties
    await new Promise(r => setTimeout(r, 800));
  }

  console.log('\n' + '━'.repeat(50));
  console.log(`✅  Done — ${found} updated, ${notFound} not found, ${errors} errors`);
}

main().catch(err => { console.error(err); process.exit(1); });
