import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { init } from '@/lib/db';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.tax.tarrantcountytx.gov/',
};

function normalizeStreet(address) {
  return address.split(',')[0].trim().toUpperCase()
    .replace(/\bDRIVE\b/g, 'DR').replace(/\bSTREET\b/g, 'ST')
    .replace(/\bAVENUE\b/g, 'AVE').replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bROAD\b/g, 'RD').replace(/\bLANE\b/g, 'LN')
    .replace(/\bCOURT\b/g, 'CT').replace(/\bCIRCLE\b/g, 'CIR')
    .replace(/\bPLACE\b/g, 'PL').replace(/\bTRAIL\b/g, 'TRL')
    .replace(/\bPARKWAY\b/g, 'PKWY').replace(/\bLOOP\b/g, 'LOOP');
}

async function fetchTax(address) {
  // Use first 3 tokens of street for search (e.g. "2717 Laurel Valley")
  const streetPart = address.split(',')[0].trim();
  const searchTokens = streetPart.split(/\s+/).slice(0, 3).join(' ');
  const searchUrl = `https://www.tax.tarrantcountytx.gov/Search/Results?Query.SearchField=5&Query.SearchText=${encodeURIComponent(searchTokens)}&Query.SearchAction=&Query.PropertyType=&Query.IncludeInactiveAccounts=False&Query.PayStatus=Both`;

  const res = await fetch(searchUrl, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
  const html = await res.text();

  if (html.includes('cf-browser-verification') || html.includes('cf-challenge') || html.includes('Just a moment')) {
    throw new Error('CLOUDFLARE_BLOCKED');
  }

  // Extract all (accountNumber, propertyLocation) pairs from the HTML
  // The page renders cards with account number and PROPERTY LOCATION fields
  const normalTarget = normalizeStreet(address);

  // Match account number + property location from the search result cards
  // Pattern looks for the account number and nearby property location text
  const accountNums = [...html.matchAll(/taxAccountNumber[="]([0-9]+)/g)].map(m => m[1]);
  const propLocs = [...html.matchAll(/PROPERTY[_ ]LOCATION[^<]*<[^>]+>\s*([^<]+)/gi)].map(m => m[1].trim().toUpperCase());

  // Try alternate pattern if above yields nothing
  let pairs = [];
  if (accountNums.length && propLocs.length) {
    for (let i = 0; i < Math.min(accountNums.length, propLocs.length); i++) {
      pairs.push({ account: accountNums[i], location: propLocs[i] });
    }
  }

  // If regex didn't work, try extracting from href patterns
  if (!pairs.length) {
    const hrefMatches = [...html.matchAll(/AccountDetails\?taxAccountNumber=(\d+)[^"]*"[^>]*>[^<]*<[^>]*>[^<]*([A-Z0-9 ]+(?:DR|ST|AVE|BLVD|RD|LN|CT|CIR|PL|WAY|TRL|LOOP|PKWY)[A-Z0-9 ]{0,30})/gi)];
    pairs = hrefMatches.map(m => ({ account: m[1], location: m[2].trim() }));
  }

  // Find the best matching account number
  let accountNum = null;
  for (const { account, location } of pairs) {
    if (location === normalTarget || location.startsWith(normalTarget.split(' ').slice(0, 3).join(' '))) {
      accountNum = account;
      break;
    }
  }

  // Fallback: if only one result, use it
  if (!accountNum && accountNums.length === 1) {
    accountNum = accountNums[0];
  }

  if (!accountNum) {
    throw new Error(`NO_MATCH: no exact address match found for "${normalTarget}" among ${pairs.length} results`);
  }

  // Fetch payment history page
  const histUrl = `https://www.tax.tarrantcountytx.gov/Accounts/PaymentHistory?taxAccountNumber=${accountNum}`;
  const histRes = await fetch(histUrl, { headers: FETCH_HEADERS });
  if (!histRes.ok) {
    // Try alternate URL pattern
    // Return account num with null tax for now, so we at least cached the account
    return { accountNum, taxAnnual: null };
  }
  const histHtml = await histRes.text();

  // Extract the most recent positive annual payment
  // Payment history rows have: date | amount | tax year | payer
  // Match rows like: 12/30/2025 | $12,106.28 | 2025 | M & T BANK
  const rowMatches = [...histHtml.matchAll(/(\d{1,2}\/\d{1,2}\/\d{4})[^$]*\$([0-9,]+\.\d{2})\s*<[^>]*>\s*(\d{4})/g)];

  if (!rowMatches.length) {
    return { accountNum, taxAnnual: null };
  }

  // Find the most recent year with a positive payment
  let bestYear = 0, bestAmount = null;
  for (const m of rowMatches) {
    const amount = parseFloat(m[2].replace(/,/g, ''));
    const year = parseInt(m[3]);
    if (amount > 0 && year > bestYear) {
      bestYear = year;
      bestAmount = amount;
    }
  }

  return { accountNum, taxAnnual: bestAmount };
}

export async function GET(req) {
  await init();
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '100', 10);

  // Return top properties by roi5/atroi that still need tax data
  // Join with scout_marks to get roi-related data isn't possible directly,
  // so just return ones without tax data ordered by price desc as a proxy
  const { rows } = await sql`
    SELECT mls_num, address, price
    FROM scout_listings
    WHERE tax_annual IS NULL
      AND source = 'pam'
      AND listing_status = 'Active'
      AND price IS NOT NULL
      AND sqft IS NOT NULL
    ORDER BY price DESC
    LIMIT ${limit}
  `;
  return NextResponse.json(rows);
}

export async function POST(req) {
  await init();
  const { mls_num } = await req.json();
  if (!mls_num) return NextResponse.json({ error: 'missing mls_num' }, { status: 400 });

  const { rows } = await sql`SELECT address FROM scout_listings WHERE mls_num = ${mls_num}`;
  if (!rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { address } = rows[0];
  if (!address) return NextResponse.json({ error: 'no address' }, { status: 400 });

  try {
    const { accountNum, taxAnnual } = await fetchTax(address);
    const now = new Date().toISOString();

    await sql`
      UPDATE scout_listings
      SET tax_account_num = ${accountNum},
          tax_annual      = ${taxAnnual},
          tax_fetched_at  = ${now}
      WHERE mls_num = ${mls_num}
    `;

    return NextResponse.json({ ok: true, tax_annual: taxAnnual, tax_account_num: accountNum });
  } catch (err) {
    if (err.message === 'CLOUDFLARE_BLOCKED') {
      return NextResponse.json({ error: 'cloudflare', message: 'Site requires browser — run scout/tax-scraper.js locally' }, { status: 503 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
