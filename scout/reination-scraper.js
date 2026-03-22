#!/usr/bin/env node
// Reination property scraper
// Usage:  node scout/reination-scraper.js
//         node scout/reination-scraper.js --debug

import { readFileSync, writeFileSync, appendFileSync } from 'fs';
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
  // Page has two <h2 class="houseHeaderSize"> elements:
  //   First:  street address  e.g. "8131 Blooming Meadow Lane"
  //   Second: city/state/zip  e.g. "Houston, TX 77016"
  const headerMatches = [...html.matchAll(/class="houseHeaderSize"[^>]*>([^<]+)/gi)];
  let street = (headerMatches[0]?.[1] ?? '').trim();
  const cityLine = (headerMatches[1]?.[1] ?? '').trim();

  let city = '', state = '', zip = '';
  const cityState = cityLine.match(/^([^,]+),\s*([A-Z]{2})\s*(\d{5})?$/);
  if (cityState) {
    city  = cityState[1].trim();
    state = cityState[2].trim();
    zip   = cityState[3] ?? '';
  }

  // Fallback: title tag
  if (!street) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    street = (titleMatch?.[1] ?? '').replace(/\s*-\s*Reination.*/i, '').replace(/\s*\|.*/,'').trim();
  }

  // If we landed on the main listings page (redirected), skip this entry
  if (!street || street.toLowerCase().includes('property listing') || street.toLowerCase() === 'reination') {
    console.warn(`  ⚠ REI-${id} redirected to listings page — skipping`);
    return null;
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

  // Snapshot existing REI listings before upsert
  const { rows: existingRei } = await sql`SELECT mls_num, address, address_locked FROM scout_listings WHERE source = 'reination'`;
  const existingReiSet = new Set(existingRei.map(r => r.mls_num));
  const scrapedSet = new Set(results.map(p => p.mls_num));

  const now = new Date().toISOString();

  for (const p of results) {
    await sql`
      INSERT INTO scout_listings
        (mls_num, address, beds, baths, sqft, year_built, hoa_yn, href, source, first_seen, last_seen)
      VALUES
        (${p.mls_num}, ${p.address}, ${p.beds}, ${p.baths}, ${p.sqft},
         ${p.year_built}, ${p.hoa_yn}, ${p.href}, ${p.source}, ${now}, ${now})
      ON CONFLICT (mls_num) DO UPDATE SET
        address   = CASE WHEN scout_listings.address_locked THEN scout_listings.address ELSE EXCLUDED.address END,
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

  // ── Prominent run summary ────────────────────────────────────────────────
  const newListings = results.filter(p => !existingReiSet.has(p.mls_num));
  const disappeared = existingRei.filter(r => !scrapedSet.has(r.mls_num) && !r.address.toLowerCase().includes('property listing'));
  const existingReiMap = new Map(existingRei.map(r => [r.mls_num, r]));
  const addrConflicts = results.filter(p => {
    const ex = existingReiMap.get(p.mls_num);
    return ex?.address_locked && ex.address !== p.address;
  });
  const runDate = new Date().toLocaleString('en-US');
  const line = '═'.repeat(46);
  const lines = [
    `╔${line}╗`,
    `║  REI NATION SCOUT SUMMARY — ${runDate.padEnd(17)}║`,
    `╠${line}╣`,
    `║  ✅ New this run:          ${String(newListings.length).padEnd(19)}║`,
    ...newListings.map(p => `║     + ${p.address.slice(0, 38).padEnd(39)}║`),
    `║  🔴 No longer listed:      ${String(disappeared.length).padEnd(19)}║`,
    ...disappeared.map(r => `║     - ${r.address.slice(0, 38).padEnd(39)}║`),
    `║  🔒 Addr preserved:        ${String(addrConflicts.length).padEnd(19)}║`,
    ...addrConflicts.map(p => `║     ✎ ${p.address.slice(0, 38).padEnd(39)}║`),
    `║  📋 Total REI Nation in DB: ${String(results.length).padEnd(18)}║`,
    `╚${line}╝`,
  ];
  lines.forEach(l => console.log(l));
  const logPath = join(__dirname, 'run-summary.log');
  appendFileSync(logPath, '\n' + lines.join('\n') + '\n');

  // Clean up any phantom "Property Listings" entries left from previous runs
  const { rows: phantoms } = await sql`
    SELECT mls_num FROM scout_listings
    WHERE source = 'reination' AND (address ILIKE '%property listing%' OR address = '' OR address IS NULL)
  `;
  if (phantoms.length) {
    console.log(`🧹 Removing ${phantoms.length} phantom listing(s)…`);
    for (const { mls_num } of phantoms) {
      await sql`DELETE FROM scout_marks    WHERE mls_num = ${mls_num}`;
      await sql`DELETE FROM scout_listings WHERE mls_num = ${mls_num}`;
      console.log(`  Deleted ${mls_num}`);
    }
  }

  console.log(`✅ Done — ${results.length} Reination listings saved.`);
}

main().catch(err => { console.error(err); process.exit(1); });
