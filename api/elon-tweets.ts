export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SOCIALDATA_API_KEY = '6343|bMXorF3ZCfDhX0Mw5ZG62pPr4AUAt4zFHd1Jahyv65d59664';
  const ELON_MUSK_USER_ID = '44196397';

  try {
    const tweetsMap = new Map<string, number>();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 20);
    let cursor: string | null = null;
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
        return res.status(402).json({ error: 'Insufficient balance. Please add credits to your SocialData account.' });
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SocialData API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.tweets || data.tweets.length === 0) {
        break;
      }

      let hasOldTweet = false;
      
      for (const tweet of data.tweets) {
        const createdAt = new Date(tweet.tweet_created_at);
        
        if (createdAt < cutoffDate) {
          hasOldTweet = true;
          break;
        }
        
        const date = createdAt.toISOString().split('T')[0];
        const utcHour = createdAt.getUTCHours();
        let hour = utcHour + 8;
        let tweetDate = date;
        
        if (hour >= 24) {
          hour = hour - 24;
          const d = new Date(date);
          d.setDate(d.getDate() + 1);
          tweetDate = d.toISOString().split('T')[0];
        }
        
        const key = `${tweetDate}-${hour}`;
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
      const [date, hour] = key.split('-');
      return { date, hour: parseInt(hour), count };
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
    console.error('Error fetching tweets:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch tweets',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
