import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  BarChart3,
  Grid3X3,
  ExternalLink,
  RefreshCw,
  Clock,
  Activity,
  Target,
  FileText,
  Send,
  Radio,
  Copy,
  CheckCircle,
  Gauge,
  LineChart as LineChartIcon,
} from 'lucide-react';
import { TweetHeatmap } from './components/TweetHeatmap';
import { ProbabilityChart } from './components/ProbabilityChart';
import type { PriceSnapshot } from './components/ProbabilityChart';

const REFERRAL = '?via=serene77mc-g6kj';

interface RangeData {
  range: string;
  price: number;
  liquidity: number;
  slug: string;
}

interface MarketData {
  slug: string;
  title: string;
  volume: number;
  liquidity: number;
  start_date: string;
  end_date: string;
  ranges: RangeData[];
  top_ranges: RangeData[];
  scraped_at: string;
}

interface TrackingStats {
  total: number;
  pace: number;
  percentComplete: number;
  daysRemaining: number;
  hoursRemaining: number;
  todayTotal: number;
  daysTotal: number;
  daily: Array<{ date: string; count: number }>;
}

interface Tracking {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  marketLink: string;
  slug: string;
  stats: TrackingStats | null;
}

const PRICE_HISTORY_KEY = 'musk_price_history_v1';
const PRICE_HISTORY_MAX = 144; // 12 hours at 5-min intervals

function parseRange(range: string): { min: number; max: number } | null {
  const match = range.match(/(\d+)-(\d+)/);
  if (match) return { min: parseInt(match[1]), max: parseInt(match[2]) };
  if (range.includes('+')) {
    const num = parseInt(range.replace('+', ''));
    return { min: num, max: 9999 };
  }
  return null;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${date.getMonth() + 1}/${date.getDate()} ${dayNames[date.getDay()]}`;
}

function getPhase(remainingDays: number): { name: string; color: string; bg: string } {
  if (remainingDays >= 5) return { name: '前期布局', color: 'text-indigo-400', bg: 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' };
  if (remainingDays >= 3) return { name: '中期调整', color: 'text-teal-400', bg: 'bg-teal-500/20 border-teal-500/40 text-teal-300' };
  if (remainingDays >= 1) return { name: '后期收缩', color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/40 text-amber-300' };
  return { name: '最后24H', color: 'text-rose-400', bg: 'bg-rose-500/20 border-rose-500/40 text-rose-300' };
}

function parseMarketTitle(title: string): string {
  return title
    .replace(/\s*\?\s*$/, '')
    .replace(/January\s*(\d+)/g, '1月$1日')
    .replace(/February\s*(\d+)/g, '2月$1日')
    .replace(/March\s*(\d+)/g, '3月$1日')
    .replace(/April\s*(\d+)/g, '4月$1日')
    .replace(/May\s*(\d+)/g, '5月$1日')
    .replace(/June\s*(\d+)/g, '6月$1日')
    .replace(/July\s*(\d+)/g, '7月$1日')
    .replace(/August\s*(\d+)/g, '8月$1日')
    .replace(/September\s*(\d+)/g, '9月$1日')
    .replace(/October\s*(\d+)/g, '10月$1日')
    .replace(/November\s*(\d+)/g, '11月$1日')
    .replace(/December\s*(\d+)/g, '12月$1日');
}

function parseTimestamp(ts: string): Date {
  if (!ts.endsWith('Z') && !ts.includes('+')) {
    ts = ts + 'Z';
  }
  return new Date(ts);
}

// ─── Gamma API direct discovery (browser fetch, no proxy needed) ─────────────

const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const MONTH_NAMES = [
  'january','february','march','april','may','june',
  'july','august','september','october','november','december',
];

function candidateElonSlugs(): string[] {
  const now = new Date();
  const seen = new Set<string>();
  const slugs: string[] = [];
  for (let d = -14; d <= 10; d++) {
    const start = new Date(now.getTime() + d * 86400000);
    const end   = new Date(start.getTime() + 7 * 86400000);
    const slug = `elon-musk-of-tweets-${MONTH_NAMES[start.getUTCMonth()]}-${start.getUTCDate()}-${MONTH_NAMES[end.getUTCMonth()]}-${end.getUTCDate()}`;
    if (!seen.has(slug)) { seen.add(slug); slugs.push(slug); }
  }
  return slugs;
}

function parseGammaEvent(event: any, slugHint?: string): MarketData | null {
  const now = Date.now();
  const endDate = event.endDate || event.end_date || '';
  if (!endDate || new Date(endDate).getTime() <= now) return null;
  if (event.closed || event.archived) return null;

  const ranges: RangeData[] = (event.markets || [])
    .map((m: any) => {
      const match = (m.question || '').match(/(\d+-\d+|\d+\+)/);
      if (!match) return null;
      let price: number | null = null;
      try {
        const prices = typeof m.outcomePrices === 'string'
          ? JSON.parse(m.outcomePrices) : (m.outcomePrices ?? []);
        price = prices[0] != null ? Math.round(parseFloat(prices[0]) * 1000) / 10 : null;
      } catch { /* ignore */ }
      if (price === null) return null;
      return {
        range: match[1],
        price,
        liquidity: parseFloat(m.liquidity ?? 0),
        slug: m.slug ?? '',
      } as RangeData;
    })
    .filter(Boolean)
    .sort((a: RangeData, b: RangeData) => {
      const aMin = parseInt(a.range.split('-')[0]) || 9999;
      const bMin = parseInt(b.range.split('-')[0]) || 9999;
      return aMin - bMin;
    });

  const slug = event.slug ?? slugHint ?? '';
  const startDate = event.startDate || event.start_date || '';
  return {
    slug,
    title: event.title ?? '',
    volume: parseFloat(event.volume ?? 0),
    liquidity: parseFloat(event.liquidity ?? 0),
    start_date: startDate,
    end_date: endDate,
    ranges,
    top_ranges: [...ranges].sort((a, b) => b.price - a.price).slice(0, 3),
    scraped_at: new Date().toISOString(),
  };
}

async function discoverElonMarkets(): Promise<MarketData[]> {
  // In production, use the Vercel server-side proxy (avoids CORS issues entirely).
  const isProduction = !['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (isProduction) {
    try {
      const res = await fetch('/api/discover-markets', {
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.markets?.length > 0) {
          console.log(`[markets] Vercel proxy returned ${data.markets.length} market(s)`);
          // Normalize: server returns endDate/startDate, we need end_date/start_date
          return (data.markets as any[]).map(m => ({
            slug: m.slug ?? '',
            title: m.title ?? '',
            volume: parseFloat(m.volume ?? 0),
            liquidity: parseFloat(m.liquidity ?? 0),
            start_date: m.startDate || m.start_date || '',
            end_date: m.endDate || m.end_date || '',
            ranges: (m.ranges ?? []).map((r: any) => ({
              range: r.range,
              price: r.price ?? 0,
              liquidity: parseFloat(r.liquidity ?? 0),
              slug: r.slug ?? '',
            })),
            top_ranges: (m.top_ranges ?? []).map((r: any) => ({
              range: r.range,
              price: r.price ?? 0,
              liquidity: parseFloat(r.liquidity ?? 0),
              slug: r.slug ?? '',
            })),
            scraped_at: m.scraped_at ?? new Date().toISOString(),
          })) as MarketData[];
        }
      }
    } catch (e) {
      console.warn('[markets] Vercel proxy failed, falling back to direct fetch:', e);
    }
  }

  // Local dev (or production fallback): probe candidate slugs directly via Gamma API.
  const candidates = candidateElonSlugs();
  const foundSlugs = new Set<string>();

  const results = await Promise.allSettled(
    candidates.map(slug =>
      fetch(`${GAMMA_BASE}/events?slug=${encodeURIComponent(slug)}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
        .then(r => r.ok ? r.json() : [])
        .then((data: any[]) => {
          if (!data?.length) return null;
          return parseGammaEvent(data[0], slug);
        })
        .catch(() => null)
    )
  );

  const found: MarketData[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value && !foundSlugs.has(r.value.slug)) {
      foundSlugs.add(r.value.slug);
      found.push(r.value);
    }
  }

  console.log(`[markets] Direct slug probe found ${found.length} market(s)`);
  return found.sort((a, b) => new Date(a.end_date).getTime() - new Date(b.end_date).getTime());
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'market' | 'analysis' | 'heatmap' | 'tweet' | 'chart'>('market');
  const [gistData, setGistData] = useState<MarketData[]>([]);
  const [trackings, setTrackings] = useState<Tracking[]>([]);
  const [selectedMarketIndex, setSelectedMarketIndex] = useState(0);
  const [isLoadingGist, setIsLoadingGist] = useState(true);
  const [isLoadingTracker, setIsLoadingTracker] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [currentTweetCount, setCurrentTweetCount] = useState(0);
  const [priceHistory, setPriceHistory] = useState<PriceSnapshot[]>([]);
  const [now, setNow] = useState(() => new Date());

  // Live clock — ticks every second
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load saved history from localStorage on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY) || '[]') as PriceSnapshot[];
      const cutoff = Date.now() - 12 * 60 * 60 * 1000;
      setPriceHistory(saved.filter(s => s.timestamp > cutoff));
    } catch { /* ignore parse errors */ }
  }, []);

  // ── Fetch market list + prices directly from Gamma API (browser fetch, CORS open) ──
  const fetchMarketData = async () => {
    setIsLoadingGist(true);
    try {
      const markets = await discoverElonMarkets();
      if (markets.length > 0) {
        setGistData(markets);
        setLastUpdated(new Date().toISOString());
        console.log(`[markets] Loaded ${markets.length} active market(s)`);
      } else {
        // Fallback: try Gist cache
        await fetchGistFallback();
      }
    } catch (err) {
      console.error('Failed to fetch market data:', err);
      await fetchGistFallback();
    } finally {
      setIsLoadingGist(false);
    }
  };

  // Gist fallback — use last scraped data if Gamma API fails
  const fetchGistFallback = async () => {
    try {
      const GIST_ID = 'd174b4498c408076ff218e164f24807e';
      const res = await fetch(`https://api.github.com/gists/${GIST_ID}?t=${Date.now()}`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const gist = await res.json();
      const content = gist.files?.['polymarket-data.json']?.content;
      if (content) {
        const raw = JSON.parse(content);
        const data: MarketData[] = (Array.isArray(raw) ? raw : []).map((m: any) => ({
          ...m,
          start_date: m.start_date || m.startDate || '',
          end_date: m.end_date || m.endDate || '',
        }));
        // Only use if there are non-expired markets
        const nowTs = Date.now();
        const active = data.filter(m => new Date(m.end_date).getTime() > nowTs);
        if (active.length > 0) {
          setGistData(active);
          if (active[0]?.scraped_at) setLastUpdated(active[0].scraped_at);
          console.log('[markets] Loaded from Gist fallback, active:', active.length);
        } else {
          console.warn('[markets] Gist fallback data is stale (all markets expired)');
        }
      }
    } catch (err) {
      console.error('Gist fallback failed:', err);
    }
  };

  // ── Load historical price snapshots from Gist (for probability chart) ──────
  const fetchGistHistory = async () => {
    const GIST_ID = 'd174b4498c408076ff218e164f24807e';
    try {
      const res = await fetch(`https://api.github.com/gists/${GIST_ID}?t=${Date.now()}`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const gist = await res.json();
      const histContent = gist.files?.['polymarket-history.json']?.content;
      if (!histContent) return;

      const histData = JSON.parse(histContent);
      const snaps: PriceSnapshot[] = (histData.snapshots || []).flatMap((snap: any) =>
        (snap.markets || []).map((m: any) => ({
          timestamp: snap.ts,
          marketSlug: m.slug,
          tweetCount: 0,
          ranges: (m.ranges || []).map((r: any) => ({
            range: r.r,
            price: r.p,
            modelProb: r.p,
            liquidity: r.l || 0,
          })),
        }))
      );

      if (snaps.length > 0) {
        setPriceHistory(prev => {
          const gistKeys = new Set(snaps.map(s => `${s.timestamp}-${s.marketSlug}`));
          const localOnly = prev.filter(s => !gistKeys.has(`${s.timestamp}-${s.marketSlug}`));
          return [...snaps, ...localOnly].sort((a, b) => a.timestamp - b.timestamp);
        });
      }
    } catch (err) {
      console.error('Failed to load Gist history:', err);
    }
  };

  const fetchTrackerData = async () => {
    try {
      const res = await fetch('https://xtracker.polymarket.com/api/users/elonmusk/trackings?activeOnly=true');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          const sevenDay = data.data.filter((t: any) => {
            const days = (new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) / (1000 * 60 * 60 * 24);
            return days >= 5 && days <= 10;
          });

          const trackingsWithStats = await Promise.all(
            sevenDay.slice(0, 5).map(async (t: any) => {
              try {
                const slug = t.marketLink?.split('/').pop() || t.title?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || '';
                const statsRes = await fetch(`https://xtracker.polymarket.com/api/trackings/${t.id}?includeStats=true`);
                if (statsRes.ok) {
                  const statsData = await statsRes.json();
                  const now = new Date();
                  const todayBJ = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
                  const todayTotal = (statsData.data?.stats?.daily || [])
                    .filter((d: any) => {
                      const dBJ = new Date(new Date(d.date).getTime() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
                      return dBJ === todayBJ;
                    })
                    .reduce((sum: number, d: any) => sum + d.count, 0);

                  const stats = statsData.data?.stats;
                  const daysTotal = stats?.daysTotal || 7;
                  const endDate = new Date(t.endDate);
                  const diffMs = endDate.getTime() - now.getTime();
                  const daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                  const hoursRemaining = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

                  const dailyData = stats?.daily || [];
                  const dailyMap = new Map();
                  for (const d of dailyData) {
                    const dateStr = d.date.split('T')[0];
                    dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + d.count);
                  }
                  const dailyTotals = Array.from(dailyMap.entries())
                    .map(([date, count]) => ({ date, count }))
                    .sort((a, b) => a.date.localeCompare(b.date));

                  return {
                    id: t.id,
                    title: t.title,
                    startDate: t.startDate,
                    endDate: t.endDate,
                    marketLink: t.marketLink,
                    slug,
                    stats: {
                      total: stats?.total || 0,
                      pace: stats?.daysElapsed > 0 ? Math.round(stats.total / stats.daysElapsed) : 0,
                      percentComplete: stats?.percentComplete || 0,
                      daysRemaining,
                      hoursRemaining,
                      todayTotal,
                      daysTotal,
                      daily: dailyTotals,
                    },
                  };
                }
              } catch (e) {
                console.error('Failed to fetch stats:', e);
              }
              return { id: t.id, title: t.title, startDate: t.startDate, endDate: t.endDate, marketLink: t.marketLink, slug: '', stats: null };
            })
          );
          setTrackings(trackingsWithStats);
        }
      }
    } catch (err) {
      console.error('Failed to fetch tracker data:', err);
    } finally {
      setIsLoadingTracker(false);
    }
  };

  const handleRefresh = async () => {
    await Promise.all([fetchMarketData(), fetchTrackerData()]);
  };

  useEffect(() => {
    fetchMarketData();
    fetchTrackerData();
    fetchGistHistory();

    const marketInterval = setInterval(fetchMarketData, 5 * 60 * 1000);
    const histInterval = setInterval(fetchGistHistory, 10 * 60 * 1000);
    return () => {
      clearInterval(marketInterval);
      clearInterval(histInterval);
    };
  }, []);

  const activeMarkets = useMemo(() => {
    const now = Date.now();
    return [...gistData]
      .filter(m => new Date(m.end_date).getTime() > now)
      .sort((a, b) => new Date(a.end_date).getTime() - new Date(b.end_date).getTime());
  }, [gistData]);

  const activeTrackings = useMemo(() => {
    const now = Date.now();
    return [...trackings]
      .filter(t => new Date(t.endDate).getTime() > now)
      .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
  }, [trackings]);

  useEffect(() => {
    if (activeMarkets.length > 0) {
      setSelectedMarketIndex(0);
    }
  }, [activeMarkets]);

  const currentTracking = activeTrackings[selectedMarketIndex] || activeTrackings[0];
  const currentMarket = activeMarkets[selectedMarketIndex] || activeMarkets[0];

  useEffect(() => {
    if (currentTracking?.stats) {
      setCurrentTweetCount(currentTracking.stats.total);
    }
  }, [currentTracking]);

  const phase = currentTracking?.stats ? getPhase(currentTracking.stats.daysRemaining) : getPhase(7);

  const apiPace = currentTracking?.stats?.pace || 0;
  
  const remainingDays = currentTracking?.stats?.daysRemaining ?? 1;
  const remainingHoursFromApi = currentTracking?.stats?.hoursRemaining ?? 0;
  const remainingHours = remainingDays * 24 + remainingHoursFromApi;

  const C = currentTweetCount;
  const T = remainingHours;
  const R = apiPace;
  const E_rem = R * (T / 24);
  const mu = C + E_rem;

  const getPoissonProb = (k: number, lambda: number): number => {
    if (k < 0) return 0;
    if (lambda <= 0) return k === 0 ? 1 : 0;
    let p = Math.exp(-lambda);
    for (let i = 1; i <= k; i++) {
      p *= (lambda / i);
    }
    return p;
  };

  const getRangeProbability = (rangeMin: number, rangeMax: number, lambda: number): number => {
    let prob = 0;
    for (let k = rangeMin; k <= rangeMax; k++) {
      prob += getPoissonProb(k, lambda);
    }
    return prob;
  };

  const analysisData = useMemo(() => {
    if (!currentMarket?.ranges || currentMarket.ranges.length === 0) return [];
    
    const ranges = currentMarket.ranges.map(r => ({
      ...r,
      parsed: parseRange(r.range)
    })).filter(d => d.parsed && d.price >= 1);

    if (ranges.length === 0) return [];
    
    let totalProb = 0;
    
    const results = ranges.map(range => {
      const prob = getRangeProbability(
        range.parsed!.min,
        range.parsed!.max,
        mu
      );
      
      totalProb += prob;
      return { 
        ...range, 
        rawProb: prob, 
        centerMu: mu,
        parsed: range.parsed
      };
    });

    return results.map(item => ({
      ...item,
      realProb: totalProb > 0 ? (item.rawProb / totalProb) * 100 : 0,
      isCenter: mu >= item.parsed!.min && mu <= item.parsed!.max
    })).filter(item => item.parsed).sort((a, b) => (a.parsed?.min || 0) - (b.parsed?.min || 0));
  }, [currentMarket, mu]);

  const predictedCenter = Math.round(mu);

  // Save a price snapshot immediately when analysisData is ready, and on each refresh.
  // Deduplicates within 4 minutes so we don't spam on re-renders.
  useEffect(() => {
    if (analysisData.length === 0 || !currentMarket) return;
    const FOUR_MIN = 4 * 60 * 1000;
    const now = Date.now();
    const snapshot: PriceSnapshot = {
      timestamp: now,
      marketSlug: currentMarket.slug,
      tweetCount: currentTweetCount,
      ranges: analysisData.map(r => ({
        range: r.range,
        price: r.price,
        modelProb: r.realProb,
        liquidity: r.liquidity || 0,
      })),
    };
    try {
      const existing = JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY) || '[]') as PriceSnapshot[];
      // Skip if a very recent snapshot already exists for this market
      const recent = existing.find(
        s => s.marketSlug === currentMarket.slug && now - s.timestamp < FOUR_MIN
      );
      if (recent) return;
      const cutoff = now - 12 * 60 * 60 * 1000;
      // Keep all markets' snapshots (not just current), trimmed to max
      const trimmed = existing
        .filter(s => s.timestamp > cutoff)
        .slice(-(PRICE_HISTORY_MAX - 1));
      trimmed.push(snapshot);
      localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(trimmed));
      setPriceHistory(prev => {
        const deduped = prev.filter(
          s => !(s.marketSlug === snapshot.marketSlug && Math.abs(s.timestamp - now) < FOUR_MIN)
        );
        return [...deduped, snapshot].sort((a, b) => a.timestamp - b.timestamp);
      });
    } catch { /* localStorage full */ }
  }, [analysisData, currentMarket, currentTweetCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Normal distribution comparison ──────────────────────────────────────
  const normalSigma = Math.max(8, Math.sqrt(Math.max(0, E_rem)) * 2.2);

  const normalProbs = useMemo(() => {
    if (analysisData.length === 0) return [] as { range: string; normalProb: number }[];
    const erfFn = (x: number): number => {
      const s = x < 0 ? -1 : 1;
      x = Math.abs(x);
      const t = 1 / (1 + 0.3275911 * x);
      const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
        - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
      return s * y;
    };
    const ncdf = (x: number, mean: number, std: number) =>
      std === 0 ? (x >= mean ? 1 : 0)
        : 0.5 * (1 + erfFn((x - mean) / (std * Math.sqrt(2))));

    let total = 0;
    const raw = analysisData.map(r => {
      if (!r.parsed) return { range: r.range, p: 0 };
      const p = Math.max(0, ncdf(r.parsed.max, mu, normalSigma) - ncdf(r.parsed.min, mu, normalSigma));
      total += p;
      return { range: r.range, p };
    });
    return raw.map(r => ({
      range: r.range,
      normalProb: total > 0 ? (r.p / total) * 100 : 0,
    }));
  }, [analysisData, mu, normalSigma]);
  
  const probabilityModel = {
    mu,
    C,
    R,
    T,
    E_rem,
  };

  const handleSelectMarket = (index: number) => {
    setSelectedMarketIndex(index);
  };

  const calculateIntervalAnalysis = (item: typeof analysisData[0]) => {
    if (!item?.parsed) return null;
    const marketPrice = item.price;
    const trueProb = item.realProb;
    
    const alpha = marketPrice > 0 ? trueProb / marketPrice : 1;
    const edge = trueProb - marketPrice;
    
    const minVelocity = remainingHours > 0 ? (item.parsed.min - currentTweetCount) / remainingHours : Infinity;
    const maxVelocity = remainingHours > 0 ? (item.parsed.max - currentTweetCount) / remainingHours : Infinity;
    
    const status = currentTweetCount > item.parsed.max ? 'busted' : 
                   currentTweetCount >= item.parsed.min ? 'passed' : 'active';
    
    return {
      range: item.range,
      marketPrice,
      trueProb: Math.max(0, Math.min(trueProb, 100)),
      alpha,
      edge,
      minVelocity: minVelocity === Infinity ? Infinity : Math.max(0, minVelocity),
      maxVelocity: maxVelocity === Infinity ? Infinity : Math.max(0, maxVelocity),
      parsed: item.parsed,
      isCenter: item.isCenter,
      status,
      tweetsNeededMin: Math.max(0, item.parsed.min - currentTweetCount),
      tweetsNeededMax: Math.max(0, item.parsed.max - currentTweetCount),
    };
  };

  const intervalAnalysis = useMemo(() => {
    return analysisData.map(calculateIntervalAnalysis).filter(Boolean);
  }, [analysisData, calculateIntervalAnalysis, remainingHours, currentTweetCount]);

  const velocityRanges = useMemo(() => {
    const currentSpeed = apiPace / 24;
    const activeIntervals = intervalAnalysis.filter(i => i?.status === 'active');
    
    return activeIntervals.map(item => {
      if (!item) return null;
      const centerDist = Math.abs((item.parsed.min + item.parsed.max) / 2 - mu);
      const canReachMin = currentSpeed >= item.minVelocity;
      const difficulty = !canReachMin ? 'impossible' : 
                        centerDist < 20 ? 'easy' : 
                        centerDist < 50 ? 'medium' : 'hard';
      
      return {
        range: item.range,
        parsed: item.parsed,
        minVelocity: item.minVelocity,
        maxVelocity: item.maxVelocity,
        tweetsNeededMin: item.tweetsNeededMin,
        tweetsNeededMax: item.tweetsNeededMax,
        trueProb: item.trueProb,
        marketPrice: item.marketPrice,
        difficulty,
        isCenter: item.isCenter,
        alpha: item.alpha,
        edge: item.edge,
      };
    }).filter(Boolean).sort((a, b) => (a!.parsed?.min || 0) - (b!.parsed?.min || 0));
  }, [intervalAnalysis, apiPace, mu]);

  return (
    <div className="min-h-screen bg-[#0d1829]">
      {/* ── Header ── */}
      <header className="bg-[#101f31]/95 backdrop-blur border-b border-sky-900/40 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
                <Radio className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-slate-100 tracking-wide">马斯克推文预测市场</h1>
                <p className="text-[11px] text-slate-500 tracking-wider uppercase">Musk Tweet Prediction Markets</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded text-xs font-medium bg-sky-500/10 border border-sky-500/30 text-sky-400">
                {phase.name}
              </span>
              <div className="hidden lg:flex items-center gap-3 text-xs font-mono">
                {/* Live clock */}
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Clock className="w-3 h-3 text-sky-500" />
                  <span>{now.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  <span className="text-slate-600">BJ</span>
                </div>
                {/* Data freshness */}
                {lastUpdated && (() => {
                  const ageMs = now.getTime() - parseTimestamp(lastUpdated).getTime();
                  const ageMins = Math.floor(ageMs / 60000);
                  const ageText = ageMins < 1 ? '刚刚' : ageMins < 60 ? `${ageMins}分钟前` : `${Math.floor(ageMins / 60)}小时前`;
                  const isStale = ageMins > 10;
                  return (
                    <div className={`flex items-center gap-1 ${isStale ? 'text-amber-500' : 'text-slate-500'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isStale ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                      <span>数据 {ageText}</span>
                    </div>
                  );
                })()}
              </div>
              <a
                href="https://polymarket.com/?r=adul"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 text-xs font-medium rounded-lg border border-slate-700 transition-all"
              >
                <span>主页</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href={`https://polymarket.com/event/${currentMarket?.slug || ''}${REFERRAL}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg transition-all"
              >
                <span>进入市场</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ── Nav ── */}
      <nav className="bg-[#101f31]/80 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-0">
            {[
              { id: 'market', label: '市场概览', icon: TrendingUp },
              { id: 'analysis', label: '概率分析', icon: BarChart3 },
              { id: 'chart', label: '概率走势', icon: LineChartIcon },
              { id: 'heatmap', label: '发推热力图', icon: Grid3X3 },
              { id: 'tweet', label: '推文生成', icon: FileText },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-5 py-3.5 text-xs font-medium border-b-2 transition-all tracking-wide ${
                  activeTab === tab.id
                    ? 'border-sky-500 text-sky-400 bg-sky-500/5'
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'market' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <section className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/25 flex items-center justify-center">
                        <Target className="w-4.5 h-4.5 text-sky-400" />
                      </div>
                      <h2 className="text-base font-semibold text-slate-200">
                        {currentMarket?.title ? parseMarketTitle(currentMarket.title) : '市场数据'}
                      </h2>
                    </div>
                    <button
                      onClick={handleRefresh}
                      disabled={isLoadingGist || isLoadingTracker}
                      className="flex items-center gap-2 text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-all disabled:opacity-40"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingGist || isLoadingTracker ? 'animate-spin' : ''}`} />
                      {isLoadingGist || isLoadingTracker ? '刷新中...' : '刷新数据'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div className="bg-slate-800/50 border border-sky-500/15 rounded-xl p-4 text-center">
                      <p className="text-[11px] text-slate-500 mb-1 uppercase tracking-wide">当前总数</p>
                      <p className="text-3xl font-bold text-sky-400 font-mono">{currentTracking?.stats?.total || '—'}</p>
                      <p className="text-[11px] text-slate-600 mt-1">条推文</p>
                    </div>
                    <div className="bg-slate-800/50 border border-emerald-500/15 rounded-xl p-4 text-center">
                      <p className="text-[11px] text-slate-500 mb-1 uppercase tracking-wide">今日新增</p>
                      <p className="text-3xl font-bold text-emerald-400 font-mono">{currentTracking?.stats?.todayTotal || '—'}</p>
                      <p className="text-[11px] text-slate-600 mt-1">条</p>
                    </div>
                    <div className="bg-slate-800/50 border border-amber-500/15 rounded-xl p-4 text-center">
                      <p className="text-[11px] text-slate-500 mb-1 uppercase tracking-wide">日均时速</p>
                      <p className="text-3xl font-bold text-amber-400 font-mono">{currentTracking?.stats?.pace || '—'}</p>
                      <p className="text-[11px] text-slate-600 mt-1">条/天</p>
                    </div>
                    <div className="bg-slate-800/50 border border-violet-500/15 rounded-xl p-4 text-center">
                      <p className="text-[11px] text-slate-500 mb-1 uppercase tracking-wide">剩余时间</p>
                      <p className="text-3xl font-bold text-violet-400 font-mono">
                        {currentTracking?.stats ? `${currentTracking.stats.daysRemaining}d` : '—'}
                      </p>
                      <p className="text-[11px] text-slate-600 mt-1">
                        {currentTracking?.stats && currentTracking.stats.hoursRemaining > 0
                          ? `${currentTracking.stats.hoursRemaining}h`
                          : '结束'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-800">
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-slate-500">完成进度</span>
                      <span className="text-slate-300 font-mono font-medium">{currentTracking?.stats?.percentComplete || 0}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-sky-500 transition-all duration-500"
                        style={{ width: `${Math.min(currentTracking?.stats?.percentComplete || 0, 100)}%` }}
                      />
                    </div>
                  </div>
                </section>

                {currentMarket && (
                  <section className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                          <Activity className="w-4 h-4 text-sky-400" />
                        </div>
                        <h2 className="text-base font-semibold text-slate-200">Polymarket 赔率</h2>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-[11px] text-slate-600 uppercase tracking-wide">交易量</p>
                          <p className="text-sm font-bold text-sky-400 font-mono">
                            ${(currentMarket.volume / 1000000).toFixed(1)}M
                          </p>
                        </div>
                        <a
                          href={`https://polymarket.com/event/${currentMarket?.slug || 'elon-musk-of-tweets-march-24-march-31'}${REFERRAL}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition-all"
                        >
                          <span>查看市场</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                    {lastUpdated && (
                      <div className="text-[11px] text-slate-600 mb-4 font-mono">
                        数据更新: {new Date(lastUpdated).toLocaleString('zh-CN')}
                      </div>
                    )}

                    <div className="mb-5 p-4 bg-sky-500/5 rounded-xl border border-sky-500/15">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-400">预测中心落点</span>
                        <span className="text-2xl font-bold text-sky-400 font-mono">
                          ~{predictedCenter} 条
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mt-1 font-mono">
                        日均 <span className="text-amber-400">{apiPace.toFixed(1)}</span> 条/天
                        <span className="ml-2 text-slate-700">· {(apiPace / 24).toFixed(2)} 条/h</span>
                      </div>
                    </div>
                    
                    <div className="space-y-1.5">
                      {analysisData.slice(0, 8).map((r) => (
                        <div
                          key={r.range}
                          className={`flex items-center justify-between rounded-lg px-4 py-2.5 transition-colors ${
                            r.isCenter
                              ? 'bg-sky-500/10 border border-sky-500/40'
                              : 'bg-slate-800/40 border border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`font-mono text-sm font-medium ${r.isCenter ? 'text-sky-300' : 'text-slate-300'}`}>
                              {r.range}
                            </span>
                            {r.isCenter && (
                              <span className="px-1.5 py-0.5 bg-sky-500/20 text-sky-400 text-[10px] rounded font-medium tracking-wide">CENTER</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-20 bg-slate-800 rounded-full h-1 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${r.isCenter ? 'bg-sky-500' : 'bg-slate-600'}`}
                                style={{ width: `${Math.min(r.price || 0, 25) * 4}%` }}
                              />
                            </div>
                            <span className={`text-sm font-bold font-mono w-12 text-right ${r.isCenter ? 'text-sky-400' : 'text-slate-400'}`}>
                              {r.price.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              <div className="space-y-4">
                <section className="bg-[#162538] rounded-2xl p-5 border border-slate-800/80">
                  <h3 className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                    市场列表
                  </h3>
                  <div className="space-y-2">
                    {activeMarkets.map((market, i) => {
                      const end = new Date(market.end_date);
                      const now = new Date();
                      const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                      const isActive = i === selectedMarketIndex;
                      return (
                        <div
                          key={market.slug}
                          className={`p-3 rounded-xl border transition-all ${
                            isActive
                              ? 'bg-sky-500/10 border-sky-500/40'
                              : 'bg-slate-800/30 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <button onClick={() => handleSelectMarket(i)} className="w-full text-left mb-2.5">
                            <div className="flex items-start justify-between">
                              <div>
                                <span className={`text-xs font-medium block ${isActive ? 'text-sky-300' : 'text-slate-300'}`}>
                                  {parseMarketTitle(market.title)}
                                </span>
                                <span className="text-[11px] text-slate-600 mt-0.5 block font-mono">
                                  剩余 {daysLeft}d · ${(market.volume / 1000000).toFixed(1)}M
                                </span>
                              </div>
                              <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isActive ? 'bg-sky-400' : 'bg-slate-700'}`} />
                            </div>
                          </button>
                          <a
                            href={`https://polymarket.com/event/${market.slug}${REFERRAL}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1.5 w-full py-1.5 bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 text-xs font-medium rounded-lg transition-colors border border-slate-700/50"
                          >
                            <span>进入市场</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {currentTracking?.stats?.daily && currentTracking.stats.daily.length > 0 && (
                  <section className="bg-[#162538] rounded-2xl p-5 border border-slate-800/80">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">每日发推</h3>
                      <span className="text-[10px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded font-mono">UTC</span>
                    </div>
                    <div className="space-y-0">
                      {currentTracking.stats.daily.slice(-7).reverse().map((day, i) => (
                        <div key={day.date || i} className="flex items-center justify-between py-1.5 border-b border-slate-800/60 last:border-0">
                          <span className="text-xs text-slate-500">{formatDate(day.date)}</span>
                          <span className="text-xs font-bold text-sky-400 font-mono">{day.count}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="space-y-6">
            {!currentMarket || analysisData.length === 0 ? (
              <div className="bg-[#162538] rounded-2xl p-8 border border-slate-800 text-center">
                <p className="text-slate-500">暂无市场数据，请先选择一个活跃市场</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <section className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                        <BarChart3 className="w-5 h-5 text-sky-400" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-200">盘口价值比分析</h2>
                        <p className="text-xs text-slate-500">基于泊松分布 · 预测中心 μ = {mu.toFixed(1)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Clock className="w-3 h-3" />
                      {lastUpdated && new Date(lastUpdated).toLocaleTimeString('zh-CN')}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="text-center p-4 bg-violet-500/10 rounded-xl border border-violet-500/20">
                      <p className="text-2xl font-bold text-violet-400 font-mono">{currentTweetCount}</p>
                      <p className="text-xs text-slate-500">当前推文</p>
                    </div>
                    <div className="text-center p-4 bg-sky-500/10 rounded-xl border border-sky-500/20">
                      <p className="text-2xl font-bold text-sky-400 font-mono">{apiPace.toFixed(1)}</p>
                      <p className="text-xs text-slate-500">日均时速</p>
                    </div>
                    <div className="text-center p-4 bg-amber-500/10 rounded-xl border border-amber-500/20">
                      <p className="text-2xl font-bold text-amber-400 font-mono">{E_rem.toFixed(0)}</p>
                      <p className="text-xs text-slate-500">预期剩余</p>
                    </div>
                    <div className="text-center p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                      <p className="text-2xl font-bold text-emerald-400 font-mono">{remainingDays}d</p>
                      <p className="text-xs text-slate-500">剩余时间</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-800">
                          <th className="text-left py-3 px-3 text-xs font-semibold text-slate-500 uppercase">区间</th>
                          <th className="text-right py-3 px-3 text-xs font-semibold text-slate-500 uppercase">赔率</th>
                          <th className="text-right py-3 px-3 text-xs font-semibold text-slate-500 uppercase">真实概率</th>
                          <th className="text-right py-3 px-3 text-xs font-semibold text-slate-500 uppercase">回报率</th>
                          <th className="text-right py-3 px-3 text-xs font-semibold text-slate-500 uppercase">盈亏</th>
                          <th className="text-right py-3 px-3 text-xs font-semibold text-slate-500 uppercase">状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {intervalAnalysis.slice(0, 12).map((item) => {
                          if (!item) return null;
                          const statusClass = item.isCenter ? 'bg-sky-500/20 text-sky-300' :
                                             item.status === 'busted' ? 'bg-rose-500/15 text-rose-400' :
                                             item.status === 'passed' ? 'bg-emerald-500/15 text-emerald-400' :
                                             'bg-slate-800 text-slate-500';
                          const statusText = item.isCenter ? '中心' :
                                           item.status === 'busted' ? '已破' :
                                           item.status === 'passed' ? '已过' : '活跃';
                          const payout = item.marketPrice > 0 ? (100 / item.marketPrice * 100 - 100) : 0;
                          const payoutClass = payout > 100 ? 'text-emerald-400' : payout > 50 ? 'text-sky-400' : 'text-slate-500';
                          const isPositive = item.trueProb > item.marketPrice;
                          const trueProbClass = isPositive ? 'text-emerald-400' : 'text-rose-400';
                          const profitLoss = item.trueProb - item.marketPrice;
                          const plClass = profitLoss > 0 ? 'text-emerald-400' : profitLoss < 0 ? 'text-rose-400' : 'text-slate-400';

                          return (
                            <tr key={item.range} className={`border-b border-slate-800/60 hover:bg-slate-800/30 ${item.isCenter ? 'bg-sky-500/5' : ''}`}>
                              <td className={`py-3 px-3 font-semibold font-mono ${item.isCenter ? 'text-sky-300' : 'text-slate-300'}`}>
                                {item.range}
                              </td>
                              <td className="py-3 px-3 text-right text-slate-500 font-mono">{item.marketPrice.toFixed(1)}%</td>
                              <td className={`py-3 px-3 text-right font-semibold font-mono ${trueProbClass}`}>{item.trueProb.toFixed(1)}%</td>
                              <td className={`py-3 px-3 text-right font-semibold font-mono ${payoutClass}`}>
                                {payout > 0 ? '+' : ''}{payout.toFixed(0)}%
                              </td>
                              <td className={`py-3 px-3 text-right font-semibold font-mono ${plClass}`}>
                                {profitLoss > 0 ? '+' : ''}{profitLoss.toFixed(1)}%
                              </td>
                              <td className="py-3 px-3 text-right">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusClass}`}>
                                  {statusText}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs text-slate-500 p-3 bg-slate-800/40 rounded-lg">
                    <div className="flex items-center gap-4">
                      <span>真实概率 &gt; 赔率 = <span className="text-emerald-400 font-medium">盈利</span></span>
                      <span>真实概率 &lt; 赔率 = <span className="text-rose-400 font-medium">亏损</span></span>
                    </div>
                    <span>回报率 = 1/赔率 - 1</span>
                  </div>
                </section>

                <section className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                        <Gauge className="w-5 h-5 text-sky-400" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-200">目标区间时速倒推雷达</h2>
                        <p className="text-xs text-slate-600 font-mono">当前速率: {(apiPace / 24).toFixed(2)} 条/时</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {velocityRanges.slice(0, 12).map((item, idx) => {
                      if (!item) return null;
                      const borderColor = item.difficulty === 'impossible' ? 'border-rose-500/30' :
                                         item.difficulty === 'easy' ? 'border-emerald-500/30' :
                                         item.difficulty === 'medium' ? 'border-amber-500/30' :
                                         'border-violet-500/30';
                      const badgeColor = item.difficulty === 'impossible' ? 'bg-rose-500/20 text-rose-300' :
                                        item.difficulty === 'easy' ? 'bg-emerald-500/20 text-emerald-300' :
                                        item.difficulty === 'medium' ? 'bg-amber-500/20 text-amber-300' :
                                        'bg-violet-500/20 text-violet-300';
                      const label = item.difficulty === 'impossible' ? '需加速' :
                                   item.difficulty === 'easy' ? '轻松' :
                                   item.difficulty === 'medium' ? '中等' : '困难';

                      return (
                        <div key={idx} className={`p-4 rounded-xl border bg-slate-800/40 ${borderColor} ${item.isCenter ? 'ring-1 ring-sky-500/40' : ''}`}>
                          {/* Header: range + badges */}
                          <div className="flex items-center justify-between mb-3">
                            <span className={`font-bold text-sm font-mono ${item.isCenter ? 'text-sky-300' : 'text-slate-200'}`}>
                              {item.range}
                            </span>
                            <div className="flex gap-1">
                              {item.isCenter && (
                                <span className="px-1.5 py-0.5 bg-sky-500/20 text-sky-400 text-[10px] rounded font-medium">中心</span>
                              )}
                              <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${badgeColor}`}>{label}</span>
                            </div>
                          </div>

                          {/* Primary: tweets needed — most prominent */}
                          <div className="bg-slate-900/50 rounded-lg p-3 mb-3 text-center">
                            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">还需发推</p>
                            <p className="text-2xl font-bold text-white font-mono leading-none">
                              +{item.tweetsNeededMin}
                              <span className="text-slate-500 text-lg mx-1">~</span>
                              +{item.tweetsNeededMax}
                            </p>
                            <p className="text-[10px] text-slate-600 mt-1">条</p>
                          </div>

                          {/* Secondary: velocity & probability */}
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-500">所需时速</span>
                              <span className="text-sky-400 font-mono">
                                {item.minVelocity === Infinity ? '∞' : item.minVelocity.toFixed(2)}
                                <span className="text-slate-600 mx-0.5">~</span>
                                {item.maxVelocity === Infinity ? '∞' : item.maxVelocity.toFixed(2)}/h
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">真实概率</span>
                              <span className="text-sky-400 font-bold font-mono">{item.trueProb.toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 p-3 bg-slate-800/40 rounded-lg">
                    <div className="grid grid-cols-4 gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded bg-emerald-400"></div>
                        <span className="text-emerald-400">轻松</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded bg-amber-400"></div>
                        <span className="text-amber-400">中等</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded bg-violet-400"></div>
                        <span className="text-violet-400">较难</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded bg-rose-400"></div>
                        <span className="text-rose-400">需加速</span>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                        <Target className="w-4 h-4 text-sky-400" />
                      </div>
                      仓位分配策略建议
                    </h2>
                  </div>
                  {(() => {
                    const centerItem = intervalAnalysis.find(i => i?.isCenter);
                    const centerProb = centerItem?.trueProb || 0;
                    const totalProb = intervalAnalysis.reduce((sum, i) => sum + (i?.trueProb || 0), 0);
                    const centerRatio = totalProb > 0 ? (centerProb / totalProb * 100) : 0;

                    const undervaluedItems = intervalAnalysis.filter(i => i && i.status === 'active' && i.alpha > 1.1);
                    const maxLoss = centerItem?.marketPrice ? (100 - centerItem.marketPrice) : 0;
                    const maxGain = centerItem?.marketPrice ? (100 / centerItem.marketPrice * 100 - 100) : 0;

                    return (
                      <div className="space-y-4">
                        {centerItem && (
                          <div className="p-4 bg-sky-500/10 border border-sky-500/20 rounded-xl">
                            <div className="flex items-center gap-3 mb-4">
                              <span className="px-3 py-1 bg-sky-500/20 text-sky-300 rounded-full text-sm font-semibold">核心仓位</span>
                              <span className="text-sky-200 font-bold text-lg font-mono">{centerItem.range}</span>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                              <div className="text-center p-3 bg-slate-800/60 rounded-lg">
                                <p className="text-2xl font-bold text-sky-300 font-mono">{centerRatio.toFixed(0)}%</p>
                                <p className="text-xs text-slate-500">仓位比例</p>
                              </div>
                              <div className="text-center p-3 bg-slate-800/60 rounded-lg">
                                <p className="text-2xl font-bold text-sky-400 font-mono">{centerItem.trueProb.toFixed(1)}%</p>
                                <p className="text-xs text-slate-500">真实概率</p>
                              </div>
                              <div className="text-center p-3 bg-slate-800/60 rounded-lg">
                                <p className="text-2xl font-bold text-rose-400 font-mono">{maxLoss.toFixed(0)}%</p>
                                <p className="text-xs text-slate-500">潜在亏损</p>
                              </div>
                              <div className="text-center p-3 bg-slate-800/60 rounded-lg">
                                <p className="text-2xl font-bold text-emerald-400 font-mono">{maxGain.toFixed(0)}%</p>
                                <p className="text-xs text-slate-500">潜在收益</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 text-sm text-slate-300 bg-slate-800/40 p-3 rounded-lg">
                              <span className="font-medium">风险收益比:</span>
                              <span className="text-rose-400 font-semibold">-{maxLoss.toFixed(0)}%</span>
                              <span className="text-slate-500">vs</span>
                              <span className="text-emerald-400 font-semibold">+{maxGain.toFixed(0)}%</span>
                              <span className="text-slate-500 ml-2">(赔率 {centerItem.marketPrice.toFixed(1)}%)</span>
                            </div>
                          </div>
                        )}

                        <div className="p-4 bg-slate-800/30 border border-slate-800 rounded-xl">
                          <h3 className="text-sm font-semibold text-slate-300 mb-3">下注区间参考</h3>
                          <div className="space-y-2">
                            {intervalAnalysis.slice(0, 8).map(item => item && (
                              <div key={item.range} className={`flex items-center justify-between p-2 rounded-lg ${item.isCenter ? 'bg-sky-500/10 border border-sky-500/30' : 'bg-slate-800/40'}`}>
                                <span className={`font-medium font-mono ${item.isCenter ? 'text-sky-300' : 'text-slate-300'}`}>
                                  {item.range}
                                  {item.isCenter && <span className="ml-2 text-xs bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded">推荐</span>}
                                </span>
                                <div className="flex items-center gap-4 text-sm">
                                  <span className="text-slate-500 font-mono">赔率: {item.marketPrice.toFixed(1)}%</span>
                                  <span className={`font-medium font-mono ${item.alpha > 1 ? 'text-emerald-400' : item.alpha < 1 ? 'text-rose-400' : 'text-slate-500'}`}>
                                    α: {item.alpha.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {undervaluedItems.length > 0 && (
                          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                            <h3 className="text-sm font-semibold text-emerald-400 mb-2">价值区间 (α &gt; 1.1)</h3>
                            <p className="text-xs text-slate-500 mb-2">市场定价低于真实概率，值得关注</p>
                            <div className="flex flex-wrap gap-2">
                              {undervaluedItems.slice(0, 5).map(item => item && (
                                <span key={item.range} className="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-sm font-mono">
                                  {item.range} α={item.alpha.toFixed(2)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </section>
              </div>

              <div className="space-y-6">
                <section className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80">
                  <h2 className="text-base font-semibold text-slate-200 mb-4 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                      <Activity className="w-4 h-4 text-sky-400" />
                    </div>
                    泊松概率模型
                  </h2>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-slate-800/40 rounded-lg border border-slate-800">
                      <span className="text-sm text-slate-400">当前已发推</span>
                      <span className="text-sm font-bold text-slate-200 font-mono">{probabilityModel.C} 条</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-800/40 rounded-lg border border-slate-800">
                      <span className="text-sm text-slate-400">日均发推</span>
                      <span className="text-sm font-bold text-amber-400 font-mono">{probabilityModel.R.toFixed(1)} 条/天</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-800/40 rounded-lg border border-slate-800">
                      <span className="text-sm text-slate-400">剩余时间</span>
                      <span className="text-sm font-bold text-slate-200 font-mono">{(T / 24).toFixed(1)} 天</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-sky-500/10 rounded-lg border border-sky-500/20">
                      <span className="text-sm text-slate-400">预期落点 μ</span>
                      <span className="text-lg font-bold text-sky-300 font-mono">{probabilityModel.mu.toFixed(0)} 条</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg border border-sky-400/15">
                      <span className="text-sm text-slate-400">预期剩余 λ</span>
                      <span className="text-sm font-bold text-sky-400 font-mono">{probabilityModel.E_rem.toFixed(1)} 条</span>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-slate-800/30 rounded-lg text-xs text-slate-500 font-mono">
                    泊松分布: P(X=k) = μ^k * e^(-μ) / k!
                  </div>
                </section>

                {normalProbs.length > 0 && (
                  <section className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80">
                    <h2 className="text-base font-semibold text-slate-200 mb-1 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                        <BarChart3 className="w-4 h-4 text-sky-400" />
                      </div>
                      分布模型对比
                    </h2>
                    <p className="text-xs text-slate-500 mb-4 pl-10 font-mono">
                      泊松 vs 正态 (σ={normalSigma.toFixed(0)}, Elon×2.2) · μ={mu.toFixed(0)}
                    </p>
                    <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                      {analysisData.slice(0, 12).map(item => {
                        const np = normalProbs.find(n => n.range === item.range);
                        const normalVal = np?.normalProb ?? 0;
                        const poissonVal = item.realProb;
                        const delta = normalVal - poissonVal;
                        return (
                          <div
                            key={item.range}
                            className={`px-3 py-2 rounded-lg text-xs ${
                              item.isCenter
                                ? 'bg-sky-500/5 border border-sky-500/20'
                                : 'bg-slate-800/40'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className={`font-bold font-mono ${item.isCenter ? 'text-sky-300' : 'text-slate-200'}`}>
                                {item.range}
                              </span>
                              <span className="text-slate-500 text-[11px] font-mono">
                                市场 {item.price.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex gap-3 items-center">
                              <span className="text-sky-400 font-medium font-mono">泊松 {poissonVal.toFixed(1)}%</span>
                              <span className="text-violet-400 font-medium font-mono">正态 {normalVal.toFixed(1)}%</span>
                              <span className={`ml-auto font-semibold font-mono ${
                                delta > 1 ? 'text-emerald-400'
                                : delta < -1 ? 'text-rose-400'
                                : 'text-slate-500'
                              }`}>
                                Δ{delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-[11px] text-slate-600 text-center">
                      正态分布偏宽（Δ正）→ 尾部风险更大；偏窄（Δ负）→ 中心更集中
                    </p>
                  </section>
                )}

                {currentTracking?.stats?.daily && currentTracking.stats.daily.length > 0 && (
                  <section className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-slate-300">每日发推统计</h3>
                      <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded font-mono">UTC</span>
                    </div>
                    <div className="space-y-1">
                      {currentTracking.stats.daily.slice(-7).reverse().map((day, i) => (
                        <div key={day.date || i} className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0">
                          <span className="text-sm text-slate-400">{formatDate(day.date)}</span>
                          <span className="text-sm font-semibold text-sky-400 font-mono">{day.count}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <a
                  href={`https://polymarket.com/event/${currentMarket?.slug || ''}${REFERRAL}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full p-4 bg-sky-600 hover:bg-sky-500 rounded-xl text-center font-semibold text-white transition-all"
                >
                  <ExternalLink className="w-4 h-4 inline mr-2" />
                  进入 Polymarket 下注
                </a>
              </div>
            </div>
            )}
          </div>
        )}

        {activeTab === 'chart' && (
          <div className="max-w-5xl mx-auto space-y-6">
            <ProbabilityChart
              history={priceHistory.filter(
                s => !currentMarket || s.marketSlug === currentMarket.slug
              )}
              marketStartDate={currentTracking?.startDate || currentMarket?.start_date}
              marketEndDate={currentTracking?.endDate || currentMarket?.end_date}
            />
          </div>
        )}

        {activeTab === 'heatmap' && (
          <div className="max-w-6xl mx-auto">
            <TweetHeatmap />
          </div>
        )}

        {activeTab === 'tweet' && (
          <TweetGenerator
            currentTracking={currentTracking}
            currentMarket={currentMarket}
            predictedCenter={predictedCenter}
            apiPace={apiPace}
            remainingHours={remainingHours}
            centerRange={analysisData.find(d => d.isCenter)?.range || ''}
            intervalAnalysis={intervalAnalysis}
            priceHistory={priceHistory}
          />
        )}
      </main>
    </div>
  );
}

interface TweetGeneratorProps {
  currentTracking: Tracking | undefined;
  currentMarket: MarketData | null;
  predictedCenter: number;
  apiPace: number;
  remainingHours: number;
  centerRange: string;
  intervalAnalysis: any[];
  priceHistory: PriceSnapshot[];
}

function TweetGenerator({ currentTracking, currentMarket, predictedCenter, apiPace, remainingHours, centerRange, intervalAnalysis, priceHistory }: TweetGeneratorProps) {
  const [copied, setCopied] = useState(false);

  const marketTitle = currentMarket?.title ? parseMarketTitle(currentMarket.title) : '预测市场';

  const tweetContent = useMemo(() => {
    const phase = currentTracking?.stats ? getPhase(currentTracking.stats.daysRemaining) : getPhase(7);
    const currentTotal = currentTracking?.stats?.total || 0;
    const todayTotal = currentTracking?.stats?.todayTotal || 0;
    const daysRem = currentTracking?.stats?.daysRemaining ?? 0;
    const hoursRem = currentTracking?.stats?.hoursRemaining ?? 0;
    const currentSpeed = apiPace / 24;
    const remainingText = daysRem > 0 ? `${daysRem}天${hoursRem}h` : `${hoursRem}h`;

    // Top 3 active intervals by model probability
    const activeIntervals = (intervalAnalysis ?? []).filter((i: any) => i && i.status === 'active');
    const topIntervals = [...activeIntervals]
      .sort((a: any, b: any) => b.trueProb - a.trueProb)
      .slice(0, 3);

    // Center interval for velocity comparison
    const centerInterval = (intervalAnalysis ?? []).find((i: any) => i?.isCenter);

    // ── Section 1: Multi-range comparison (model vs market) ──
    const rangeLines = topIntervals.map((i: any) => {
      const diff = i.trueProb - i.marketPrice;
      const sign = diff >= 2 ? '🟢' : diff <= -2 ? '🔴' : '⚪';
      const diffStr = diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
      return `${sign} [${i.range}]  模型${i.trueProb.toFixed(1)}% | 市场${i.marketPrice.toFixed(1)}%  (${diffStr})`;
    }).join('\n');

    // ── Section 2: Velocity comparison ──
    let velocityLine = '';
    if (centerInterval) {
      const minV = centerInterval.minVelocity === Infinity ? '∞' : centerInterval.minVelocity.toFixed(2);
      const maxV = centerInterval.maxVelocity === Infinity ? '∞' : centerInterval.maxVelocity.toFixed(2);
      const ok = currentSpeed >= (centerInterval.minVelocity || 0);
      velocityLine = `⚡ [${centerInterval.range}] 所需 ${minV}~${maxV}/h  当前 ${currentSpeed.toFixed(2)}/h  ${ok ? '✅' : '⚠️'}`;
    }

    // ── Section 3: 1-hour price trend from history ──
    let trendLine = '';
    const marketHistory = priceHistory.filter(s => s.marketSlug === currentMarket?.slug);
    if (marketHistory.length >= 2) {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const oldSnap = [...marketHistory].reverse().find(s => s.timestamp <= oneHourAgo);
      if (oldSnap && topIntervals.length > 0) {
        const trends = topIntervals.map((interval: any) => {
          const prev = oldSnap.ranges.find(r => r.range === interval.range);
          if (!prev) return null;
          const delta = interval.marketPrice - prev.price;
          if (Math.abs(delta) < 0.5) return `[${interval.range}]→`;
          return `[${interval.range}]${delta > 0 ? '↑' : '↓'}${Math.abs(delta).toFixed(1)}%`;
        }).filter(Boolean);
        if (trends.length > 0) {
          trendLine = `\n📉 1h赔率变化: ${trends.join('  ')}`;
        }
      }
    }

    return `📊 ${marketTitle}

📍 ${currentTotal}条 (今日+${todayTotal}) · 剩余${remainingText} · ${phase.name}
🎯 落点预测: ~${predictedCenter}条  日均 ${apiPace.toFixed(0)}条/天

📊 高概率区间 (模型概率 vs 市场赔率):
${rangeLines}
${trendLine}
${velocityLine ? '\n' + velocityLine : ''}
🔗 polymarket.com/event/${currentMarket?.slug || ''}${REFERRAL}

#ElonMusk #Polymarket #预测市场`.trim();
  }, [currentTracking, currentMarket, predictedCenter, apiPace, remainingHours, centerRange, marketTitle, intervalAnalysis, priceHistory]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(tweetContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const openTwitter = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetContent)}`;
    window.open(twitterUrl, '_blank');
  };

  const openTelegram = () => {
    const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent('https://polymarket.com' + (currentMarket?.slug ? '/event/' + currentMarket.slug : ''))}&text=${encodeURIComponent(tweetContent)}`;
    window.open(telegramUrl, '_blank');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <section className="bg-[#11202f] rounded-2xl p-6 border border-slate-800">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-amber-400" />
            </div>
            推文生成
          </h2>
          <div className="flex gap-2">
            <button
              onClick={openTelegram}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
              Telegram
            </button>
            <button
              onClick={openTwitter}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors border border-slate-700"
            >
              <Send className="w-4 h-4" />
              Twitter/X
            </button>
          </div>
        </div>

        <div className="bg-slate-900/80 rounded-xl p-5 mb-4 font-mono text-sm text-slate-300 leading-relaxed whitespace-pre-wrap border border-slate-800">
          {tweetContent}
        </div>

        <button
          onClick={copyToClipboard}
          className={`w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl font-semibold transition-all text-base ${
            copied
              ? 'bg-emerald-600 text-white'
              : 'bg-sky-600 hover:bg-sky-500 text-white'
          }`}
        >
          {copied ? (
            <>
              <CheckCircle className="w-5 h-5" />
              已复制到剪贴板
            </>
          ) : (
            <>
              <Copy className="w-5 h-5" />
              复制推文内容
            </>
          )}
        </button>
      </section>
    </div>
  );
}
