export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SOCIALDATA_API_KEY = '6343|bMXorF3ZCfDhX0Mw5ZG62pPr4AUAt4zFHd1Jahyv65d59664';
  const ELON_MUSK_USER_ID = '44196397';

  try {
    const allTweets: any[] = [];
    let cursor: string | null = null;
    const maxPages = 50;
    
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

      allTweets.push(...data.tweets);
      
      if (data.next_cursor) {
        cursor = data.next_cursor;
      } else {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const heatmapData = allTweets.map(tweet => {
      const createdAt = new Date(tweet.tweet_created_at);
      return {
        id: tweet.id_str,
        date: createdAt.toISOString().split('T')[0],
        hour: createdAt.getUTCHours() + 8,
        timestamp: createdAt.getTime(),
        text: tweet.full_text || tweet.text,
      };
    }).map(item => {
      if (item.hour >= 24) {
        const date = new Date(item.date);
        date.setDate(date.getDate() + 1);
        return {
          ...item,
          hour: item.hour - 24,
          date: date.toISOString().split('T')[0],
        };
      }
      return item;
    });

    const aggregated = new Map<string, number>();
    for (const item of heatmapData) {
      const key = `${item.date}-${item.hour}`;
      aggregated.set(key, (aggregated.get(key) || 0) + 1);
    }

    const result = Array.from(aggregated.entries()).map(([key, count]) => {
      const [date, hour] = key.split('-');
      return { date, hour: parseInt(hour), count };
    });

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate');
    return res.status(200).json({
      tweets: result,
      totalTweetsFetched: allTweets.length,
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
