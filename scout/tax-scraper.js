#!/usr/bin/env node
// Tarrant County property tax scraper
// Looks up real annual tax payments for Scout listings from the county website.
//
// Usage:  node scout/tax-scraper.js              (top 100 by price, Active PAM listings)
//         node scout/tax-scraper.js --limit 50   (process fewer)
//         node scout/tax-scraper.js --all         (re-fetch even already-fetched ones)
//         node scout/tax-scraper.js --mls MLS123 (single property)
//         node scout/tax-scraper.js --debug       (headed browser)

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
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

const BASE = 'https://www.tax.tarrantcountytx.gov';

function normalizeStreet(address) {
  return address.split(',')[0].trim().toUpperCase()
    .replace(/\bDRIVE\b/g, 'DR').replace(/\bSTREET\b/g, 'ST')
    .replace(/\bAVENUE\b/g, 'AVE').replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bROAD\b/g, 'RD').replace(/\bLANE\b/g, 'LN')
    .replace(/\bCOURT\b/g, 'CT').replace(/\bCIRCLE\b/g, 'CIR')
    .replace(/\bPLACE\b/g, 'PL').replace(/\bTRAIL\b/g, 'TRL')
    .replace(/\bPARKWAY\b/g, 'PKWY');
}

// ── Search Tarrant County for a property and return its account number ─────────
async function findAccountNumber(page, address) {
  const streetPart = address.split(',')[0].trim();
  const searchTokens = streetPart.split(/\s+/).slice(0, 3).join(' ');
  const url = `${BASE}/Search/Results?Query.SearchField=5&Query.SearchText=${encodeURIComponent(searchTokens)}&Query.SearchAction=&Query.PropertyType=&Query.IncludeInactiveAccounts=False&Query.PayStatus=Both`;

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(3000);

  // Get all property cards
  const cards = await page.$$eval('[class*="card"], [class*="result"], li', els =>
    els.map(el => ({
      text: el.innerText,
      detailHref: el.querySelector('a[href*="AccountDetails"]')?.getAttribute('href') ?? '',
    })).filter(c => c.detailHref)
  );

  if (!cards.length) {
    // Fallback: extract from page HTML directly
    const html = await page.content();
    const accountMatch = html.match(/taxAccountNumber=(\d+)/);
    if (accountMatch) return accountMatch[1];
    return null;
  }

  const normalTarget = normalizeStreet(address);

  // Find exact match by property location text
  for (const card of cards) {
    const cardText = card.text.toUpperCase();
    if (cardText.includes(normalTarget)) {
      const m = card.detailHref.match(/taxAccountNumber=(\d+)/);
      if (m) return m[1];
    }
  }

  // Partial match: house number + first street word
  const tokens = normalTarget.split(' ');
  const partial = tokens.slice(0, 2).join(' '); // e.g. "2717 LAUREL"
  for (const card of cards) {
    if (card.text.toUpperCase().includes(partial)) {
      const m = card.detailHref.match(/taxAccountNumber=(\d+)/);
      if (m) return m[1];
    }
  }

  // Last resort: if only one result, use it
  if (cards.length === 1) {
    const m = cards[0].detailHref.match(/taxAccountNumber=(\d+)/);
    if (m) return m[1];
  }

  return null;
}

// ── Get most recent annual tax payment for an account ─────────────────────────
async function fetchPaymentHistory(page, accountNum) {
  // Try direct payment history URL first
  const histUrl = `${BASE}/Accounts/PaymentHistory?taxAccountNumber=${accountNum}`;
  await page.goto(histUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(2000);

  let html = await page.content();

  // If that didn't work, go to account details and click the button
  if (!html.includes('PAYMENT DATE') && !html.includes('Payment Date')) {
    await page.goto(`${BASE}/Accounts/AccountDetails?taxAccountNumber=${accountNum}`, {
      waitUntil: 'domcontentloaded', timeout: 30_000,
    });
    await page.waitForTimeout(2000);

    const btn = await page.$('a:has-text("Payment History"), button:has-text("Payment History"), a:has-text("PAYMENT HISTORY")');
    if (btn) {
      await btn.click();
      await page.waitForTimeout(2000);
      html = await page.content();
    }
  }

  // Parse payment rows: find most recent year with a positive payment
  // Rows contain: date, amount ($X,XXX.XX), tax year, payer
  const rowMatches = [...html.matchAll(/(\d{1,2}\/\d{1,2}\/\d{4})[^$\d]*\$\s*([\d,]+\.\d{2})[^<]*<[^>]*>\s*(\d{4})/g)];

  let bestYear = 0, bestAmount = null;
  for (const m of rowMatches) {
    const amount = parseFloat(m[2].replace(/,/g, ''));
    const year = parseInt(m[3]);
    if (amount > 0 && year > bestYear) {
      bestYear = year;
      bestAmount = amount;
    }
  }

  // Also try table row parsing via DOM
  if (!bestAmount) {
    const rows = await page.$$eval('table tr, .payment-row, [class*="row"]', rows =>
      rows.map(r => r.innerText).filter(t => /\$[\d,]+\.\d{2}/.test(t) && /\d{4}/.test(t))
    );
    for (const rowText of rows) {
      const amtMatch = rowText.match(/\$([\d,]+\.\d{2})/);
      const yearMatch = rowText.match(/\b(20\d{2})\b/);
      if (amtMatch && yearMatch) {
        const amount = parseFloat(amtMatch[1].replace(/,/g, ''));
        const year = parseInt(yearMatch[1]);
        if (amount > 0 && year > bestYear) {
          bestYear = year;
          bestAmount = amount;
        }
      }
    }
  }

  return { taxAnnual: bestAmount, taxYear: bestYear || null };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🏛  Tarrant County Tax Scraper');
  console.log('━'.repeat(50));

  // Load properties from DB
  let rows;
  if (mlsArg) {
    const { rows: r } = await sql`SELECT mls_num, address FROM scout_listings WHERE mls_num = ${mlsArg}`;
    rows = r;
  } else {
    const condition = REFETCH_ALL
      ? sql`source = 'pam' AND address IS NOT NULL`
      : sql`source = 'pam' AND address IS NOT NULL AND tax_annual IS NULL`;
    const { rows: r } = await sql`
      SELECT mls_num, address FROM scout_listings
      WHERE ${condition}
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

  const browser = await chromium.launch({
    headless: !DEBUG,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  });
  const page = await context.newPage();

  let found = 0, notFound = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const { mls_num, address } = rows[i];
    process.stdout.write(`  [${i + 1}/${rows.length}] ${address.slice(0, 45).padEnd(45)} `);

    try {
      const accountNum = await findAccountNumber(page, address);
      if (!accountNum) {
        console.log('— not found');
        notFound++;
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      const { taxAnnual, taxYear } = await fetchPaymentHistory(page, accountNum);
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
    await new Promise(r => setTimeout(r, 1200));
  }

  await browser.close();

  console.log('\n' + '━'.repeat(50));
  console.log(`✅  Done — ${found} updated, ${notFound} not found, ${errors} errors`);
}

main().catch(err => { console.error(err); process.exit(1); });
