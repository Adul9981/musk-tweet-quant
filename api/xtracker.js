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
  const now    = new Date();
  const slugs  = candidateSlugs();
  const results= await Promise.allSettled(slugs.map(fetchEventBySlug));
  const markets = [];

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const ev  = r.value;
    const end = new Date(ev.end_date_iso || ev.endDate);
    if (isNaN(end.getTime()) || end <= now) continue;
    const start = new Date(ev.start_date_iso || ev.startDate);
    markets.push({
      id: ev.id || ev.slug, title: ev.title,
      startDate: start.toISOString(), endDate: end.toISOString(),
      marketLink: `https://polymarket.com/event/${ev.slug}${REFERRAL_CODE}`,
      slug: ev.slug, source: 'gamma',
    });
  }

  if (markets.length === 0) {
    try {
      const resp = await fetch(
        'https://xtracker.polymarket.com/api/users/elonmusk/trackings?activeOnly=true',
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data.success && data.data?.length > 0) {
          return data.data
            .filter(t => {
              const diff = (new Date(t.endDate) - new Date(t.startDate)) / 86400000;
              return diff >= 6 && diff <= 8;
            })
            .map(t => ({
              id: t.id, title: t.title,
              startDate: t.startDate, endDate: t.endDate,
              marketLink: t.marketLink + (t.marketLink.includes('?') ? '&' : REFERRAL_CODE),
              slug: t.marketLink?.split('/').pop()?.split('?')[0] || '',
              source: 'xtracker',
            }));
        }
      }
    } catch (e) { console.warn('[xtracker fallback]', e.message); }
  }

  return markets;
}

// ── 数据源 A：polystrike.xyz（主力）─────────────────────────
async function fetchFromPolystrike() {
  const resp = await fetch(POLYSTRIKE, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  });
  if (!resp.ok) throw new Error(`polystrike ${resp.status}`);
  const json = await resp.json();
  // 返回格式: { timestamp, data: [ { event_id, slug, start_ts, end_ts, real_counter, polymarket_xtracker_counter, ... } ] }
  if (!Array.isArray(json.data) || json.data.length === 0) throw new Error('polystrike: empty data');
  return json.data; // 每条对应一个市场周期
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
    // 并发拉取：市场元数据 + polystrike 计数
    const [markets, polystrikeData] = await Promise.all([
      fetchActiveMarkets(),
      fetchFromPolystrike().catch(e => { console.warn('[polystrike] failed:', e.message); return null; }),
    ]);

    if (markets.length === 0) {
      return res.status(200).json({ success: true, trackings: [], lastUpdated: new Date().toISOString() });
    }

    // polystrike 失败时再拉 twitterapi
    let fallbackTweets = null;
    if (!polystrikeData) {
      console.warn('[xtracker] polystrike failed, falling back to twitterapi.io');
      fallbackTweets = await fetchRecentTweets(8).catch(() => []);
    }

    const now = new Date();

    const trackings = markets.map((market) => {
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
        let daily = [];
        let todayTotal = 0;

        // 路径 A：polystrike 命中
        if (polystrikeData) {
          // 用 start_ts / end_ts 匹配（误差 ±1分钟内）
          const match = polystrikeData.find(p =>
            Math.abs(p.start_ts - startMs) < 60 * 60 * 1000 &&
            Math.abs(p.end_ts   - endMs)   < 60 * 60 * 1000
          );
          if (match) {
            // 优先 real_counter，其次 polymarket_xtracker_counter
            total = match.real_counter ?? match.polymarket_xtracker_counter ?? 0;
            dataSource = 'polystrike';
            console.log(`[polystrike] ${market.slug}: real=${match.real_counter} oracle=${match.polymarket_xtracker_counter}`);
          } else {
            console.warn(`[polystrike] no match for ${market.slug} (startMs=${startMs})`);
          }
        }

        // 路径 B：twitterapi.io fallback（有 daily breakdown）
        if (dataSource === 'unknown' && fallbackTweets) {
          const periodTweets = fallbackTweets.filter(t => t._ts >= startMs && t._ts <= endMs);
          const dailyMap     = aggregateByBjDate(periodTweets);
          daily = Array.from(dailyMap.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));
          const todayBj = new Date(now.getTime() + 8 * 3600000).toISOString().split('T')[0];
          todayTotal = dailyMap.get(todayBj) || 0;
          total = periodTweets.length;
          dataSource = 'twitterapi.io';
          console.log(`[twitterapi.io] ${market.slug}: ${total}条`);
        }

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
    });

    const result = { success: true, trackings, lastUpdated: new Date().toISOString() };
    _cache = { data: result, ts: Date.now() };
    return res.status(200).json(result);

  } catch (error) {
    console.error('xtracker handler error:', error);
    if (_cache.data) return res.status(200).json({ ..._cache.data, fromCache: true, stale: true });
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
