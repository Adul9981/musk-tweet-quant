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
    const createdAt = new Date(tweet.created_at || tweet.createdAt);
    if (isNaN(createdAt.getTime()) || createdAt < cutoffDate) continue;

    let hour = createdAt.getUTCHours() + 8;
    const tweetDate = new Date(createdAt);
    if (hour >= 24) { hour -= 24; tweetDate.setDate(tweetDate.getDate() + 1); }

    const dateStr = `${tweetDate.getFullYear()}-${String(tweetDate.getMonth() + 1).padStart(2, '0')}-${String(tweetDate.getDate()).padStart(2, '0')}`;
    const key = `${dateStr}-${hour}`;
    tweetsMap.set(key, (tweetsMap.get(key) || 0) + 1);
  }

  return Array.from(tweetsMap.entries()).map(([key, count]) => {
    const parts = key.split('-');
    return { date: parts.slice(0, 3).join('-'), hour: parseInt(parts[3]), count };
  });
}

// 数据源 A：xscraper via RapidAPI
async function fetchFromRapidAPI(RAPIDAPI_KEY, RAPIDAPI_HOST) {
  let allTweets = [];
  let cursor = null;
  let pageCount = 0;
  const maxPages = 50;
  let consecutiveEmpty = 0;
  let retryCount = 0;
  const maxRetries = 5;

  while (pageCount < maxPages && consecutiveEmpty < 3) {
    try {
      const url = cursor
        ? `https://${RAPIDAPI_HOST}/user-tweets?username=elonmusk&cursor=${encodeURIComponent(cursor)}&count=100`
        : `https://${RAPIDAPI_HOST}/user-tweets?username=elonmusk&count=100`;

      const response = await fetch(url, {
        headers: { 'x-rapidapi-host': RAPIDAPI_HOST, 'x-rapidapi-key': RAPIDAPI_KEY }
      });

      if (!response.ok) {
        if (response.status === 429) {
          retryCount++;
          if (retryCount >= maxRetries) break;
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }
        throw new Error(`RapidAPI error: ${response.status}`);
      }

      const responseData = await response.json();
      let tweets = Array.isArray(responseData) ? responseData
        : responseData.data ? (Array.isArray(responseData.data) ? responseData.data : responseData.data.tweets || [])
        : responseData.tweets || [];

      if (!tweets.length) { consecutiveEmpty++; break; }
      allTweets = [...allTweets, ...tweets];
      pageCount++;
      consecutiveEmpty = 0;
      if (!responseData.cursor) break;
      cursor = responseData.cursor;
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      retryCount++;
      if (retryCount >= maxRetries) break;
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!allTweets.length) throw new Error('RapidAPI: no tweets returned');
  return { tweets: allTweets, totalTweetCount: allTweets[0]?.user?.legacy?.statuses_count || 0 };
}

// 数据源 B：twitterapi.io（fallback）
async function fetchFromTwitterAPIio(TWITTERAPI_KEY) {
  const allTweets = [];
  // last_tweets 返回约20条最新推文，适合统计近期小时分布
  const res = await fetch(
    'https://api.twitterapi.io/twitter/user/last_tweets?userName=elonmusk',
    { headers: { 'X-API-Key': TWITTERAPI_KEY } }
  );
  if (!res.ok) throw new Error(`twitterapi.io error: ${res.status}`);
  const data = await res.json();
  const tweets = data?.data?.tweets || [];
  if (!tweets.length) throw new Error('twitterapi.io: no tweets returned');

  // twitterapi.io 的 createdAt 格式: "Mon Jun 01 04:58:38 +0000 2026"
  // 统一 normalize 为 created_at 字段
  return {
    tweets: tweets.map(t => ({ created_at: t.createdAt, ...t })),
    totalTweetCount: 0,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
  const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST;
  const TWITTERAPI_KEY = process.env.TWITTERAPI_KEY || 'new1_8452e6aed9cd49e9b163a11635102474';

  const forceRefresh = req.query.refresh === '1';
  const now = Date.now();

  if (!forceRefresh && cache.data && (now - cache.timestamp) < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate');
    return res.status(200).json({ ...cache.data, fromCache: true, cacheAge: Math.round((now - cache.timestamp) / 1000) });
  }

  try {
    let rawTweets = [];
    let totalTweetCount = 0;
    let source = '';

    // 数据源 A：xscraper via RapidAPI
    if (RAPIDAPI_KEY && RAPIDAPI_HOST) {
      try {
        const result = await fetchFromRapidAPI(RAPIDAPI_KEY, RAPIDAPI_HOST);
        rawTweets = result.tweets;
        totalTweetCount = result.totalTweetCount;
        source = 'rapidapi';
        console.log(`[elon-tweets] RapidAPI: ${rawTweets.length} tweets`);
      } catch (e) {
        console.warn('[elon-tweets] RapidAPI failed, trying twitterapi.io:', e.message);
      }
    }

    // 数据源 B：twitterapi.io fallback
    if (!rawTweets.length) {
      const result = await fetchFromTwitterAPIio(TWITTERAPI_KEY);
      rawTweets = result.tweets;
      source = 'twitterapi.io';
      console.log(`[elon-tweets] twitterapi.io fallback: ${rawTweets.length} tweets`);
    }

    if (!rawTweets.length) throw new Error('All tweet sources failed');

    const cacheData = {
      tweets: aggregateTweets(rawTweets),
      totalTweets: totalTweetCount,
      tweetCount: rawTweets.length,
      source,
      lastUpdated: new Date().toISOString(),
    };

    cache = { data: cacheData, timestamp: now };
    res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate');
    return res.status(200).json({ ...cacheData, fromCache: false });

  } catch (error) {
    console.error('[elon-tweets] All sources failed:', error);

    if (cache.data) {
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.status(200).json({ ...cache.data, fromCache: true, stale: true });
    }

    return res.status(500).json({ error: 'Failed to fetch tweets', message: error.message });
  }
}
