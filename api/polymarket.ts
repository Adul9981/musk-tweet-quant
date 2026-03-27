export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const slug = req.query.slug || 'elon-musk-of-tweets-march-27-april-3';

    const response = await fetch(
      `https://polymarket.com/event/${slug}`,
      {
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Polymarket error: ${response.status}`);
    }

    const html = await response.text();
    
    const markets: any[] = [];
    
    const priceRegex = /"price":"([\d.]+)"/g;
    const outcomeRegex = /"outcome":"([^"]+)"/g;
    const questionRegex = /"question":"([^"]+)"/g;
    
    const prices = [...html.matchAll(/"price":"([\d.]+)"/g)].map(m => parseFloat(m[1]));
    const outcomes = [...html.matchAll(/"outcome":"([^"]+)"/g)].map(m => m[1].replace(/\\u([\da-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
    
    const questionMatch = html.match(/"question":"([^"]+)"/);
    const question = questionMatch ? questionMatch[1].replace(/\\u([\da-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))) : 'Elon Musk Tweets';
    
    const conditions = outcomes.slice(0, Math.min(prices.length, outcomes.length)).map((outcome, i) => ({
      id: `cond-${i}`,
      question: outcome,
      outcome,
      probability: prices[i] || 0,
    }));

    const volumeMatch = html.match(/Volume\$([0-9,]+)/);
    const volume = volumeMatch ? parseInt(volumeMatch[1].replace(/,/g, '')) : 0;

    const result = {
      question,
      slug,
      endDate: '2026-04-03T12:00:00Z',
      startDate: '2026-03-27T12:00:00Z',
      volume,
      liquidity: volume * 0.02,
      active: true,
      closed: false,
      resolved: false,
      conditions,
      lastUpdated: new Date().toISOString(),
    };

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
    return res.status(200).json(result);
  } catch (error) {
    console.error('Polymarket error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch market data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
