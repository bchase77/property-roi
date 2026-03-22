#!/usr/bin/env node
// Reination property scraper
// Usage:  node scout/reination-scraper.js
//         node scout/reination-scraper.js --debug

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
  } catch { /* no env file, rely on process.env */ }
}

loadEnv('.env.local');
loadEnv('.env');

const DEBUG = process.argv.includes('--debug');
const BASE_URL = 'https://www.reination.com';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchHtml(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// ── Extract property IDs from the main listings page ─────────────────────────
async function getPropertyIds() {
  const html = await fetchHtml(`${BASE_URL}/property-listings`);
  if (DEBUG) writeFileSync(join(__dirname, 'rei-page1.html'), html);
  const matches = [...html.matchAll(/href="(\/property-listings\/(\d+))"/g)];
  const ids = [...new Set(matches.map(m => m[2]))];
  console.log(`  Found ${ids.length} property IDs`);
  return ids;
}

// ── Extract a field value after a label (case-insensitive) ───────────────────
function extractAfterLabel(html, ...labels) {
  for (const label of labels) {
    // Look for label text followed shortly by a value (within ~200 chars)
    const re = new RegExp(label + '[^<>]{0,80}?([\\$\\d][\\d,\\.]+)', 'i');
    const m = html.match(re);
    if (m) return m[1].replace(/,/g, '');
  }
  return null;
}

function extractTextAfterLabel(html, ...labels) {
  for (const label of labels) {
    const re = new RegExp(label + '[\\s\\S]{0,200}?<[^>]+>([^<]{1,60})<\\/[^>]+>', 'i');
    const m = html.match(re);
    if (m) return m[1].trim();
    // Also try plain text match (no wrapping tag)
    const re2 = new RegExp(label + '[^<>]{0,10}([A-Za-z][A-Za-z ]{1,40})', 'i');
    const m2 = html.match(re2);
    if (m2) return m2[1].trim();
  }
  return null;
}

// ── Scrape one property detail page ──────────────────────────────────────────
async function scrapeProperty(id) {
  const url = `${BASE_URL}/property-listings/${id}`;
  let html;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    console.warn(`  ⚠ Failed to fetch ${url}: ${err.message}`);
    return null;
  }

  if (DEBUG) writeFileSync(join(__dirname, `rei-prop-${id}.html`), html);

  // ── Address ───────────────────────────────────────────────────────────────
  // Title tag is usually "Street Address | City, State | Reination"
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const titleText = titleMatch ? titleMatch[1] : '';

  // Try og:title or h1 for address
  const ogTitle = html.match(/property="og:title"[^>]*content="([^"]+)"/i)
                || html.match(/content="([^"]+)"[^>]*property="og:title"/i);

  // Try H1 tag
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);

  // Try to find address from page URL path doesn't help; use page content
  // Look for a structured address block
  const addrFull = ogTitle?.[1] || h1Match?.[1] || titleText.split('|')[0] || '';
  const addrClean = addrFull.replace(/\s*\|.*/, '').replace(/\s*-\s*Reination.*/i, '').trim();

  // Try to split address into street / city / state / zip
  // Pattern: "1234 Street Name, City, ST 12345"
  const addrParts = addrClean.match(/^(.+?),\s*([^,]+),\s*([A-Z]{2})\s*(\d{5})?$/);
  let street = '', city = '', state = '', zip = '';
  if (addrParts) {
    street = addrParts[1].trim();
    city   = addrParts[2].trim();
    state  = addrParts[3].trim();
    zip    = addrParts[4] ?? '';
  } else {
    street = addrClean;
  }

  // Fallback: look for address-like text in meta description
  if (!street) {
    const metaDesc = html.match(/name="description"[^>]*content="([^"]+)"/i)?.[1] ?? '';
    const metaAddr = metaDesc.match(/^([^.]+)/)?.[1] ?? '';
    street = metaAddr.trim();
  }

  // ── Beds / Baths / Sqft ───────────────────────────────────────────────────
  const bedsMatch  = html.match(/(\d+)\s*(?:BEDS?|bed(?:room)?s?)/i);
  const bathsMatch = html.match(/([\d.]+)\s*(?:BATHS?|bath(?:room)?s?)/i);
  const sqftMatch  = html.match(/([\d,]+)\s*(?:SQ\.?\s*FT|square\s*feet)/i);
  const yrBltMatch = html.match(/(?:BUILT\s*IN|Year\s*Built)[:\s]*(\d{4})/i);

  const beds  = bedsMatch  ? parseInt(bedsMatch[1])              : null;
  const baths = bathsMatch ? parseFloat(bathsMatch[1])           : null;
  const sqft  = sqftMatch  ? parseInt(sqftMatch[1].replace(/,/g, '')) : null;
  const yearBuilt = yrBltMatch ? parseInt(yrBltMatch[1])         : null;

  // ── HOA ───────────────────────────────────────────────────────────────────
  const hoaMatch = html.match(/HOA[:\s]*<[^>]*>?\s*(YES|NO)\s*<?/i)
                || html.match(/HOA[:\s]+(YES|NO)/i);
  const hoaYn = hoaMatch ? hoaMatch[1].toUpperCase() === 'YES' : null;

  // ── Status ────────────────────────────────────────────────────────────────
  const statusMatch = html.match(/Under\s+Contract/i)  ? 'under_contract'
                    : html.match(/Available/i)          ? 'available'
                    : null;

  // ── Year 1 Rent ───────────────────────────────────────────────────────────
  const rentMatch = html.match(/(?:Rent\s*Year\s*1|Year\s*1\s*Rent)[:\s]*\$?([\d,]+)/i);
  const year1Rent = rentMatch ? parseInt(rentMatch[1].replace(/,/g, '')) : null;

  // ── Market ────────────────────────────────────────────────────────────────
  const marketMatch = html.match(/([A-Za-z\s]+)\s+Market/i);
  const market = marketMatch ? marketMatch[1].trim() : null;

  const address = [street, city, state, zip].filter(Boolean).join(', ') || `REI-${id}`;

  return {
    mls_num:    `REI-${id}`,
    address,
    beds,
    baths,
    sqft,
    year_built: yearBuilt,
    hoa_yn:     hoaYn,
    href:       url,
    source:     'reination',
    status_label: statusMatch,
    year1_rent: year1Rent,
    market,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🏠 Reination scraper starting…');

  const ids = await getPropertyIds();
  if (!ids.length) { console.log('No listings found.'); return; }

  const results = [];
  for (const id of ids) {
    process.stdout.write(`  Scraping REI-${id}… `);
    const prop = await scrapeProperty(id);
    if (prop) {
      results.push(prop);
      console.log(`${prop.address} | ${prop.beds}bd/${prop.baths}ba | rent $${prop.year1_rent ?? '?'}`);
    }
    // Polite delay between requests
    await new Promise(r => setTimeout(r, 800));
  }

  if (!results.length) { console.log('Nothing to save.'); return; }

  console.log(`\n💾 Saving ${results.length} listings to DB…`);

  // Ensure schema is up to date
  const { init } = await import('../src/lib/db.js');
  await init();

  const now = new Date().toISOString();

  for (const p of results) {
    await sql`
      INSERT INTO scout_listings
        (mls_num, address, beds, baths, sqft, year_built, hoa_yn, href, source, first_seen, last_seen)
      VALUES
        (${p.mls_num}, ${p.address}, ${p.beds}, ${p.baths}, ${p.sqft},
         ${p.year_built}, ${p.hoa_yn}, ${p.href}, ${p.source}, ${now}, ${now})
      ON CONFLICT (mls_num) DO UPDATE SET
        address   = EXCLUDED.address,
        beds      = COALESCE(EXCLUDED.beds,      scout_listings.beds),
        baths     = COALESCE(EXCLUDED.baths,     scout_listings.baths),
        sqft      = COALESCE(EXCLUDED.sqft,      scout_listings.sqft),
        year_built= COALESCE(EXCLUDED.year_built,scout_listings.year_built),
        hoa_yn    = COALESCE(EXCLUDED.hoa_yn,    scout_listings.hoa_yn),
        href      = EXCLUDED.href,
        last_seen = ${now};
    `;

    // Seed rent into scout_marks only if not already set by the user
    if (p.year1_rent) {
      await sql`
        INSERT INTO scout_marks (mls_num, rent_min, rent_max)
        VALUES (${p.mls_num}, ${p.year1_rent}, ${p.year1_rent})
        ON CONFLICT (mls_num) DO UPDATE SET
          rent_min = COALESCE(scout_marks.rent_min, EXCLUDED.rent_min),
          rent_max = COALESCE(scout_marks.rent_max, EXCLUDED.rent_max);
      `;
    }
  }

  console.log(`✅ Done — ${results.length} Reination listings saved.`);
}

main().catch(err => { console.error(err); process.exit(1); });
