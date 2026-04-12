/**
 * Discover active Elon Musk tweet prediction markets via Gamma API.
 *
 * Strategy A: Broad active-events search, filter by title/slug keywords.
 * Strategy B: Probe date-based candidate slugs directly.
 *
 * Returns: [{ slug, title, endDate, startDate, volume, liquidity, ranges[] }]
 */

const GAMMA = 'https://gamma-api.polymarket.com';
const MONTHS = [
  'january','february','march','april','may','june',
  'july','august','september','october','november','december',
];

function candidateSlugs() {
  const now = new Date();
  const seen = new Set();
  const slugs = [];
  for (let d = -14; d <= 10; d++) {
    const start = new Date(now.getTime() + d * 86400000);
    const end   = new Date(start.getTime() + 7 * 86400000);
    const slug = `elon-musk-of-tweets-${MONTHS[start.getUTCMonth()]}-${start.getUTCDate()}-${MONTHS[end.getUTCMonth()]}-${end.getUTCDate()}`;
    if (!seen.has(slug)) { seen.add(slug); slugs.push(slug); }
  }
  return slugs;
}

function extractRange(question = '') {
  const m = question.match(/(\d+-\d+|\d+\+)/);
  return m ? m[1] : null;
}

async function fetchEventBySlug(slug) {
  const res = await fetch(`${GAMMA}/events?slug=${encodeURIComponent(slug)}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.[0] ?? null;
}

function parseEvent(event, slug) {
  const now = new Date();
  const endDate = event.endDate || event.end_date;
  if (!endDate || new Date(endDate) <= now) return null;
  if (event.closed || event.archived) return null;

  const ranges = (event.markets || [])
    .map(m => {
      const range = extractRange(m.question || '');
      if (!range) return null;
      let price = null;
      try {
        const prices = typeof m.outcomePrices === 'string'
          ? JSON.parse(m.outcomePrices)
          : (m.outcomePrices ?? []);
        price = prices[0] != null ? Math.round(parseFloat(prices[0]) * 1000) / 10 : null;
      } catch { /* ignore */ }
      return {
        range,
        price,
        liquidity: parseFloat(m.liquidity ?? 0),
        slug: m.slug ?? '',
      };
    })
    .filter(r => r && r.price !== null)
    .sort((a, b) => {
      const aMin = parseInt(a.range.split('-')[0]) || parseInt(a.range) || 9999;
      const bMin = parseInt(b.range.split('-')[0]) || parseInt(b.range) || 9999;
      return aMin - bMin;
    });

  return {
    slug: event.slug ?? slug,
    title: event.title ?? '',
    startDate: event.startDate ?? event.start_date ?? '',
    endDate,
    volume: parseFloat(event.volume ?? 0),
    liquidity: parseFloat(event.liquidity ?? 0),
    scraped_at: new Date().toISOString(),
    ranges,
    top_ranges: [...ranges].sort((a, b) => b.price - a.price).slice(0, 3),
  };
}

// Simple in-process cache (persists across warm invocations on Vercel)
let cache = { data: null, ts: 0 };
const CACHE_TTL = 4 * 60 * 1000; // 4 minutes

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=240, stale-while-revalidate=60');

  const forceRefresh = req.query.refresh === '1';
  const now = Date.now();
  if (!forceRefresh && cache.data && now - cache.ts < CACHE_TTL) {
    return res.status(200).json({ markets: cache.data, fromCache: true });
  }

  const found = [];

  // ── Strategy A: broad Gamma search ──────────────────────────────────────────
  try {
    const r = await fetch(
      `${GAMMA}/events?active=true&closed=false&limit=200&order=endDate&ascending=true`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
    );
    if (r.ok) {
      const events = await r.json();
      for (const ev of events) {
        const title = (ev.title ?? '').toLowerCase();
        const slug  = (ev.slug  ?? '').toLowerCase();
        if ((title.includes('elon') || slug.includes('elon-musk')) &&
            (title.includes('tweet') || title.includes('post'))) {
          const parsed = parseEvent(ev, ev.slug);
          if (parsed) found.push(parsed);
        }
      }
    }
  } catch (e) {
    console.error('[discover] Strategy A error:', e.message);
  }

  // ── Strategy B: probe candidate slugs not already found ────────────────────
  const foundSlugs = new Set(found.map(m => m.slug));
  const candidates = candidateSlugs().filter(s => !foundSlugs.has(s));

  await Promise.allSettled(
    candidates.map(async slug => {
      try {
        const ev = await fetchEventBySlug(slug);
        if (!ev) return;
        const parsed = parseEvent(ev, slug);
        if (parsed && !foundSlugs.has(parsed.slug)) {
          foundSlugs.add(parsed.slug);
          found.push(parsed);
        }
      } catch { /* ignore */ }
    })
  );

  found.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());

  if (found.length > 0) {
    cache = { data: found, ts: now };
  }

  return res.status(200).json({ markets: found, fromCache: false });
}
