const CACHE_TTL_MS = 30 * 60 * 1000;

let cache = {
  data: null,
  timestamp: 0
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
  const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST;

  if (!RAPIDAPI_KEY || !RAPIDAPI_HOST) {
    return res.status(500).json({ error: 'RapidAPI credentials not configured' });
  }

  const forceRefresh = req.query.refresh === '1';
  const now = Date.now();
  
  if (!forceRefresh && cache.data && (now - cache.timestamp) < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate');
    return res.status(200).json({
      ...cache.data,
      fromCache: true,
      cacheAge: Math.round((now - cache.timestamp) / 1000)
    });
  }

  try {
    let allTweets = [];
    let cursor = null;
    let pageCount = 0;
    const maxPages = 50;
    let consecutiveEmpty = 0;
    let maxRetries = 5;
    let retryCount = 0;

    while (pageCount < maxPages && consecutiveEmpty < 3) {
      try {
        let url;
        if (cursor) {
          url = `https://${RAPIDAPI_HOST}/user-tweets?username=elonmusk&cursor=${encodeURIComponent(cursor)}&count=100`;
        } else {
          url = `https://${RAPIDAPI_HOST}/user-tweets?username=elonmusk&count=100`;
        }
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'x-rapidapi-host': RAPIDAPI_HOST,
            'x-rapidapi-key': RAPIDAPI_KEY,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          console.log(`API response status: ${response.status}`);
          if (response.status === 429) {
            retryCount++;
            if (retryCount >= maxRetries) break;
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
          }
          throw new Error(`RapidAPI error: ${response.status}`);
        }

        const responseData = await response.json();
        
        let tweets = [];
        if (Array.isArray(responseData)) {
          tweets = responseData;
        } else if (responseData.data) {
          tweets = Array.isArray(responseData.data) ? responseData.data : responseData.data.tweets || [];
        } else if (responseData.tweets) {
          tweets = Array.isArray(responseData.tweets) ? responseData.tweets : [];
        }
        
        if (!tweets || tweets.length === 0) {
          consecutiveEmpty++;
          break;
        }
        
        allTweets = [...allTweets, ...tweets];
        pageCount++;
        consecutiveEmpty = 0;
        
        if (!responseData.cursor) {
          break;
        }
        
        cursor = responseData.cursor;
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (e) {
        console.log(`Error on page ${pageCount}: ${e.message}`);
        retryCount++;
        if (retryCount >= maxRetries) break;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`Fetched ${allTweets.length} tweets in ${pageCount} pages`);

    if (allTweets.length === 0 && lastError) {
      throw lastError;
    }

    const tweets = allTweets;

    if (!Array.isArray(tweets) || tweets.length === 0) {
      throw new Error('No tweets returned from API');
    }

    const tweetsMap = new Map();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    for (const tweet of tweets) {
      const createdAtStr = tweet.created_at;
      const createdAt = new Date(createdAtStr);
      
      if (isNaN(createdAt.getTime()) || createdAt < cutoffDate) {
        continue;
      }
      
      const utcHour = createdAt.getUTCHours();
      let hour = utcHour + 8;
      let tweetDate = new Date(createdAt);
      
      if (hour >= 24) {
        hour -= 24;
        tweetDate.setDate(tweetDate.getDate() + 1);
      }
      
      const dateStr = `${tweetDate.getFullYear()}-${String(tweetDate.getMonth() + 1).padStart(2, '0')}-${String(tweetDate.getDate()).padStart(2, '0')}`;
      const key = `${dateStr}-${hour}`;
      tweetsMap.set(key, (tweetsMap.get(key) || 0) + 1);
    }

    const result = Array.from(tweetsMap.entries()).map(([key, count]) => {
      const parts = key.split('-');
      const date = parts.slice(0, 3).join('-');
      const hour = parseInt(parts[3]);
      return { date, hour, count };
    });

    const latestTweet = tweets[0];
    const totalTweetCount = latestTweet?.user?.legacy?.statuses_count || 0;

    const cacheData = {
      tweets: result,
      totalTweets: totalTweetCount,
      tweetCount: tweets.length,
      lastUpdated: new Date().toISOString()
    };

    cache = {
      data: cacheData,
      timestamp: now
    };

    res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate');
    return res.status(200).json({
      ...cacheData,
      fromCache: false
    });

  } catch (error) {
    console.error('Error fetching tweets:', error);
    
    if (cache.data) {
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.status(200).json({
        ...cache.data,
        fromCache: true,
        stale: true
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to fetch tweets',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
