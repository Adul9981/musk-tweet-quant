export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SOCIALDATA_API_KEY = process.env.SOCIALDATA_API_KEY;
  const ELON_MUSK_USER_ID = '44196397';

  if (!SOCIALDATA_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const tweetsMap = new Map();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 20);
    let cursor = null;
    let pageCount = 0;
    const maxPages = 30;

    for (let page = 0; page < maxPages; page++) {
      const url = cursor 
        ? `https://api.socialdata.tools/twitter/user/${ELON_MUSK_USER_ID}/tweets?cursor=${encodeURIComponent(cursor)}`
        : `https://api.socialdata.tools/twitter/user/${ELON_MUSK_USER_ID}/tweets`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${SOCIALDATA_API_KEY}`,
          'Accept': 'application/json',
        },
      });

      if (response.status === 402) {
        return res.status(402).json({ error: 'Insufficient balance. Please add credits.' });
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.tweets || data.tweets.length === 0) {
        break;
      }

      let hasOldTweet = false;
      
      for (const tweet of data.tweets) {
        const createdAtStr = tweet.tweet_created_at;
        const createdAt = new Date(createdAtStr);
        
        if (isNaN(createdAt.getTime())) {
          continue;
        }
        
        if (createdAt < cutoffDate) {
          hasOldTweet = true;
          break;
        }
        
        const utcHour = createdAt.getUTCHours();
        let hour = utcHour + 8;
        let tweetDate = new Date(createdAt);
        
        if (hour >= 24) {
          hour = hour - 24;
          tweetDate.setDate(tweetDate.getDate() + 1);
        }
        
        const dateStr = `${tweetDate.getFullYear()}-${String(tweetDate.getMonth() + 1).padStart(2, '0')}-${String(tweetDate.getDate()).padStart(2, '0')}`;
        
        const key = `${dateStr}-${hour}`;
        tweetsMap.set(key, (tweetsMap.get(key) || 0) + 1);
      }
      
      pageCount++;
      
      if (hasOldTweet || !data.next_cursor) {
        break;
      }
      
      cursor = data.next_cursor;
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const result = Array.from(tweetsMap.entries()).map(([key, count]) => {
      const parts = key.split('-');
      const date = parts.slice(0, 3).join('-');
      const hour = parseInt(parts[3]);
      return { date, hour, count };
    });

    const estimatedCost = (pageCount * 20 * 0.0002).toFixed(4);

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate');
    return res.status(200).json({
      tweets: result,
      pagesFetched: pageCount,
      estimatedCost: `$${estimatedCost}`,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch tweets',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
