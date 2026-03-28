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

// ── Wait for Cloudflare challenge to clear ─────────────────────────────────────
// Cloudflare Turnstile shows an iframe with challenges.cloudflare.com.
// We poll until it's gone and actual page content has loaded.
async function waitForCloudflare(page, label = '') {
  const MAX_WAIT = 30_000; // 30s total
  const POLL    = 800;
  const start   = Date.now();

  while (Date.now() - start < MAX_WAIT) {
    const title = await page.title().catch(() => '');
    const hasCF = await page.$('iframe[src*="challenges.cloudflare.com"], #cf-wrapper, #cf-challenge-running').catch(() => null);
    const isChallengePage = title.toLowerCase().includes('just a moment') || title.toLowerCase().includes('checking your browser');

    if (!hasCF && !isChallengePage) {
      if (label) console.log(`    Cloudflare clear (${Date.now() - start}ms)${label ? ' — ' + label : ''}`);
      return;
    }
    console.log(`    Waiting for Cloudflare challenge… (title: "${title}")`);
    await page.waitForTimeout(POLL);
  }
  console.log(`    WARNING: Cloudflare challenge may not have cleared after ${MAX_WAIT}ms`);
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

// ── Search Tarrant County for a property and return its account number ─────────
async function findAccountNumber(page, address) {
  const streetPart = address.split(',')[0].trim();
  const searchTokens = streetPart.split(/\s+/).slice(0, 2).join(' '); // e.g. "2717 Laurel"
  const url = `${BASE}/Search/Results?Query.SearchField=5&Query.SearchText=${encodeURIComponent(searchTokens)}&Query.SearchAction=&Query.PropertyType=&Query.IncludeInactiveAccounts=False&Query.PayStatus=Both`;

  console.log(`    Search: "${searchTokens}" → ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForCloudflare(page, 'search results');
  await page.waitForTimeout(1500);

  // Extract all AccountDetails links and their surrounding text from the page HTML
  const html = await page.content();
  const allAccountLinks = [...html.matchAll(/taxAccountNumber=(\d+)/g)].map(m => m[1]);
  console.log(`    Found ${allAccountLinks.length} account link(s) on page`);

  // Build cards from links by finding nearby property location text
  // Each card in the HTML has the account number and a PROPERTY LOCATION label nearby
  const cardPattern = /taxAccountNumber=(\d+)[\s\S]{0,600}?(?:PROPERTY LOCATION|Property Location)[^>]*>([^<]{3,60})</gi;
  const cardMatches = [...html.matchAll(cardPattern)];
  console.log(`    Parsed ${cardMatches.length} card(s) with location text`);

  const normalTarget = normalizeStreet(address);
  console.log(`    Matching against: "${normalTarget}"`);

  for (const m of cardMatches) {
    const acct = m[1];
    const loc  = m[2].trim().toUpperCase();
    console.log(`      Card: acct=${acct} loc="${loc}"`);
    if (loc === normalTarget || loc.includes(normalTarget.split(' ').slice(0, 3).join(' '))) {
      console.log(`      ✓ Matched!`);
      return acct;
    }
  }

  // Fallback: try reversed order (location before account number)
  const revPattern = /(?:PROPERTY LOCATION|Property Location)[^>]*>([^<]{3,60})<[\s\S]{0,600}?taxAccountNumber=(\d+)/gi;
  const revMatches = [...html.matchAll(revPattern)];
  for (const m of revMatches) {
    const loc  = m[1].trim().toUpperCase();
    const acct = m[2];
    if (loc === normalTarget || loc.includes(normalTarget.split(' ').slice(0, 3).join(' '))) {
      console.log(`      ✓ Matched (reversed)! acct=${acct}`);
      return acct;
    }
  }

  // Last resort: single result on page
  if (allAccountLinks.length === 1) {
    console.log(`    Only one result — using it: ${allAccountLinks[0]}`);
    return allAccountLinks[0];
  }

  // Show first few chars of HTML to help diagnose selector issues
  if (DEBUG) {
    const { writeFileSync } = await import('fs');
    const { join } = await import('path');
    writeFileSync(join(__dirname, 'debug-tax-search.html'), html);
    console.log(`    HTML saved → scout/debug-tax-search.html`);
  } else {
    console.log(`    (run with --debug to save search HTML for inspection)`);
  }

  return null;
}

// ── Get most recent annual tax payment for an account ─────────────────────────
async function fetchPaymentHistory(page, accountNum) {
  // Try direct payment history URL first
  const histUrl = `${BASE}/Accounts/PaymentHistory?taxAccountNumber=${accountNum}`;
  console.log(`    Payment history: ${histUrl}`);
  await page.goto(histUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForCloudflare(page, 'payment history');
  await page.waitForTimeout(1500);

  let html = await page.content();
  const hasPaymentData = html.includes('PAYMENT DATE') || html.includes('Payment Date') || html.includes('TAX YEAR');
  console.log(`    Payment page has data: ${hasPaymentData} (page length: ${html.length})`);

  // If that didn't work, go to account details and click the button
  if (!hasPaymentData) {
    const detailUrl = `${BASE}/Accounts/AccountDetails?taxAccountNumber=${accountNum}`;
    console.log(`    Trying account details page + button click: ${detailUrl}`);
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitForCloudflare(page, 'account details');
    await page.waitForTimeout(1500);

    const btn = await page.$('a:has-text("Payment History"), button:has-text("Payment History"), a:has-text("PAYMENT HISTORY"), a:has-text("Receipts"), a:has-text("RECEIPTS")');
    console.log(`    Payment History/Receipts button found: ${!!btn}`);
    if (btn) {
      await btn.click();
      // Wait for navigation to complete + any CF challenge on the new page
      await page.waitForTimeout(1000);
      await waitForCloudflare(page, 'after button click');
      await page.waitForTimeout(1500);
      html = await page.content();
      console.log(`    After click — page length: ${html.length}, has data: ${html.includes('PAYMENT DATE') || html.includes('Payment Date')}`);
    }

    if (DEBUG) {
      const { writeFileSync } = await import('fs');
      const { join } = await import('path');
      writeFileSync(join(__dirname, 'debug-tax-payment.html'), html);
      console.log(`    HTML saved → scout/debug-tax-payment.html`);
    }
  }

  // Parse payment rows: find most recent year with a positive payment
  // Rows contain: date, amount ($X,XXX.XX), tax year, payer
  const rowMatches = [...html.matchAll(/(\d{1,2}\/\d{1,2}\/\d{4})[^$\d]*\$\s*([\d,]+\.\d{2})[^<]*<[^>]*>\s*(\d{4})/g)];
  console.log(`    Payment row regex matches: ${rowMatches.length}`);

  let bestYear = 0, bestAmount = null;
  for (const m of rowMatches) {
    const amount = parseFloat(m[2].replace(/,/g, ''));
    const year = parseInt(m[3]);
    console.log(`      Row: date=${m[1]} amount=$${amount} year=${year}`);
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
