/**
 * /api/xtracker
 *
 * 数据源优先级：
 *   1. polystrike.xyz（主力）— 社区抓取 real_counter + oracle_counter，免费无 Key
 *   2. twitterapi.io（fallback）— 自己翻页计数，受 Vercel 10s 限制
 *   3. xtracker.polymarket.com（最后兜底）— 官方但经常挂
 *
 * 市场元数据：Gamma API（候选 slug 枚举）
 */


const TWITTERAPI_KEY = process.env.TWITTERAPI_KEY || 'new1_8452e6aed9cd49e9b163a11635102474';
const REFERRAL_CODE  = '?via=serene77mc-g6kj';
const GAMMA          = 'https://gamma-api.polymarket.com';
const POLYSTRIKE     = 'https://polystrike.xyz/api/v1/meta/elon';
const MONTHS = [
  'january','february','march','april','may','june',
  'july','august','september','october','november','december',
];

let _cache = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000;

// ── Gamma：候选 slug ────────────────────────────────────────
function candidateSlugs() {
  const now  = new Date();
  const seen = new Set();
  const slugs = [];
  for (let d = -7; d <= 7; d++) {
    const start = new Date(now.getTime() + d * 86400000);
    const end   = new Date(start.getTime() + 7 * 86400000);
    const slug  = `elon-musk-of-tweets-${MONTHS[start.getUTCMonth()]}-${start.getUTCDate()}-${MONTHS[end.getUTCMonth()]}-${end.getUTCDate()}`;
    if (!seen.has(slug)) { seen.add(slug); slugs.push(slug); }
  }
  return slugs;
}

async function fetchEventBySlug(slug) {
  try {
    const res = await fetch(`${GAMMA}/events?slug=${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const events = Array.isArray(data) ? data : data.data || [];
    return events.find(e => e.slug === slug) || null;
  } catch { return null; }
}

async function fetchActiveMarkets() {
  const now = new Date();

  // 主路径：xtracker trackings（startDate/endDate 是正确的推文计数窗口）
  try {
    const resp = await fetch(
      'https://xtracker.polymarket.com/api/users/elonmusk/trackings?activeOnly=true',
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) }
    );
    if (resp.ok) {
      const data = await resp.json();
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        const trackings = data.data
          .filter(t => {
            const end = new Date(t.endDate);
            const diff = (new Date(t.endDate) - new Date(t.startDate)) / 86400000;
            return end > now && diff >= 1 && diff <= 10;
          })
          .map(t => {
            // 从 title 推断 slug：e.g. "Elon Musk # tweets May 26 - June 2, 2026?"
            const slug = titleToSlug(t.title);
            return {
              id: t.id, title: t.title,
              startDate: t.startDate, endDate: t.endDate,
              marketLink: `https://polymarket.com/event/${slug}${REFERRAL_CODE}`,
              slug, source: 'xtracker',
            };
          });
        if (trackings.length > 0) return trackings;
      }
    }
  } catch (e) { console.warn('[fetchActiveMarkets xtracker]', e.message); }

  // 备用路径：Gamma API（注意：startDate 是创建时间，不是计数窗口，仅用于展示）
  const slugs = candidateSlugs();
  const results = await Promise.allSettled(slugs.map(fetchEventBySlug));
  const markets = [];
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const ev = r.value;
    const end = new Date(ev.end_date_iso || ev.endDate);
    if (isNaN(end.getTime()) || end <= now) continue;
    // Gamma startDate 是创建时间，用 end-7d 作为估算计数窗口
    const estimatedStart = new Date(end.getTime() - 7 * 86400000);
    markets.push({
      id: ev.id || ev.slug, title: ev.title,
      startDate: estimatedStart.toISOString(), endDate: end.toISOString(),
      marketLink: `https://polymarket.com/event/${ev.slug}${REFERRAL_CODE}`,
      slug: ev.slug, source: 'gamma-fallback',
    });
  }
  return markets;
}

// title → slug：e.g. "Elon Musk # tweets May 26 - June 2, 2026?" → "elon-musk-of-tweets-may-26-june-2"
function titleToSlug(title) {
  const m = title.match(/tweets\s+(\w+)\s+(\d+)\s*[-–]\s*(\w+)\s+(\d+)/i);
  if (!m) return '';
  const [, m1, d1, m2, d2] = m;
  return `elon-musk-of-tweets-${m1.toLowerCase()}-${d1}-${m2.toLowerCase()}-${d2}`;
}

// ── 数据源 A：xtracker posts API（主力）────────────────────
// 官方 posts 接口支持时间过滤，直接返回该区间全部推文数
async function fetchFromXtrackerPosts(startDate, endDate) {
  const url = `https://xtracker.polymarket.com/api/users/elonmusk/posts?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&limit=1000`;
  const resp = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`xtracker posts ${resp.status}`);
  const json = await resp.json();
  const posts = json.data || [];
  if (!posts.length) throw new Error('xtracker posts: no data');
  return posts.length;
}

// ── 数据源 B：polystrike.xyz（fallback）─────────────────────
async function fetchFromPolystrike() {
  const resp = await fetch(POLYSTRIKE, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  });
  if (!resp.ok) throw new Error(`polystrike ${resp.status}`);
  const json = await resp.json();
  if (!Array.isArray(json.data) || json.data.length === 0) throw new Error('polystrike: empty data');
  return json.data;
}

// ── 数据源 B：twitterapi.io 自翻页（fallback）───────────────
async function fetchRecentTweets(daysBack = 8) {
  const cutoffMs = Date.now() - daysBack * 86400000;
  const allTweets = [];
  let cursor = null;
  let page   = 0;
  const MAX_PAGES = 12;

  while (page < MAX_PAGES) {
    const url = cursor
      ? `https://api.twitterapi.io/twitter/user/last_tweets?userName=elonmusk&cursor=${encodeURIComponent(cursor)}`
      : `https://api.twitterapi.io/twitter/user/last_tweets?userName=elonmusk`;

    const resp = await fetch(url, {
      headers: { 'X-API-Key': TWITTERAPI_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error(`twitterapi.io ${resp.status}`);

    const json   = await resp.json();
    const tweets = json.data?.tweets || [];

    let done = false;
    for (const t of tweets) {
      if (t.isReply) continue;
      const ts = new Date(t.createdAt).getTime();
      if (isNaN(ts)) continue;
      if (ts < cutoffMs) { done = true; break; }
      allTweets.push({ ...t, _ts: ts });
    }

    if (done || !json.has_next_page || !json.next_cursor) break;
    cursor = json.next_cursor;
    page++;
  }

  console.log(`[twitterapi] ${allTweets.length} 条推文 (${page+1} 页, ${daysBack}天内)`);
  return allTweets;
}

function aggregateByBjDate(tweets) {
  const map = new Map();
  for (const t of tweets) {
    const bj = new Date(t._ts + 8 * 3600000).toISOString().split('T')[0];
    map.set(bj, (map.get(bj) || 0) + 1);
  }
  return map;
}

// ── 主 Handler ──────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (_cache.data && Date.now() - _cache.ts < CACHE_TTL) {
    return res.status(200).json({ ..._cache.data, fromCache: true });
  }

  try {
    // 先拉市场列表 + polystrike（并发）
    const [markets, polystrikeData] = await Promise.all([
      fetchActiveMarkets(),
      fetchFromPolystrike().catch(e => { console.warn('[polystrike] failed:', e.message); return null; }),
    ]);

    if (markets.length === 0) {
      return res.status(200).json({ success: true, trackings: [], lastUpdated: new Date().toISOString() });
    }

    const now = new Date();

    // 并发：对每个市场同时请求 xtracker posts API
    const trackings = await Promise.all(markets.map(async (market) => {
      try {
        const startMs = new Date(market.startDate).getTime();
        const endMs   = new Date(market.endDate).getTime();
        const diffMs  = endMs - now.getTime();
        const daysRemaining  = Math.max(0, Math.floor(diffMs / 86400000));
        const hoursRemaining = Math.max(0, Math.floor((diffMs % 86400000) / 3600000));
        const elapsedDays    = Math.max(0.01, (now.getTime() - startMs) / 86400000);
        const daysTotal      = (endMs - startMs) / 86400000;
        const percentComplete = Math.min(100, Math.round((elapsedDays / daysTotal) * 100));

        let total = 0;
        let dataSource = 'unknown';
        const daily = [];
        let todayTotal = 0;

        // 路径 A：polystrike oracle_counter（主力）— 与 Polymarket 官方计数完全一致
        if (polystrikeData) {
          const match = polystrikeData.find(p => p.slug === market.slug)
            || polystrikeData.find(p => Math.abs(p.end_ts - endMs) < 12 * 60 * 60 * 1000);
          if (match) {
            // 优先用 oracle_counter（Polymarket 官方），其次 real_counter
            const count = match.polymarket_xtracker_counter > 0
              ? match.polymarket_xtracker_counter
              : match.real_counter;
            if (count > 0) {
              total = count;
              dataSource = 'polystrike';
              console.log(`[polystrike] ${market.slug}: oracle=${match.polymarket_xtracker_counter} real=${match.real_counter}`);
            }
          }
        }

        // 路径 B：xtracker 官方 posts API（备用）
        if (dataSource === 'unknown') {
          try {
            total = await fetchFromXtrackerPosts(market.startDate, market.endDate);
            dataSource = 'xtracker-posts';
            console.log(`[xtracker-posts] ${market.slug}: ${total}条`);
          } catch (e) {
            console.warn(`[xtracker-posts] failed for ${market.slug}:`, e.message);
          }
        }

        // 注意：twitterapi.io 已移除，它的计数不符合 Polymarket 规则（含回复/引用）

        const pace = Math.round(total / elapsedDays);

        return {
          ...market,
          stats: {
            total, pace, percentComplete,
            daysElapsed:   Math.floor(elapsedDays),
            daysRemaining, hoursRemaining,
            daysTotal:     Math.round(daysTotal),
            daily, todayTotal,
            dataSource,
          },
        };
      } catch (e) {
        console.error(`[xtracker] 统计失败 ${market.id}:`, e.message);
        return { ...market, stats: null };
      }
    }));

    const result = { success: true, trackings, lastUpdated: new Date().toISOString() };
    _cache = { data: result, ts: Date.now() };
    return res.status(200).json(result);

  } catch (error) {
    console.error('xtracker handler error:', error);
    if (_cache.data) return res.status(200).json({ ..._cache.data, fromCache: true, stale: true });
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
