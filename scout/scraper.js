#!/usr/bin/env node
// Scout — PAM Texas property scraper
// Usage:  node scout/scraper.js
//         node scout/scraper.js --debug         (headed browser + HTML dump)
//         node scout/scraper.js --headless      (force headless)
//         node scout/scraper.js --with-schools  (scrape school district from detail pages)

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ASSUMPTIONS, calculateMetrics, estimateRent } from './finance.js';
import { loadHistory, loadMarks, saveHistory, updateHistory, getPriceInfo } from './storage.js';
import { sql } from '@vercel/postgres';

// ─── Load .env.local ──────────────────────────────────────────────────────────
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
    console.log(`  Loaded ${filename}`);
  } catch {
    console.warn(`  Warning: could not load ${filename}`);
  }
}

loadEnv('.env.local');
loadEnv('.env');

const USERNAME  = process.env.PAMS_UNAME;
const PASSWORD  = process.env.PAMS_PW;
const CORP_ID   = process.env.PAMS_CORPID;

const DEBUG        = process.argv.includes('--debug');
const FORCE_HEADLESS = process.argv.includes('--headless');
const WITH_SCHOOLS = process.argv.includes('--with-schools');

const BASE_URL  = 'https://pamtexas.idxbroker.com';
const LOGIN_URL = `${BASE_URL}/idx/login`;

// ─── Load search config from DB (falls back to defaults if DB unavailable) ───
async function loadScoutConfig() {
  try {
    const { rows } = await sql`SELECT * FROM scout_config WHERE name = 'default' LIMIT 1;`;
    if (rows[0]) {
      const c = rows[0];
      console.log(`  Loaded config from DB: max $${Number(c.max_price).toLocaleString()}, min ${c.min_beds}BR, ${c.max_pages} pages`);
      return c;
    }
  } catch (e) {
    console.warn(`  Warning: could not read scout_config from DB (${e.message}), using defaults`);
  }
  return { min_price: 0, max_price: 500000, min_beds: 3, county: '1245', max_pages: 10 };
}

let FILTERS = { maxPrice: 500_000, minBeds: 3, minPrice: 50_000 };

function bandUrl(cfg, lp, hp) {
  // idxStatus=a = active listings only (excludes pending, sold, expired)
  return `https://pamtexas.idxbroker.com/idx/results/listings?pt=sfr&county%5B%5D=${cfg.county}&ccz=county&idxStatus=a&lp=${lp}&hp=${hp}&per=250&srt=prd`;
}

// Build $5K price bands with $500 overlaps at each boundary.
// Dedup by MLS# after merging all bands handles any duplicates from overlaps.
function buildBands(minPrice, maxPrice) {
  const STEP    = 5_000;
  const OVERLAP = 500;
  const bands = [];
  for (let lp = minPrice; lp < maxPrice; lp += STEP) {
    bands.push({
      lp: lp === minPrice ? lp : lp - OVERLAP,
      hp: Math.min(lp + STEP, maxPrice),
    });
  }
  return bands;
}

// ─── Scrape all pages for one price band ─────────────────────────────────────
async function scrapeBand(page, url, cfg, label) {
  console.log(`\n  ── Band ${label}: navigating…`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(5000);

  const bandListings = [];

  const p1appeared = await page.waitForSelector('li.IDX-results--cell', { timeout: 20_000 })
    .then(() => true).catch(() => false);
  if (!p1appeared) {
    console.log(`    No listings on page 1 — skipping band`);
    return bandListings;
  }
  const p1 = await scrapePage(page);
  console.log(`    Page 1: ${p1.length} listings`);
  bandListings.push(...p1);

  const pageUrls = await page.$$eval('a[href*="start="]', links => {
    const seen = new Set();
    return [...links]
      .map(a => a.href)
      .filter(h => { if (!h || seen.has(h)) return false; seen.add(h); return true; })
      .sort((a, b) => {
        const ma = a.match(/start=(\d+)/), mb = b.match(/start=(\d+)/);
        return (ma ? +ma[1] : 0) - (mb ? +mb[1] : 0);
      });
  });

  const maxPages = Math.min(pageUrls.length + 1, cfg.max_pages ?? 10);
  for (let i = 0; i < pageUrls.length && bandListings.length < (maxPages - 1) * 250; i++) {
    console.log(`    Page ${i + 2}/${maxPages}…`);
    await page.goto(pageUrls[i], { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(5000);
    const html = await page.content();
    if (html.includes('cf-turnstile') || html.includes('security verification')) {
      console.log(`    Cloudflare challenge — stopping band early`);
      break;
    }
    const appeared = await page.waitForSelector('li.IDX-results--cell', { timeout: 20_000 })
      .then(() => true).catch(() => false);
    if (!appeared) break;
    const pl = await scrapePage(page);
    console.log(`    Page ${i + 2}: ${pl.length} listings`);
    if (pl.length === 0) break;
    bandListings.push(...pl);
  }

  return bandListings;
}

// ─── Scraper ──────────────────────────────────────────────────────────────────
async function scrape() {
  console.log('\n🏠 Scout — PAM Texas Property Scraper');
  console.log('━'.repeat(50));
  if (!USERNAME || !PASSWORD) {
    console.error('\n❌  PAMS_UNAME and PAMS_PW not found in .env.local');
    console.error('    Add them:\n      PAMS_UNAME=your@email.com\n      PAMS_PW=yourpassword\n');
    process.exit(1);
  }

  // ── Load config from DB ──────────────────────────────────────────────────────
  const cfg = await loadScoutConfig();
  FILTERS = { maxPrice: cfg.max_price, minBeds: cfg.min_beds, minPrice: 50_000 };
  const bands = buildBands(cfg.min_price || 50_000, cfg.max_price || 500_000);
  console.log(`  Price bands (${bands.length}): ${bands.map(b => `$${(b.lp/1000).toFixed(0)}K–$${(b.hp/1000).toFixed(0)}K`).join(' | ')}`);

  const isHeadless = FORCE_HEADLESS ? true
    : process.env.HEADLESS === 'false' ? false
    : !DEBUG;
  console.log(`  Browser mode: ${isHeadless ? 'headless' : 'headed (Xvfb)'}`);

  const browser = await chromium.launch({
    headless: isHeadless,
    args: [
      '--disable-blink-features=AutomationControlled', // hides webdriver flag
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  // Patch fingerprints that Cloudflare's JS challenge checks for headless browsers
  await context.addInitScript(() => {
    // Remove navigator.webdriver (the most obvious headless tell)
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // Remove Playwright-specific globals
    delete window.__playwright;
    delete window.__pw_manual;
    delete window.__pwInitScripts;
    // Spoof plugins array (headless has 0 plugins, real Chrome has several)
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    // Spoof languages
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });

  const page = await context.newPage();
  let listings = [];

  try {
    // ── 1. Check for login requirement using the first band URL ───────────
    const band0url = bandUrl(cfg, bands[0].lp, bands[0].hp);
    console.log('\n→ Loading first band to check login…');
    await page.goto(band0url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    const needsLogin = currentUrl.includes('login') || currentUrl.includes('signin') ||
                       await page.$('input[type="password"]') !== null;
    if (needsLogin) {
      console.log('→ Login required — signing in…');
      await login(page);
      await page.goto(band0url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(5000);
    }

    // Save page1.html from first band for artifact inspection
    writeFileSync(join(__dirname, 'page1.html'), await page.content());

    if (DEBUG) {
      const shot = join(__dirname, 'debug-screenshot.png');
      await page.screenshot({ path: shot, fullPage: true });
      console.log(`  Screenshot saved → ${shot}`);
    }

    // ── 2. Scrape all bands ───────────────────────────────────────────────
    // Band 0 is already loaded; pass its URL so scrapeBand re-navigates
    // consistently (it always navigates at the start).
    const allRaw = [];
    for (let i = 0; i < bands.length; i++) {
      const { lp, hp } = bands[i];
      const label = `$${(lp / 1000).toFixed(0)}K–$${(hp / 1000).toFixed(0)}K`;
      const url = bandUrl(cfg, lp, hp);
      const bandResults = await scrapeBand(page, url, cfg, label);
      const capped = bandResults.length >= 500;
      console.log(`  Band ${label}: ${bandResults.length} listings${capped ? ' ⚠️  HIT 500-RESULT CAP — some properties may be missing, consider splitting this band' : ''}`);
      allRaw.push(...bandResults);
    }

    // ── 3. Deduplicate by MLS# (overlapping bands produce duplicates) ─────
    const seen = new Map();
    for (const l of allRaw) {
      if (l.mlsNum && !seen.has(l.mlsNum)) seen.set(l.mlsNum, l);
    }
    listings = [...seen.values()];
    console.log(`\n→ Total unique listings after dedup: ${listings.length} (from ${allRaw.length} raw)`);

    await page.close();

  } finally {
    await browser.close();
  }

  if (listings.length === 0) {
    console.error('\n⚠️  No listings found. Run with --debug to inspect the page structure.');
    console.error('   The selector patterns may need updating for this site.\n');
    process.exit(1);
  }

  console.log(`\n→ Total listings scraped: ${listings.length}`);

  // ── 4. Filter ──────────────────────────────────────────────────────────────
  const filtered = listings.filter(l => {
    if (l.price < FILTERS.minPrice) return false;   // exclude rentals at monthly rates
    if (l.price > FILTERS.maxPrice) return false;
    if (l.beds < FILTERS.minBeds) return false;
    return true;
  });

  console.log(`→ After filter (SFR, ≤$${FILTERS.maxPrice.toLocaleString()}, ≥${FILTERS.minBeds}BR): ${filtered.length} properties`);

  // ── 5. Price history ───────────────────────────────────────────────────────
  const history = loadHistory();
  updateHistory(history, filtered);
  saveHistory(history);
  console.log(`→ Price history updated (${Object.keys(history).length} properties tracked)`);

  // ── 5b. Write listings + price history to DB ───────────────────────────────
  let dbOk = false;
  try {
    const now = new Date().toISOString();

    // Snapshot existing PAM listings before upsert so we can detect new/gone/address conflicts
    const { rows: existingRows } = await sql`SELECT mls_num, address, address_locked FROM scout_listings WHERE source = 'pam'`;
    const existingPamMap = new Map(existingRows.map(r => [r.mls_num, r]));
    const existingPamSet = new Set(existingRows.map(r => r.mls_num));

    for (const l of filtered) {
      if (!l.mlsNum) continue;
      await sql`
        INSERT INTO scout_listings (mls_num, address, price, beds, baths, sqft, property_type, href, first_seen, last_seen)
        VALUES (${l.mlsNum}, ${l.address}, ${l.price}, ${l.beds}, ${l.baths ?? null}, ${l.sqft ?? null}, ${l.propertyType ?? null}, ${l.href ?? null}, ${now}, ${now})
        ON CONFLICT (mls_num) DO UPDATE SET
          address   = CASE WHEN scout_listings.address_locked THEN scout_listings.address ELSE EXCLUDED.address END,
          price     = EXCLUDED.price,
          beds      = EXCLUDED.beds,
          baths     = EXCLUDED.baths,
          sqft      = EXCLUDED.sqft,
          href      = EXCLUDED.href,
          last_seen = EXCLUDED.last_seen;
      `;
      // Record price snapshot only if price changed
      const hist = history[l.mlsNum];
      const snaps = hist?.snapshots ?? [];
      const lastSnap = snaps[snaps.length - 1];
      if (lastSnap && (snaps.length === 1 || snaps[snaps.length - 2]?.price !== lastSnap.price)) {
        await sql`
          INSERT INTO scout_price_history (mls_num, price, recorded_at)
          VALUES (${l.mlsNum}, ${lastSnap.price}, ${lastSnap.date})
          ON CONFLICT DO NOTHING;
        `.catch(() => {}); // ignore if already recorded
      }
    }
    console.log(`→ DB updated (${filtered.length} listings upserted)`);

    // ── Track disappearances and reappearances ─────────────────────────────
    // We only scrape a subset of all listings per run, so we use a 2-day
    // threshold: a listing must be absent for 2+ days before it's considered
    // truly gone, and must have been gone 2+ days to count as a relisting.
    const currentMlsNums = filtered.map(l => l.mlsNum).filter(Boolean);
    if (currentMlsNums.length > 0) {
      // 1. True reappearances: gone 2+ days, now back → increment count
      const { rows: reappeared } = await sql`
        UPDATE scout_listings
        SET
          last_absence_days = EXTRACT(DAY FROM now() - disappeared_at)::INT,
          reappeared_count  = reappeared_count + 1,
          disappeared_at    = NULL
        WHERE mls_num = ANY(${currentMlsNums})
          AND disappeared_at IS NOT NULL
          AND disappeared_at < now() - INTERVAL '2 days'
        RETURNING mls_num, address, reappeared_count, last_absence_days;
      `;
      if (reappeared.length > 0) {
        console.log(`→ Relisted (${reappeared.length}): ${reappeared.map(r => `${r.address} (gone ${r.last_absence_days}d)`).join(', ')}`);
      }

      // 2. False alarms: gone < 2 days, back now → just clear the flag silently
      await sql`
        UPDATE scout_listings
        SET disappeared_at = NULL
        WHERE mls_num = ANY(${currentMlsNums})
          AND disappeared_at IS NOT NULL
          AND disappeared_at >= now() - INTERVAL '2 days';
      `;

      // 3. Mark absent: only if not seen for 2+ days (avoids false positives
      //    from listings that simply weren't in this run's top-100 results)
      const { rowCount: markedAbsent } = await sql`
        UPDATE scout_listings
        SET disappeared_at = now()
        WHERE mls_num != ALL(${currentMlsNums})
          AND disappeared_at IS NULL
          AND last_seen < now() - INTERVAL '2 days';
      `;
      if (markedAbsent > 0) {
        console.log(`→ Marked absent: ${markedAbsent} listing${markedAbsent !== 1 ? 's' : ''} not seen in 2+ days`);
      }
    }

    // ── Prominent run summary ──────────────────────────────────────────────
    const currentSet = new Set(currentMlsNums);
    const newListings = filtered.filter(l => l.mlsNum && !existingPamSet.has(l.mlsNum));
    const disappearedMls = [...existingPamSet].filter(m => !currentSet.has(m));
    const { rows: disappearedRows } = disappearedMls.length > 0
      ? await sql`SELECT mls_num, address FROM scout_listings WHERE mls_num = ANY(${disappearedMls})`
      : { rows: [] };
    const addrConflicts = filtered.filter(l => {
      const ex = existingPamMap.get(l.mlsNum);
      return ex?.address_locked && ex.address !== l.address;
    });
    const { rows: totalRows } = await sql`SELECT COUNT(*)::int AS n FROM scout_listings WHERE source = 'pam'`;
    const runDate = new Date().toLocaleString('en-US');
    const line = '═'.repeat(46);
    const lines = [
      `╔${line}╗`,
      `║  PAMS SCOUT SUMMARY — ${runDate.padEnd(23)}║`,
      `╠${line}╣`,
      `║  ✅ New this run:     ${String(newListings.length).padEnd(24)}║`,
      ...newListings.map(l => `║     + ${l.address.slice(0, 38).padEnd(39)}║`),
      `║  🔴 No longer listed: ${String(disappearedRows.length).padEnd(23)}║`,
      ...disappearedRows.map(r => `║     - ${r.address.slice(0, 38).padEnd(39)}║`),
      `║  🔒 Addr preserved:   ${String(addrConflicts.length).padEnd(23)}║`,
      ...addrConflicts.map(l => `║     ✎ ${l.address.slice(0, 38).padEnd(39)}║`),
      `║  📋 Total PAM in DB:  ${String(totalRows[0].n).padEnd(23)}║`,
      `╚${line}╝`,
    ];
    lines.forEach(l => console.log(l));
    const logPath = join(__dirname, 'run-summary.log');
    appendFileSync(logPath, '\n' + lines.join('\n') + '\n');

    dbOk = true;
  } catch (e) {
    console.warn(`  Warning: DB write failed (${e.message}) — report still generated from local data`);
  }

  // ── 6. School districts (optional) ─────────────────────────────────────────
  if (WITH_SCHOOLS) {
    const needSchools = filtered.filter(l => l.mlsNum && l.href &&
      history[l.mlsNum] && history[l.mlsNum].schoolDistrict === null);
    if (needSchools.length > 0) {
      console.log(`\n→ Fetching school districts for ${needSchools.length} new listings…`);
      for (const l of needSchools) {
        process.stdout.write(`  ${l.address}… `);
        const district = await scrapeSchoolDistrict(l.href, context);
        history[l.mlsNum].schoolDistrict = district || '';
        process.stdout.write(district ? `${district}\n` : `not found\n`);
      }
      saveHistory(history);
    } else {
      console.log(`→ School districts: all up to date`);
    }
  }

  // ── 7. Score ───────────────────────────────────────────────────────────────
  const marks = loadMarks();
  const scored = filtered.map(l => {
    const estimatedRent = estimateRent(l.sqft);
    const metrics = calculateMetrics({ ...l, monthlyRent: estimatedRent });
    const priceInfo = getPriceInfo(history, l.mlsNum);
    const schoolDistrict = history[l.mlsNum]?.schoolDistrict ?? null;
    const mark = marks[l.mlsNum] ?? null;
    return { ...l, estimatedRent, metrics, priceInfo, schoolDistrict, mark };
  }).filter(l => l.metrics);

  scored.sort((a, b) => b.metrics.atROI30y - a.metrics.atROI30y);
  console.log(`→ Scored and sorted by 30y ATROI`);

  // ── 8. Generate report ─────────────────────────────────────────────────────
  const reportPath = join(__dirname, 'report.html');
  writeFileSync(reportPath, generateReport(scored, marks));
  console.log(`\n✅  Report saved → ${reportPath}`);
  console.log('   Open it in your browser: open scout/report.html\n');
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Try common field selectors
  const emailField = await page.$('#IDX-loginEmail, #email, input[name="email"], input[type="email"], #IDX-username, input[name="username"]');
  const passField  = await page.$('#IDX-loginPassword, #password, input[name="password"], input[type="password"]');

  if (!emailField || !passField) {
    console.error('  Could not find login fields. Run with --debug to inspect the login page.');
    throw new Error('Login fields not found');
  }

  await emailField.fill(USERNAME);
  await passField.fill(PASSWORD);

  const submitBtn = await page.$('button[type="submit"], input[type="submit"], #IDX-loginSubmit, .IDX-loginBtn');
  if (submitBtn) {
    await submitBtn.click();
  } else {
    await passField.press('Enter');
  }

  await page.waitForTimeout(3000);
  console.log(`  Logged in as ${USERNAME}`);
}

// ─── Scrape school district from a listing detail page ───────────────────────
async function scrapeSchoolDistrict(href, context) {
  const p = await context.newPage();
  try {
    await p.goto(href, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await p.waitForTimeout(3000);
    return await p.evaluate(() => {
      // IDXBroker detail pages use various patterns for school district
      const directSels = [
        '.IDX-field-schoolDistrict .IDX-text',
        '.IDX-field-schoolDistrict',
        '[class*="schoolDistrict"] .IDX-text',
        '[class*="SchoolDistrict"] .IDX-text',
      ];
      for (const s of directSels) {
        const t = document.querySelector(s)?.textContent?.trim();
        if (t) return t;
      }
      // Fallback: scan label/value pairs for "school district" text
      for (const lbl of document.querySelectorAll('.IDX-label, label, dt, th, span')) {
        if (/school\s+dist/i.test(lbl.textContent)) {
          const val = lbl.nextElementSibling
            ?? lbl.parentElement?.querySelector('.IDX-text, dd, td');
          const t = val?.textContent?.trim();
          if (t && t.length < 80) return t;
        }
      }
      return null;
    });
  } catch { return null; }
  finally { await p.close(); }
}

// ─── Scrape a single page of listings ────────────────────────────────────────
// Selectors confirmed from live IDXBroker HTML structure
async function scrapePage(page) {
  return page.evaluate(() => {
    const listings = [];
    const cells = document.querySelectorAll('li.IDX-results--cell');

    for (const el of cells) {
      // ── Price — stored clean in data attribute ────────────────────────
      const price = parseInt(el.dataset.price || '0');

      // ── MLS / listing IDs ─────────────────────────────────────────────
      const mlsNum    = el.dataset.listingid || '';
      const idxId     = el.dataset.idxid || '';
      // mlsptid=1 → Single Family Residential in NTREIS (Texas MLS)
      const mlsPtId   = el.dataset.mlsptid || '';

      // ── Property type header (Residential / Condo / etc.) ────────────
      // The header is a sibling h4 above the listings group — walk up
      let propertyType = '';
      let prev = el.previousElementSibling;
      while (prev) {
        if (prev.classList.contains('IDX-propertyTypeHeader')) {
          propertyType = prev.textContent.trim();
          break;
        }
        prev = prev.previousElementSibling;
      }
      if (!propertyType) {
        const hdr = el.parentElement?.querySelector('.IDX-propertyTypeHeader');
        propertyType = hdr?.textContent?.trim() || '';
      }

      // ── Address ───────────────────────────────────────────────────────
      const num    = el.querySelector('.IDX-resultsAddressNumber')?.textContent?.trim() || '';
      const name   = el.querySelector('.IDX-resultsAddressName')?.textContent?.trim() || '';
      const city   = el.querySelector('.IDX-resultsAddressCity')?.textContent?.trim() || '';
      const state  = el.querySelector('.IDX-resultsAddressStateAbrv')?.textContent?.trim() || '';
      const address = `${num} ${name}, ${city}, ${state}`.replace(/\s+/g, ' ').trim();

      // ── Beds / Baths ──────────────────────────────────────────────────
      const bedsText  = el.querySelector('.IDX-results--details-field-bedrooms .IDX-text')?.textContent?.trim() || '0';
      const bathsText = el.querySelector('.IDX-results--details-field-totalBaths .IDX-text')?.textContent?.trim() || '0';
      const beds  = parseInt(bedsText) || 0;
      const baths = parseFloat(bathsText) || 0;

      // ── Sqft ──────────────────────────────────────────────────────────
      const sqftText = el.querySelector('.IDX-field-sqFt .IDX-text')?.textContent?.trim() || '';
      const sqft = sqftText ? parseInt(sqftText.replace(/,/g, '')) : null;

      // ── Detail URL ────────────────────────────────────────────────────
      const href = el.querySelector('a.IDX-resultsPhotoLink')?.href || '';

      // ── HOA (not on list view — will be null, user can edit) ──────────
      const hoaMonthly = 0;

      if (price > 50_000) {
        listings.push({ price, address, beds, baths, sqft, propertyType, mlsPtId, hoaMonthly, href, mlsNum, idxId });
      }
    }

    return listings;
  });
}

// ─── HTML Report Generator ───────────────────────────────────────────────────
function generateReport(properties, savedMarks = {}) {
  const now = new Date().toLocaleString();
  const assumptionsJson = JSON.stringify(ASSUMPTIONS);
  const propertiesJson  = JSON.stringify(properties.map(p => ({
    price:          p.price,
    address:        p.address,
    beds:           p.beds,
    baths:          p.baths,
    sqft:           p.sqft,
    hoaMonthly:     p.hoaMonthly,
    href:           p.href,
    mlsNum:         p.mlsNum,
    estimatedRent:  p.estimatedRent,
    schoolDistrict: p.schoolDistrict ?? null,
    priceInfo:      p.priceInfo ?? null,   // { firstPrice, changeFromFirst, daysSinceFirst, ... }
    mark:           p.mark ?? null,        // from marks.json: { status, note, markedAt }
  })));
  const marksJson = JSON.stringify(savedMarks);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Scout Report — ${now}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; }
  header { background: #1e3a5f; color: white; padding: 18px 28px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  header h1 { font-size: 1.4rem; font-weight: 700; }
  header .meta { font-size: 0.8rem; opacity: 0.7; }

  .assumptions-panel { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 16px 28px; }
  .assumptions-panel h2 { font-size: 0.85rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
  .assumptions-grid { display: flex; flex-wrap: wrap; gap: 10px 20px; }
  .assumption-item { display: flex; flex-direction: column; }
  .assumption-item label { font-size: 0.72rem; color: #94a3b8; margin-bottom: 3px; }
  .assumption-item input { width: 90px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 5px; font-size: 0.85rem; color: #1e293b; }
  .assumption-item input:focus { outline: none; border-color: #3b82f6; }
  .recalc-btn { align-self: flex-end; padding: 6px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 0.85rem; cursor: pointer; margin-left: 8px; }
  .recalc-btn:hover { background: #2563eb; }

  /* Filter + summary bar */
  .control-bar { padding: 10px 28px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; flex-wrap: wrap; gap: 10px; font-size: 0.85rem; color: #64748b; }
  .control-bar strong { color: #1e293b; }
  .filter-btns { display: flex; gap: 6px; }
  .filter-btn { padding: 4px 12px; border-radius: 20px; border: 1.5px solid #cbd5e1; background: white; font-size: 0.8rem; font-weight: 600; cursor: pointer; color: #475569; transition: all .15s; }
  .filter-btn:hover { border-color: #94a3b8; }
  .filter-btn.active { background: #1e3a5f; color: white; border-color: #1e3a5f; }
  .filter-btn.potential { border-color: #16a34a; color: #16a34a; }
  .filter-btn.potential.active { background: #16a34a; color: white; }
  .filter-btn.skip { border-color: #dc2626; color: #dc2626; }
  .filter-btn.skip.active { background: #dc2626; color: white; }
  .sort-trigger-btn { padding: 4px 14px; background: #1e3a5f; color: white; border: none; border-radius: 5px; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
  .sort-trigger-btn:hover { background: #2d5a8f; }
  .save-marks-btn { padding: 4px 14px; background: #7c3aed; color: white; border: none; border-radius: 5px; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
  .save-marks-btn:hover { background: #6d28d9; }
  .spacer { flex: 1; }

  /* Table */
  .table-wrap { padding: 20px 28px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  th { background: #f1f5f9; font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; padding: 10px 12px; text-align: left; white-space: nowrap; }
  td { padding: 9px 12px; border-top: 1px solid #f1f5f9; font-size: 0.85rem; vertical-align: middle; }

  /* Row status styles */
  tr.status-potential td { background: #f0fdf4; }
  tr.status-potential:hover td { background: #dcfce7; }
  tr.status-skip { opacity: 0.38; }
  tr.status-skip td { text-decoration: line-through; color: #94a3b8; }
  tr:not(.status-potential):not(.status-skip):hover td { background: #f8fafc; }

  .address-cell a { color: #1e3a5f; font-weight: 600; text-decoration: none; }
  .address-cell a:hover { text-decoration: underline; }
  .address-cell .sub { font-size: 0.72rem; color: #94a3b8; margin-top: 1px; }
  .address-cell .addr-row { display: flex; align-items: center; gap: 5px; }
  .copy-btn { flex-shrink: 0; background: none; border: none; cursor: pointer; padding: 1px 3px; font-size: 0.8rem; color: #94a3b8; border-radius: 3px; line-height: 1; }
  .copy-btn:hover { color: #2563eb; background: #eff6ff; }
  .copy-btn.copied { color: #16a34a; }

  /* Price cell with change badge */
  .price-wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .price-val { font-weight: 700; }
  .price-badge { font-size: 0.72rem; font-weight: 600; padding: 1px 6px; border-radius: 10px; white-space: nowrap; }
  .price-badge.drop { background: #dcfce7; color: #15803d; }
  .price-badge.rise { background: #fee2e2; color: #b91c1c; }
  .price-badge.new  { background: #e0f2fe; color: #0369a1; }
  .price-first { font-size: 0.7rem; color: #94a3b8; }

  .beds-baths { color: #475569; white-space: nowrap; }

  /* Rent cell */
  .rent-cell { min-width: 130px; }
  .rent-wrap { display: flex; align-items: center; gap: 4px; }
  .rent-input { width: 88px; padding: 5px 8px; border: 2px solid #3b82f6; border-radius: 6px; font-size: 0.9rem; font-weight: 600; color: #1e3a5f; background: #eff6ff; text-align: right; }
  .rent-input:focus { outline: none; border-color: #2563eb; background: #dbeafe; }
  .rent-label { font-size: 0.7rem; color: #94a3b8; }
  .repairs-cell { min-width: 110px; }
  .repairs-input { width: 90px; padding: 5px 8px; border: 2px solid #d97706; border-radius: 6px; font-size: 0.85rem; font-weight: 600; color: #78350f; background: #fffbeb; text-align: right; }
  .repairs-input:focus { outline: none; border-color: #b45309; background: #fef3c7; }
  .repairs-hint { font-size: 0.7rem; color: #94a3b8; margin-top: 2px; }
  .hoa-cell { min-width: 100px; }
  .hoa-input { width: 84px; padding: 5px 8px; border: 2px solid #0891b2; border-radius: 6px; font-size: 0.85rem; font-weight: 600; color: #164e63; background: #ecfeff; text-align: right; }
  .hoa-input:focus { outline: none; border-color: #0e7490; background: #cffafe; }
  .hoa-hint { font-size: 0.7rem; color: #94a3b8; margin-top: 2px; }
  .rent-range-btn { background: none; border: 1px solid #d1d5db; border-radius: 4px; cursor: pointer; padding: 1px 5px; font-size: 0.72rem; color: #6b7280; line-height: 1.5; flex-shrink:0; }
  .rent-range-btn:hover { background: #eff6ff; border-color: #93c5fd; color: #2563eb; }
  .rent-range-btn.has-range { background: #eff6ff; border-color: #93c5fd; color: #7c3aed; font-weight:700; }
  .rent-range-hint { font-size: 0.68rem; color: #7c3aed; margin-top: 2px; font-weight: 600; }
  .rent-popover { position: fixed; z-index: 9999; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.18); width: 265px; }
  .rp-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px 8px; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem; font-weight: 700; color: #1e3a5f; }
  .rp-close { background: none; border: none; cursor: pointer; font-size: 1.1rem; color: #94a3b8; padding: 0 2px; line-height: 1; }
  .rp-close:hover { color: #dc2626; }
  .rp-body { padding: 12px 14px; }
  .rp-row { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
  .rp-row label { width: 58px; font-size: 0.78rem; color: #64748b; flex-shrink: 0; }
  .rp-input { flex: 1; padding: 5px 8px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 0.85rem; }
  .rp-input:focus { outline: none; border-color: #2563eb; }
  .rp-avg-display { text-align: center; background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 6px; margin-bottom: 10px; font-size: 0.82rem; color: #15803d; }
  .rp-apply { width: 100%; padding: 8px; background: #2563eb; color: #fff; border: none; border-radius: 7px; cursor: pointer; font-weight: 600; font-size: 0.88rem; }
  .rp-apply:hover { background: #1d4ed8; }
  .notes-cell { min-width: 140px; }
  .notes-input { width: 130px; padding: 5px 7px; border: 2px solid #d1d5db; border-radius: 6px; font-size: 0.8rem; color: #374151; background: #f9fafb; resize: none; font-family: inherit; }
  .notes-input:focus { outline: none; border-color: #6b7280; background: #fff; }

  /* Metric cells */
  .metric { text-align: right; font-variant-numeric: tabular-nums; }
  .cashflow.positive { color: #16a34a; font-weight: 600; }
  .cashflow.negative { color: #dc2626; font-weight: 600; }
  .atroi { font-size: 1rem; font-weight: 700; text-align: center; border-radius: 6px; padding: 3px 8px; white-space: nowrap; }
  .atroi.great { background: #dcfce7; color: #15803d; }
  .atroi.good  { background: #fef9c3; color: #a16207; }
  .atroi.weak  { background: #fee2e2; color: #b91c1c; }
  .ppsqft { font-size: 0.8rem; color: #64748b; }

  /* School district */
  .school-cell { font-size: 0.8rem; max-width: 160px; }
  .school-link { color: #0369a1; text-decoration: none; font-weight: 500; }
  .school-link:hover { text-decoration: underline; }

  /* Mark buttons */
  .mark-cell { white-space: nowrap; }
  .mark-btn { padding: 4px 8px; border-radius: 6px; border: 1.5px solid; font-size: 0.8rem; cursor: pointer; background: white; font-weight: 600; transition: all .15s; }
  .mark-btn.potential { border-color: #16a34a; color: #16a34a; }
  .mark-btn.potential:hover, .mark-btn.potential.active { background: #16a34a; color: white; }
  .mark-btn.skip { border-color: #dc2626; color: #dc2626; }
  .mark-btn.skip:hover, .mark-btn.skip.active { background: #dc2626; color: white; }

  /* Sort buttons in headers */
  .sort-btn { cursor: pointer; background: none; border: none; font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; display: flex; align-items: center; gap: 4px; }
  .sort-btn:hover { color: #1e293b; }

  footer { text-align: center; padding: 20px; font-size: 0.75rem; color: #94a3b8; }
</style>
</head>
<body>

<header>
  <h1>Scout — PAM Texas Properties</h1>
  <div class="meta">Generated ${now} &nbsp;|&nbsp; SFR · ≤$500K · ≥3BR</div>
</header>

<div class="assumptions-panel">
  <h2>Assumptions <span style="font-weight:400;text-transform:none;letter-spacing:0">(edit and click Recalculate)</span></h2>
  <div class="assumptions-grid" id="assumptions-grid"></div>
</div>

<div class="control-bar" id="control-bar">
  <div class="filter-btns">
    <button class="filter-btn active" onclick="setFilter('all')">All</button>
    <button class="filter-btn potential" onclick="setFilter('potential')">Potentials</button>
    <button class="filter-btn skip" onclick="setFilter('skip')">Skipped</button>
  </div>
  <span id="summary-text"></span>
  <div class="spacer"></div>
  <button class="sort-trigger-btn" onclick="renderTable()">⇅ Sort</button>
  <button class="save-marks-btn" onclick="saveMarks()">💾 Save Marks</button>
</div>

<div class="table-wrap">
  <table id="props-table">
    <thead>
      <tr>
        <th><button class="sort-btn" onclick="sortBy('address')">Address ↕</button></th>
        <th><button class="sort-btn" onclick="sortBy('price')">Price ↕</button></th>
        <th>Beds/Baths</th>
        <th>Sqft</th>
        <th style="color:#d97706">Repairs $</th>
        <th style="color:#0891b2">HOA $/qtr</th>
        <th style="color:#2563eb">Est. Rent</th>
        <th><button class="sort-btn" onclick="sortBy('cashflow')">Cash Flow ↕</button></th>
        <th><button class="sort-btn" onclick="sortBy('capRate')">Cap Rate ↕</button></th>
        <th><button class="sort-btn" onclick="sortBy('cashOnCash')">CoC ↕</button></th>
        <th><button class="sort-btn" onclick="sortBy('atROI30y')">30y ATROI ↕</button></th>
        <th>School District</th>
        <th>Notes</th>
        <th>Mark</th>
      </tr>
    </thead>
    <tbody id="props-tbody"></tbody>
  </table>
</div>

<footer>Scout · Property ROI · Data from PAM Texas / IDXBroker</footer>

<script>
// ─── Finance calc ─────────────────────────────────────────────────────────────
let ASSUMPTIONS = ${assumptionsJson};
const RAW_PROPERTIES = ${propertiesJson};
const SAVED_MARKS = ${marksJson};

function mortgageMonthly(p, apr, yrs) {
  const r = apr/100/12, n = yrs*12;
  if (!r) return p/n;
  return p*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1);
}
function calcM(p, rent, a) {
  if (!p.price || !rent) return null;
  const price = p.price, hoa = p.hoaQuarterly != null ? p.hoaQuarterly / 3 : (p.hoaMonthly || 0);
  const down = price*(a.downPct/100), cc = price*(a.closingCostsPct/100);
  const rep = (p.repairCosts != null ? p.repairCosts : a.repairCosts) || 0;
  const paid = down+cc+rep, loan = price-down;
  const pI = mortgageMonthly(loan,a.rateApr,a.loanYears);
  const tax = (price*(a.taxPct/100))/12, ins = a.insuranceMonthly;
  const mgmt=rent*(a.mgmtPctRent/100), maint=rent*(a.maintPctRent/100), vac=rent*(a.vacancyPctRent/100);
  const opEx = tax+hoa+ins+maint+vac+mgmt+(a.otherMonthly||0);
  const cf = Math.round(rent-(pI+opEx));
  const noi = rent-(opEx-vac);
  const cap = Math.round((noi*12/price)*1000)/10;
  const coc = paid>0 ? Math.round((cf*12/paid)*1000)/10 : null;
  const yrs=30, eff=rent*(1-a.vacancyPctRent/100);
  const tv=price+eff*12*yrs;
  let te=paid+rent*12*(a.mgmtPctRent/100)*yrs+pI*12*yrs+tax*12*yrs+rent*12*(a.maintPctRent/100)*yrs+ins*12*yrs+hoa*12*yrs;
  const depr=(price+cc+rep+ins*12)/27.5/12;
  te+=Math.max(0,(eff-rent*(a.mgmtPctRent/100)-rent*(a.maintPctRent/100)-ins-depr-tax)*0.44)*12*yrs;
  const atroi = paid>0 ? Math.round(((tv-te)/paid/yrs)*1000)/10 : 0;
  return { pI:Math.round(pI), cf, cap, coc, atroi };
}

// ─── State ────────────────────────────────────────────────────────────────────
// Merge saved marks + localStorage so repairCosts from either source is restored
const mergedMarks = { ...SAVED_MARKS, ...loadLocalMarks() };
let properties = RAW_PROPERTIES.map(p => ({
  ...p,
  rent: p.estimatedRent,
  repairCosts:  mergedMarks[p.mlsNum]?.repairCosts  ?? null,
  hoaQuarterly: mergedMarks[p.mlsNum]?.hoaQuarterly ?? null,
  rentMin:      mergedMarks[p.mlsNum]?.rentMin      ?? null,
  rentMax:      mergedMarks[p.mlsNum]?.rentMax      ?? null,
  rentNote:     mergedMarks[p.mlsNum]?.rentNote     ?? null,
  notes:        mergedMarks[p.mlsNum]?.notes        ?? '',
}));
let sortKey = 'atroi', sortDir = -1;
let filterMode = 'all';  // 'all' | 'potential' | 'skip'

// ─── Marks — load from localStorage, fall back to embedded SAVED_MARKS ────────
const LS_KEY = 'scout_marks';
function loadLocalMarks() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
function saveLocalMarks(marks) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(marks)); } catch {}
}
// Merge: localStorage wins over saved file (localStorage is more recent)
let marks = mergedMarks;

// ─── Assumptions panel ───────────────────────────────────────────────────────
const A_LABELS = {
  downPct:'Down %', rateApr:'APR %', loanYears:'Loan Yrs',
  closingCostsPct:'Closing %', repairCosts:'Repairs $', taxPct:'Tax %',
  insuranceMonthly:'Insurance/mo', maintPctRent:'Maint %', vacancyPctRent:'Vacancy %',
  mgmtPctRent:'Mgmt %', rentPerSqft:'$/sqft/mo',
};
function renderAssumptions() {
  document.getElementById('assumptions-grid').innerHTML =
    Object.entries(A_LABELS).map(([k,lbl]) => \`
      <div class="assumption-item">
        <label>\${lbl}</label>
        <input id="a_\${k}" type="number" step="any" value="\${ASSUMPTIONS[k]}"
               onkeydown="if(event.key==='Enter')recalculate()">
      </div>\`).join('') +
    \`<div class="assumption-item" style="justify-content:flex-end">
       <label>&nbsp;</label>
       <button class="recalc-btn" onclick="recalculate()">↻ Recalculate</button>
     </div>\`;
}
function readAssumptions() {
  Object.keys(A_LABELS).forEach(k => {
    const v = parseFloat(document.getElementById('a_'+k)?.value);
    if (!isNaN(v)) ASSUMPTIONS[k] = v;
  });
}
function patchRow(idx) {
  const p = properties[idx];
  const m = calcM(p, p.rent, ASSUMPTIONS);
  const row = document.querySelector(\`tr[data-propidx="\${idx}"]\`);
  if (!row || !m) return;
  const cfCls = m.cf>0?'positive':'negative';
  const aCls  = m.atroi>=10?'great':m.atroi>=5?'good':'weak';
  row.querySelector('[data-cell="cf"]').className   = \`metric cashflow \${cfCls}\`;
  row.querySelector('[data-cell="cf"]').textContent = m.cf!=null?(m.cf>=0?'+':'')+fmt$(m.cf)+'/mo':'—';
  row.querySelector('[data-cell="cap"]').textContent  = fmtP(m.cap);
  row.querySelector('[data-cell="coc"]').textContent  = fmtP(m.coc);
  row.querySelector('[data-cell="atroi"]').innerHTML  = \`<span class="atroi \${aCls}">\${fmtP(m.atroi)}</span>\`;
}
function recalculate() {
  readAssumptions();
  properties = properties.map(p => ({
    ...p,
    rent: p.rentEdited || !p.sqft ? p.rent : Math.round(p.sqft*ASSUMPTIONS.rentPerSqft)
  }));
  properties.forEach((_, i) => patchRow(i));
  updateSummary();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt$(n)  { return n==null?'—':'$'+n.toLocaleString(); }
function fmtP(n)  { return n==null?'—':n.toFixed(1)+'%'; }
function fmtDays(d) { return d<1?'today':d===1?'1 day ago':d<30?d+' days ago':d<365?Math.round(d/30)+' mo ago':Math.round(d/365)+'yr ago'; }

function priceBadge(pi) {
  if (!pi) return \`<span class="price-badge new">NEW</span>\`;
  if (pi.snapshotCount < 2) return '';
  const diff = pi.changeFromPrev;
  if (diff === 0) return '';
  const cls   = diff < 0 ? 'drop' : 'rise';
  const arrow = diff < 0 ? '↓' : '↑';
  return \`<span class="price-badge \${cls}" title="Changed \${fmtDays(pi.daysSincePrevChange)}">\${arrow}\${fmt$(Math.abs(diff))}</span>\`;
}

// ─── Filter ───────────────────────────────────────────────────────────────────
function setFilter(mode) {
  filterMode = mode;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(\`.filter-btn.\${mode === 'all' ? 'active' : mode}\`)?.classList.add('active');
  if (mode === 'all') document.querySelectorAll('.filter-btn')[0].classList.add('active');
  renderTable();
}

// ─── Marks ────────────────────────────────────────────────────────────────────
function toggleMark(mlsNum, status) {
  const current = marks[mlsNum]?.status;
  if (current === status) {
    delete marks[mlsNum];
  } else {
    marks[mlsNum] = { status, markedAt: new Date().toISOString() };
  }
  saveLocalMarks(marks);
  // refresh the row's mark buttons + row class
  const idx = properties.findIndex(p => p.mlsNum === mlsNum);
  if (idx < 0) return;
  const row = document.querySelector(\`tr[data-propidx="\${idx}"]\`);
  if (!row) return;
  applyRowStatus(row, marks[mlsNum]?.status ?? null);
  row.querySelector('.mark-cell').innerHTML = markCellHtml(mlsNum);
  updateSummary();
  // hide row if filter doesn't match
  const show = shouldShow(mlsNum);
  row.style.display = show ? '' : 'none';
}

function shouldShow(mlsNum) {
  const status = marks[mlsNum]?.status ?? null;
  if (filterMode === 'all') return true;
  if (filterMode === 'potential') return status === 'potential';
  if (filterMode === 'skip') return status === 'skip';
  return true;
}

function applyRowStatus(row, status) {
  row.classList.remove('status-potential','status-skip');
  if (status === 'potential') row.classList.add('status-potential');
  if (status === 'skip')      row.classList.add('status-skip');
}

function markCellHtml(mlsNum) {
  const status = marks[mlsNum]?.status ?? null;
  return \`<button class="mark-btn potential\${status==='potential'?' active':''}" onclick="toggleMark('\${mlsNum}','potential')" title="Mark as Potential">✓</button>
          <button class="mark-btn skip\${status==='skip'?' active':''}" onclick="toggleMark('\${mlsNum}','skip')" title="Skip this property">✗</button>\`;
}

// ─── Save Marks (download marks.json to scout/ folder) ───────────────────────
function saveMarks() {
  // Merge in per-property repair costs before saving
  properties.forEach(p => {
    if (!p.mlsNum) return;
    if (p.repairCosts != null || p.hoaQuarterly != null) {
      if (!marks[p.mlsNum]) marks[p.mlsNum] = { markedAt: new Date().toISOString() };
    }
    if (p.repairCosts != null) {
      marks[p.mlsNum].repairCosts = p.repairCosts;
    } else if (marks[p.mlsNum]) {
      delete marks[p.mlsNum].repairCosts;
    }
    if (p.hoaQuarterly != null) {
      marks[p.mlsNum].hoaQuarterly = p.hoaQuarterly;
    } else if (marks[p.mlsNum]) {
      delete marks[p.mlsNum].hoaQuarterly;
    }
    if (p.notes) {
      marks[p.mlsNum].notes = p.notes;
    } else if (marks[p.mlsNum]) {
      delete marks[p.mlsNum].notes;
    }
    if (p.rentMin  != null) { marks[p.mlsNum].rentMin  = p.rentMin;  } else if (marks[p.mlsNum]) delete marks[p.mlsNum].rentMin;
    if (p.rentMax  != null) { marks[p.mlsNum].rentMax  = p.rentMax;  } else if (marks[p.mlsNum]) delete marks[p.mlsNum].rentMax;
    if (p.rentNote)         { marks[p.mlsNum].rentNote = p.rentNote; } else if (marks[p.mlsNum]) delete marks[p.mlsNum].rentNote;
  });
  saveLocalMarks(marks);
  const blob = new Blob([JSON.stringify(marks, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'marks.json'; a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Summary ─────────────────────────────────────────────────────────────────
function updateSummary() {
  const vis = properties.filter(p => shouldShow(p.mlsNum));
  const potCount = Object.values(marks).filter(m=>m.status==='potential').length;
  const skipCount = Object.values(marks).filter(m=>m.status==='skip').length;
  const great = properties.filter(p => { const m=calcM(p,p.rent,ASSUMPTIONS); return m&&m.atroi>=10; }).length;
  document.getElementById('summary-text').innerHTML =
    \`<strong>\${properties.length}</strong> total &nbsp;·&nbsp;
     <strong style="color:#15803d">\${great}</strong> ATROI≥10% &nbsp;·&nbsp;
     <strong style="color:#16a34a">\${potCount}</strong> potential &nbsp;·&nbsp;
     <strong style="color:#dc2626">\${skipCount}</strong> skipped\`;
}

// ─── Render table ─────────────────────────────────────────────────────────────
function renderTable() {
  const sorted = [...properties].sort((a, b) => {
    if (sortKey==='price')   return sortDir*(a.price-b.price);
    if (sortKey==='address') return sortDir*a.address.localeCompare(b.address);
    const ma=calcM(a,a.rent,ASSUMPTIONS), mb=calcM(b,b.rent,ASSUMPTIONS);
    const va=ma?(ma[sortKey]??ma.atroi):-999, vb=mb?(mb[sortKey]??mb.atroi):-999;
    return sortDir*(va-vb);
  });

  const tbody = document.getElementById('props-tbody');
  tbody.innerHTML = sorted.map(p => {
    const origIdx = properties.indexOf(p);
    const m  = calcM(p, p.rent, ASSUMPTIONS);
    const pi = p.priceInfo;
    const status = marks[p.mlsNum]?.status ?? null;
    const ppsqft = p.sqft ? Math.round(p.price/p.sqft) : null;
    const cf = m?.cf, cfCls = cf>0?'positive':'negative';
    const atroi = m?.atroi, aCls = atroi>=10?'great':atroi>=5?'good':'weak';
    const rowCls = status==='potential'?'status-potential':status==='skip'?'status-skip':'';
    const show = shouldShow(p.mlsNum);

    // School district
    const school = p.schoolDistrict;
    const schoolHtml = school
      ? \`<a class="school-link" href="https://www.greatschools.org/search/search.page?q=\${encodeURIComponent(school)}&state=TX" target="_blank">\${school}</a>\`
      : \`<span style="color:#cbd5e1">—</span>\`;

    return \`<tr data-propidx="\${origIdx}" class="\${rowCls}" style="\${show?'':'display:none'}">
      <td class="address-cell">
        <div class="addr-row">
          \${p.href?\`<a href="\${p.href}" target="_blank">\${p.address||'View listing'}</a>\`:(p.address||'—')}
          \${p.address?\`<button class="copy-btn" onclick="copyAddr(this,'\${(p.address||'').replace(/'/g,'\\\\'')}')" title="Copy address">⎘</button>\`:''}
        </div>
        \${p.mlsNum?\`<div class="sub">MLS# \${p.mlsNum}</div>\`:''}
        \${pi&&pi.daysSinceFirst>0?\`<div class="sub">First seen \${fmtDays(pi.daysSinceFirst)}</div>\`:''}
      </td>
      <td class="metric">
        <div class="price-wrap">
          <span class="price-val">\${fmt$(p.price)}</span>
          \${priceBadge(pi)}
          \${pi&&pi.snapshotCount>=2&&pi.changeFromFirst!==0?\`<span class="price-first">was \${fmt$(pi.firstPrice)}</span>\`:''}
        </div>
      </td>
      <td class="beds-baths">\${p.beds}bd / \${p.baths}ba</td>
      <td class="metric">\${p.sqft?p.sqft.toLocaleString()+' sqft':'—'}<br>\${ppsqft?\`<span class="ppsqft">\${fmt$(ppsqft)}/sqft</span>\`:''}
      </td>
      <td class="repairs-cell">
        <div class="rent-wrap">
          <input class="repairs-input" type="number" value="\${p.repairCosts!=null?p.repairCosts:''}"
                 placeholder="\${ASSUMPTIONS.repairCosts}"
                 oninput="updateRepairs(\${origIdx},this.value)"
                 title="Per-property repair budget. Blank = global default (\$\${ASSUMPTIONS.repairCosts.toLocaleString()})">
        </div>
        <div class="repairs-hint">default: \$\${ASSUMPTIONS.repairCosts.toLocaleString()}</div>
      </td>
      <td class="hoa-cell">
        <div class="rent-wrap">
          <input class="hoa-input" type="number" value="\${p.hoaQuarterly!=null?p.hoaQuarterly:''}"
                 placeholder="0"
                 oninput="updateHoa(\${origIdx},this.value)"
                 title="Quarterly HOA fee. Divided by 3 for monthly calc.">
        </div>
        \${p.hoaQuarterly?\`<div class="hoa-hint">\${fmt$(Math.round(p.hoaQuarterly/3))}/mo</div>\`:'<div class="hoa-hint">no HOA</div>'}
      </td>
      <td class="rent-cell">
        <div class="rent-wrap">
          <input class="rent-input" type="number" value="\${p.rent||''}" placeholder="enter rent"
                 oninput="updateRent(\${origIdx},this.value)">
          <span class="rent-label">/mo</span>
          <button class="rent-range-btn\${p.rentMin!=null||p.rentMax!=null?' has-range':''}"
                  onclick="openRentPopover(\${origIdx},this)" title="Set min/max rent range">≈</button>
        </div>
        \${(p.rentMin!=null||p.rentMax!=null)?\`<div class="rent-range-hint">\${p.rentMin!=null?'$'+p.rentMin.toLocaleString():'?'}–\${p.rentMax!=null?'$'+p.rentMax.toLocaleString():'?'}</div>\`:''}
        \${p.sqft?\`<div style="font-size:.72rem;color:#94a3b8;margin-top:2px">@\${ASSUMPTIONS.rentPerSqft}/sqft</div>\`:''}
      </td>
      <td class="metric cashflow \${cfCls}" data-cell="cf">\${cf!=null?(cf>=0?'+':'')+fmt$(cf)+'/mo':'—'}</td>
      <td class="metric" data-cell="cap">\${fmtP(m?.cap)}</td>
      <td class="metric" data-cell="coc">\${fmtP(m?.coc)}</td>
      <td class="metric" data-cell="atroi"><span class="atroi \${aCls}">\${fmtP(atroi)}</span></td>
      <td class="school-cell">\${schoolHtml}</td>
      <td class="notes-cell">
        <textarea class="notes-input" rows="2" placeholder="notes…"
          oninput="updateNotes(\${origIdx},this.value)">\${(p.notes||'').replace(/</g,'&lt;')}</textarea>
      </td>
      <td class="mark-cell">\${markCellHtml(p.mlsNum)}</td>
    </tr>\`;
  }).join('');

  updateSummary();
}

// ─── Rent & repairs editing (in-place, no re-sort) ────────────────────────────
function updateRent(idx, val) {
  const rent = parseFloat(val);
  properties[idx].rent = isNaN(rent) ? null : rent;
  properties[idx].rentEdited = !isNaN(rent) && val !== '';
  patchRow(idx);
  updateSummary();
}

function copyAddr(btn, addr) {
  navigator.clipboard.writeText(addr).then(() => {
    btn.classList.add('copied');
    btn.textContent = '✓';
    setTimeout(() => { btn.classList.remove('copied'); btn.textContent = '⎘'; }, 1500);
  });
}

function updateRepairs(idx, val) {
  const rep = parseFloat(val);
  properties[idx].repairCosts = isNaN(rep) || val === '' ? null : rep;
  patchRow(idx);
  updateSummary();
}

function updateNotes(idx, val) {
  properties[idx].notes = val;
  const mlsNum = properties[idx].mlsNum;
  if (!mlsNum) return;
  if (!marks[mlsNum]) marks[mlsNum] = { markedAt: new Date().toISOString() };
  if (val) marks[mlsNum].notes = val;
  else delete marks[mlsNum].notes;
  saveLocalMarks(marks);
}

function updateHoa(idx, val) {
  const hoa = parseFloat(val);
  properties[idx].hoaQuarterly = isNaN(hoa) || val === '' ? null : hoa;
  // Update the hint below the input
  const row = document.querySelector(\`tr[data-propidx="\${idx}"]\`);
  if (row) {
    const hint = row.querySelector('.hoa-hint');
    if (hint) hint.textContent = properties[idx].hoaQuarterly ? fmt$(Math.round(properties[idx].hoaQuarterly/3))+'/mo' : 'no HOA';
  }
  patchRow(idx);
  updateSummary();
}

// ─── Rent popover (min / max / source) ───────────────────────────────────────
let rentPopoverIdx = null;

function openRentPopover(idx, btn) {
  rentPopoverIdx = idx;
  const p = properties[idx];
  document.getElementById('rp-min').value  = p.rentMin  != null ? p.rentMin  : '';
  document.getElementById('rp-max').value  = p.rentMax  != null ? p.rentMax  : '';
  document.getElementById('rp-note').value = p.rentNote || '';
  updateRentPopoverAvg();
  const pop  = document.getElementById('rent-popover');
  pop.style.display = 'block';
  const rect = btn.getBoundingClientRect();
  const popW = 265;
  let left = rect.left;
  if (left + popW > window.innerWidth - 10) left = window.innerWidth - popW - 10;
  let top = rect.bottom + 6;
  if (top + 220 > window.innerHeight - 10) top = rect.top - 220 - 6;
  pop.style.top  = top  + 'px';
  pop.style.left = left + 'px';
}

function closeRentPopover() {
  document.getElementById('rent-popover').style.display = 'none';
  rentPopoverIdx = null;
}

function updateRentPopoverAvg() {
  const minRaw = document.getElementById('rp-min').value;
  const maxRaw = document.getElementById('rp-max').value;
  const min = parseFloat(minRaw), max = parseFloat(maxRaw);
  let a = null;
  if (!isNaN(min) && !isNaN(max)) a = Math.round((min + max) / 2);
  else if (!isNaN(min)) a = min;
  else if (!isNaN(max)) a = max;
  document.getElementById('rp-avg-val').textContent = a != null ? '$' + a.toLocaleString() + '/mo' : '—';
}

function saveRentPopover() {
  if (rentPopoverIdx === null) return;
  const minRaw  = document.getElementById('rp-min').value;
  const maxRaw  = document.getElementById('rp-max').value;
  const noteVal = document.getElementById('rp-note').value.trim();
  const p = properties[rentPopoverIdx];
  p.rentMin  = minRaw  !== '' ? parseFloat(minRaw)  : null;
  p.rentMax  = maxRaw  !== '' ? parseFloat(maxRaw)  : null;
  p.rentNote = noteVal || null;
  let a = null;
  if (p.rentMin != null && p.rentMax != null) a = Math.round((p.rentMin + p.rentMax) / 2);
  else if (p.rentMin != null) a = p.rentMin;
  else if (p.rentMax != null) a = p.rentMax;
  if (a != null) { p.rent = a; p.rentEdited = true; }
  // Update DOM without full re-render
  const row = document.querySelector(\`tr[data-propidx="\${rentPopoverIdx}"]\`);
  if (row) {
    const inp = row.querySelector('.rent-input');
    if (inp && a != null) inp.value = a;
    const btn = row.querySelector('.rent-range-btn');
    if (btn) { btn.classList.toggle('has-range', p.rentMin != null || p.rentMax != null); }
    // Update or inject range hint
    let hint = row.querySelector('.rent-range-hint');
    if (p.rentMin != null || p.rentMax != null) {
      const txt = (p.rentMin!=null?'$'+p.rentMin.toLocaleString():'?') + '–' + (p.rentMax!=null?'$'+p.rentMax.toLocaleString():'?');
      if (hint) { hint.textContent = txt; }
      else {
        hint = document.createElement('div');
        hint.className = 'rent-range-hint';
        hint.textContent = txt;
        row.querySelector('.rent-cell .rent-wrap').insertAdjacentElement('afterend', hint);
      }
    } else if (hint) { hint.remove(); }
  }
  // Persist
  if (p.mlsNum) {
    if (!marks[p.mlsNum]) marks[p.mlsNum] = { markedAt: new Date().toISOString() };
    if (p.rentMin  != null) marks[p.mlsNum].rentMin  = p.rentMin;  else delete marks[p.mlsNum].rentMin;
    if (p.rentMax  != null) marks[p.mlsNum].rentMax  = p.rentMax;  else delete marks[p.mlsNum].rentMax;
    if (p.rentNote)         marks[p.mlsNum].rentNote = p.rentNote; else delete marks[p.mlsNum].rentNote;
    saveLocalMarks(marks);
  }
  patchRow(rentPopoverIdx);
  updateSummary();
  closeRentPopover();
}

function sortBy(key) {
  sortDir = sortKey===key ? sortDir*-1 : -1;
  sortKey = key;
  renderTable();
}

// ─── Init ─────────────────────────────────────────────────────────────────────
renderAssumptions();
renderTable();

// Close popover on outside click
document.addEventListener('click', () => {
  if (rentPopoverIdx !== null) closeRentPopover();
});
</script>

<div id="rent-popover" class="rent-popover" style="display:none" onclick="event.stopPropagation()">
  <div class="rp-header">
    <span>📊 Rent Research</span>
    <button class="rp-close" onclick="closeRentPopover()">×</button>
  </div>
  <div class="rp-body">
    <div class="rp-row">
      <label>Min $/mo</label>
      <input id="rp-min" type="number" class="rp-input" placeholder="1100" oninput="updateRentPopoverAvg()">
    </div>
    <div class="rp-row">
      <label>Max $/mo</label>
      <input id="rp-max" type="number" class="rp-input" placeholder="1500" oninput="updateRentPopoverAvg()">
    </div>
    <div class="rp-avg-display">Avg: <strong id="rp-avg-val">—</strong></div>
    <div class="rp-row">
      <label>Source</label>
      <input id="rp-note" type="text" class="rp-input" style="font-size:0.78rem" placeholder="Zillow, Rentometer, comp at 123 Main…">
    </div>
    <button class="rp-apply" onclick="saveRentPopover()">✓ Apply Average to Calculation</button>
  </div>
</div>
</body>
</html>`;
}

scrape().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  if (DEBUG) console.error(err.stack);
  process.exit(1);
});
