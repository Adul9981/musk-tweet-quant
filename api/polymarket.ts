export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const slug = req.query.slug || 'elon-musk-of-tweets-march-20-march-27';

    const response = await fetch(
      `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`,
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Polymarket API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.markets || data.markets.length === 0) {
      return res.status(404).json({ error: 'Market not found' });
    }

    const market = data.markets[0];
    
    const result = {
      question: market.question,
      slug: market.slug,
      endDate: market.timestamps?.endDate,
      startDate: market.timestamps?.startDate,
      volume: market.volumes?.volume || 0,
      volume24hr: market.volumes?.volume24hr || 0,
      liquidity: market.liquidity || 0,
      active: market.active,
      closed: market.closed,
      resolved: market.resolved,
      conditions: (market.conditions || []).map((c: any) => ({
        id: c.id,
        question: c.question,
        outcome: c.outcome,
        probability: c.probability || c.p || 0,
      })),
      lastUpdated: new Date().toISOString(),
    };

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
    return res.status(200).json(result);
  } catch (error) {
    console.error('Polymarket API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch market data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
