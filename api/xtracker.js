/**
 * /api/xtracker
 *
 * 数据源优先级（见 知识库/07_数据源与备份策略.md）：
 * 1. 市场元数据：/api/discover-markets（内部复用，candidate slugs → Gamma API）
 *    fallback → xtracker.polymarket.com
 * 2. 推文计数：twitterapi.io（isReply=false，与 Polymarket 规则一致）
 *    fallback → xtracker stats（若返回有效数据）
 */

const TWITTERAPI_KEY = process.env.TWITTERAPI_KEY || 'new1_8452e6aed9cd49e9b163a11635102474';
const REFERRAL_CODE  = '?via=serene77mc-g6kj';
const GAMMA          = 'https://gamma-api.polymarket.com';
const MONTHS = [
  'january','february','march','april','may','june',
  'july','august','september','october','november','december',
];

// ── Gamma API：生成候选 slug 列表 ───────────────────────
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
  const res = await fetch(`${GAMMA}/events?slug=${encodeURIComponent(slug)}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const events = Array.isArray(data) ? data : data.data || [];
  return events.find(e => e.slug === slug) || null;
}

// ── 获取活跃市场列表（优先 Gamma，备用 xtracker）───────────
async function fetchActiveMarkets() {
  const now = new Date();
  const markets = [];

  // 并发探测所有候选 slug
  const slugs = candidateSlugs();
  const results = await Promise.allSettled(slugs.map(fetchEventBySlug));

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const ev = r.value;
    const end = new Date(ev.end_date_iso || ev.endDate);
    if (isNaN(end.getTime()) || end <= now) continue;
    const start = new Date(ev.start_date_iso || ev.startDate);
    markets.push({
      id:        ev.id || ev.slug,
      title:     ev.title,
      startDate: start.toISOString(),
      endDate:   end.toISOString(),
      marketLink:`https://polymarket.com/event/${ev.slug}${REFERRAL_CODE}`,
      slug:      ev.slug,
      source:    'gamma',
    });
  }

  if (markets.length > 0) return markets;

  // Fallback: xtracker.polymarket.com
  try {
    const resp = await fetch(
      'https://xtracker.polymarket.com/api/users/elonmusk/trackings?activeOnly=true',
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
    );
    if (resp.ok) {
      const data = await resp.json();
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        return data.data
          .filter(t => {
            const diff = (new Date(t.endDate) - new Date(t.startDate)) / 86400000;
            return diff >= 6 && diff <= 8;
          })
          .map(t => ({
            id:        t.id,
            title:     t.title,
            startDate: t.startDate,
            endDate:   t.endDate,
            marketLink:t.marketLink + (t.marketLink.includes('?') ? '&' : REFERRAL_CODE),
            slug:      t.marketLink?.split('/').pop()?.split('?')[0] || '',
            source:    'xtracker',
          }));
      }
    }
  } catch (e) {
    console.warn('[xtracker meta fallback] 失败:', e.message);
  }

  return [];
}

// ── twitterapi.io：抓取指定时段推文（isReply=false）────────
async function fetchTweetsInPeriod(startDate, endDate) {
  const startMs = new Date(startDate).getTime();
  const endMs   = new Date(endDate).getTime();

  let allTweets = [];
  let cursor    = null;
  let page      = 0;
  const MAX_PAGES = 30; // 最多 600 条，7 天内通常 150-250 条

  while (page < MAX_PAGES) {
    const url = cursor
      ? `https://api.twitterapi.io/twitter/user/last_tweets?userName=elonmusk&cursor=${encodeURIComponent(cursor)}`
      : `https://api.twitterapi.io/twitter/user/last_tweets?userName=elonmusk`;

    const resp = await fetch(url, {
      headers: { 'X-API-Key': TWITTERAPI_KEY },
      signal:  AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`twitterapi.io ${resp.status}`);

    const json   = await resp.json();
    const tweets = json.data?.tweets || [];

    let done = false;
    for (const t of tweets) {
      if (t.isReply) continue; // Polymarket 规则：不计回复
      const ts = new Date(t.createdAt).getTime();
      if (isNaN(ts) || ts > endMs) continue;
      if (ts < startMs) { done = true; break; }
      allTweets.push(t);
    }

    if (done || !json.has_next_page || !json.next_cursor) break;
    cursor = json.next_cursor;
    page++;
    await new Promise(r => setTimeout(r, 150));
  }

  return allTweets;
}

// ── 按北京时间日期聚合 ───────────────────────────────────
function aggregateByBjDate(tweets) {
  const map = new Map();
  for (const t of tweets) {
    const bj = new Date(new Date(t.createdAt).getTime() + 8 * 3600000)
      .toISOString().split('T')[0];
    map.set(bj, (map.get(bj) || 0) + 1);
  }
  return map;
}

// ── 主 Handler ──────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const markets = await fetchActiveMarkets();
    if (markets.length === 0) {
      console.warn('[xtracker] 无法获取市场元数据');
      return res.status(200).json({ success: true, trackings: [], lastUpdated: new Date().toISOString() });
    }

    const now = new Date();

    const trackings = await Promise.all(
      markets.map(async (market) => {
        try {
          const tweets    = await fetchTweetsInPeriod(market.startDate, market.endDate);
          const dailyMap  = aggregateByBjDate(tweets);
          const daily     = Array.from(dailyMap.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

          const endDate   = new Date(market.endDate);
          const startDate = new Date(market.startDate);
          const diffMs        = endDate.getTime() - now.getTime();
          const daysRemaining = Math.max(0, Math.floor(diffMs / 86400000));
          const hoursRemaining= Math.max(0, Math.floor((diffMs % 86400000) / 3600000));
          const elapsedDays   = Math.max(0.01, (now.getTime() - startDate.getTime()) / 86400000);
          const daysTotal     = (endDate.getTime() - startDate.getTime()) / 86400000;

          const total          = tweets.length;
          const pace           = Math.round(total / elapsedDays);
          const percentComplete= Math.min(100, Math.round((elapsedDays / daysTotal) * 100));
          const todayBj        = new Date(now.getTime() + 8 * 3600000).toISOString().split('T')[0];
          const todayTotal     = dailyMap.get(todayBj) || 0;

          console.log(`[xtracker] ${market.slug}: ${total} tweets (today:${todayTotal}) via twitterapi.io`);

          return {
            ...market,
            stats: {
              total, pace, percentComplete,
              daysElapsed:  Math.floor(elapsedDays),
              daysRemaining, hoursRemaining,
              daysTotal:    Math.round(daysTotal),
              daily, todayTotal,
              dataSource:   'twitterapi.io',
            },
          };
        } catch (e) {
          console.error(`[twitterapi] 统计失败 ${market.id}:`, e.message);
          return { ...market, stats: null };
        }
      })
    );

    return res.status(200).json({
      success:     true,
      trackings,
      lastUpdated: new Date().toISOString(),
    });

  } catch (error) {
    console.error('xtracker handler error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
