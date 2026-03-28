export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug } = req.query;
  
  if (!slug) {
    return res.status(400).json({ error: 'Missing slug parameter' });
  }
  
  try {
    const response = await fetch(
      `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch from Polymarket' });
    }
    
    const markets = await response.json();
    
    if (!markets || markets.length === 0) {
      return res.status(404).json({ error: 'Market not found' });
    }
    
    const market = markets[0];
    
    const conditions = (market.conditions || []).map(c => ({
      id: c.id,
      question: c.question,
      probability: parseFloat(c.probability || '0'),
    }));
    
    const result = {
      question: market.question,
      slug: market.slug,
      endDate: market.endDate,
      volume: market.volume,
      liquidity: market.liquidity,
      answer: market.answer,
      conditions,
      outcomes: market.outcomes || [],
      outcomePrices: market.outcomePrices || [],
      description: market.description,
      lastUpdated: new Date().toISOString(),
    };
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Polymarket API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
