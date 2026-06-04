const CACHE_TTL_MS = 30 * 60 * 1000;

let cache = {
  data: null,
  timestamp: 0
};

// 将原始推文数组聚合为 { date, hour, count }[] 格式（北京时间）
function aggregateTweets(tweets) {
  const tweetsMap = new Map();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);

  for (const tweet of tweets) {
    const createdAt = new Date(tweet.createdAt || tweet.created_at);
    if (isNaN(createdAt.getTime()) || createdAt < cutoffDate) continue;

    const bjMs = createdAt.getTime() + 8 * 60 * 60 * 1000;
    const bjDate = new Date(bjMs);
    const hour = bjDate.getUTCHours();
    const dateStr = bjDate.toISOString().split('T')[0];
    const key = `${dateStr}-${hour}`;
    tweetsMap.set(key, (tweetsMap.get(key) || 0) + 1);
  }

  return Array.from(tweetsMap.entries()).map(([key, count]) => {
    const parts = key.split('-');
    return { date: parts.slice(0, 3).join('-'), hour: parseInt(parts[3]), count };
  });
}

// 数据源 A：xtracker.polymarket.com posts（主力，无需 key）
async function fetchFromXtracker() {
  const allPosts = [];
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let offset = 0;
  const limit = 100;

  while (offset <= 2000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let res;
    try {
      res = await fetch(
        `https://xtracker.polymarket.com/api/users/elonmusk/posts?limit=${limit}&offset=${offset}`,
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`xtracker error: ${res.status}`);
    const json = await res.json();
    const posts = json.data || json.posts || json || [];
    if (!Array.isArray(posts) || posts.length === 0) break;

    let reachedCutoff = false;
    for (const post of posts) {
      const ts = new Date(post.createdAt).getTime();
      if (ts < cutoff) { reachedCutoff = true; break; }
      allPosts.push(post);
    }
    if (reachedCutoff || posts.length < limit) break;
    offset += limit;
    await new Promise(r => setTimeout(r, 150));
  }

  if (!allPosts.length) throw new Error('xtracker: no posts returned');
  return allPosts;
}

// 数据源 B：RapidAPI xscraper（备用）
async function fetchFromRapidAPI(RAPIDAPI_KEY, RAPIDAPI_HOST) {
  let allTweets = [];
  let cursor = null;
  let pageCount = 0;

  while (pageCount < 20) {
    const url = cursor
      ? `https://${RAPIDAPI_HOST}/user-tweets?username=elonmusk&cursor=${encodeURIComponent(cursor)}&count=100`
      : `https://${RAPIDAPI_HOST}/user-tweets?username=elonmusk&count=100`;

    const response = await fetch(url, {
      headers: { 'x-rapidapi-host': RAPIDAPI_HOST, 'x-rapidapi-key': RAPIDAPI_KEY },
    });
    if (!response.ok) throw new Error(`RapidAPI error: ${response.status}`);

    const responseData = await response.json();
    const tweets = Array.isArray(responseData) ? responseData
      : responseData.data ? (Array.isArray(responseData.data) ? responseData.data : responseData.data.tweets || [])
      : responseData.tweets || [];

    if (!tweets.length) break;
    allTweets = [...allTweets, ...tweets];
    pageCount++;
    if (!responseData.cursor) break;
    cursor = responseData.cursor;
    await new Promise(r => setTimeout(r, 200));
  }

  if (!allTweets.length) throw new Error('RapidAPI: no tweets returned');
  return allTweets;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY;
  const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST;

  const forceRefresh = req.query.refresh === '1';
  const now = Date.now();

  if (!forceRefresh && cache.data && (now - cache.timestamp) < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate');
    return res.status(200).json({ ...cache.data, fromCache: true, cacheAge: Math.round((now - cache.timestamp) / 1000) });
  }

  let rawTweets = [];
  let source = '';

  // 主力：xtracker（稳定，无需 key）
  try {
    rawTweets = await fetchFromXtracker();
    source = 'xtracker';
    console.log(`[elon-tweets] xtracker: ${rawTweets.length} posts`);
  } catch (e) {
    console.warn('[elon-tweets] xtracker failed, trying RapidAPI:', e.message);
  }

  // 备用：RapidAPI
  if (!rawTweets.length && RAPIDAPI_KEY && RAPIDAPI_HOST) {
    try {
      rawTweets = await fetchFromRapidAPI(RAPIDAPI_KEY, RAPIDAPI_HOST);
      source = 'rapidapi';
      console.log(`[elon-tweets] RapidAPI fallback: ${rawTweets.length} tweets`);
    } catch (e) {
      console.warn('[elon-tweets] RapidAPI also failed:', e.message);
    }
  }

  if (!rawTweets.length) {
    if (cache.data) {
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.status(200).json({ ...cache.data, fromCache: true, stale: true });
    }
    return res.status(500).json({ error: 'All tweet sources failed' });
  }

  const cacheData = {
    tweets: aggregateTweets(rawTweets),
    tweetCount: rawTweets.length,
    source,
    lastUpdated: new Date().toISOString(),
  };

  cache = { data: cacheData, timestamp: now };
  res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate');
  return res.status(200).json({ ...cacheData, fromCache: false });
}
