import type { VercelRequest, VercelResponse } from '@vercel/node';

interface Condition {
  id: string;
  question: string;
  outcome: string;
  probability: number;
  marketSlug: string;
}

interface MarketData {
  question: string;
  slug: string;
  description: string;
  conditions: Condition[];
  volumes: {
    volume: number;
    volume24hr: number;
  };
  timestamps: {
    endDate: string;
    startDate: string;
    gameStartDate?: string;
  };
  marketType: string;
  liquidity: number;
  archived: boolean;
  closed: boolean;
  active: boolean;
  resolved: boolean;
}

interface PolymarketResponse {
  markets: MarketData[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { slug } = req.query;
    const marketSlug = slug as string || 'elon-musk-of-tweets-march-20-march-27';

    const response = await fetch(
      `https://gamma-api.polymarket.com/markets?slug=${marketSlug}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Polymarket API error: ${response.status}`);
    }

    const data: PolymarketResponse = await response.json();
    
    if (!data.markets || data.markets.length === 0) {
      return res.status(404).json({ error: 'Market not found' });
    }

    const market = data.markets[0];
    
    const result = {
      question: market.question,
      slug: market.slug,
      endDate: market.timestamps.endDate,
      startDate: market.timestamps.startDate,
      volume: market.volumes.volume,
      volume24hr: market.volumes.volume24hr,
      liquidity: market.liquidity,
      active: market.active,
      closed: market.closed,
      resolved: market.resolved,
      conditions: market.conditions.map(c => ({
        id: c.id,
        question: c.question,
        outcome: c.outcome,
        probability: c.probability,
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
