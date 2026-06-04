import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  BarChart3,
  Grid3X3,
  ExternalLink,
  RefreshCw,
  Clock,
  FileText,
  Send,
  Radio,
  Copy,
  CheckCircle,
  Gauge,
  BookOpen,
  Wallet,
  Bell,
} from 'lucide-react';
import { TweetHeatmap } from './components/TweetHeatmap';
import { StrategyGuide } from './components/StrategyGuide';
import { PositionManager } from './components/PositionManager';
import type { Position } from './components/PositionManager';
import { TelegramAlerts, useTelegramAlerts } from './components/TelegramAlerts';
import type { PriceSnapshot } from './components/ProbabilityChart';
// ProbabilityChart component kept for potential future use; tab removed

const REFERRAL = '?via=serene77mc-g6kj';

interface RangeData {
  range: string;
  price: number;
  liquidity: number;
  slug: string;
  tokenId?: string;  // CLOB YES-token ID, for historical price lookup
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
const POSITIONS_KEY = 'musk_positions_v1';

// ── 马斯克发推时间权重（北京时间，基于206天/8942条推文历史数据）──────────────
// 每小时权重 = 该小时历史推文量 / 总量，24小时之和 = 1.000
// 数据来源: 2025-11-14 ~ 2026-05-25, xtracker.polymarket.com
const HOURLY_WEIGHTS_BJ: Record<number, number> = {
   0: 0.0495,  // CDT 11am  中等
   1: 0.0500,  // CDT 12pm  中等
   2: 0.0512,  // CDT 1pm   ⭐活跃
   3: 0.0503,  // CDT 2pm   中等
   4: 0.0415,  // CDT 3pm   中等
   5: 0.0310,  // CDT 4pm   较低
   6: 0.0263,  // CDT 5pm   较低
   7: 0.0335,  // CDT 6pm   较低
   8: 0.0350,  // CDT 7pm   较低
   9: 0.0295,  // CDT 8pm   较低
  10: 0.0240,  // CDT 9pm   较低
  11: 0.0256,  // CDT 10pm  较低
  12: 0.0280,  // CDT 11pm  较低 ← 爆发前洼地
  13: 0.0699,  // CDT 12am  ⭐⭐超级活跃
  14: 0.0785,  // CDT 1am   ⭐⭐全天最高峰
  15: 0.0616,  // CDT 2am   ⭐活跃
  16: 0.0530,  // CDT 3am   ⭐活跃
  17: 0.0270,  // CDT 4am   较低
  18: 0.0183,  // CDT 5am   💤全天最低
  19: 0.0223,  // CDT 6am   较低
  20: 0.0347,  // CDT 7am   较低
  21: 0.0467,  // CDT 8am   中等
  22: 0.0603,  // CDT 9am   ⭐活跃
  23: 0.0522,  // CDT 10am  ⭐活跃
};

// 获取当前北京时间小时
function getBJHourNow(): number {
  return new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();
}

// ── 会话类型定义（205天/673会话统计）────────────────────────────────────────
// freq: 出现频率; avgTweets: 出现时均推文数; medTweets: 中位数
// strongThreshold: 超过此值为"强会话"（>1.5x中位）
// weakThreshold:   低于此值为"弱会话"（<0.5x中位）
interface SessionDef {
  name: string; emoji: string; bjHours: number[]; cdt: string;
  freq: number; avgTweets: number; medTweets: number;
  strongThreshold: number; weakThreshold: number;
  expectedContrib: number; // 期望日贡献 = freq × avgTweets
  muDropIfAbsent: number;  // 缺席时µ预期下修量
}
const SESSION_DEFS: SessionDef[] = [
  { name: '下午会话', emoji: '☀️', bjHours: [0,1,2,3,4,5],   cdt: 'CDT 11am–5pm',
    freq: 0.97, avgTweets: 14.4, medTweets: 10, strongThreshold: 15, weakThreshold: 5,
    expectedContrib: 13.9, muDropIfAbsent: 14 },
  { name: '傍晚会话', emoji: '🌆', bjHours: [6,7,8,9,10],    cdt: 'CDT 5–10pm',
    freq: 0.51, avgTweets: 11.4, medTweets: 6,  strongThreshold: 9,  weakThreshold: 3,
    expectedContrib: 5.8,  muDropIfAbsent: 11 },
  { name: '深夜会话', emoji: '🌙', bjHours: [11,12,13,14,15,16], cdt: 'CDT 10pm–3am',
    freq: 0.71, avgTweets: 14.3, medTweets: 11, strongThreshold: 16, weakThreshold: 5,
    expectedContrib: 10.1, muDropIfAbsent: 14 },
  { name: '清晨过渡', emoji: '🌅', bjHours: [17,18,19],       cdt: 'CDT 4–7am',
    freq: 0.16, avgTweets: 16.4, medTweets: 13, strongThreshold: 19, weakThreshold: 6,
    expectedContrib: 2.6,  muDropIfAbsent: 16 },
  { name: '上午会话', emoji: '🏙️', bjHours: [20,21,22,23],   cdt: 'CDT 7–11am',
    freq: 0.64, avgTweets: 10.9, medTweets: 8,  strongThreshold: 12, weakThreshold: 4,
    expectedContrib: 7.0,  muDropIfAbsent: 11 },
];

type SessionStatus = 'confirmed' | 'strong' | 'weak' | 'absent' | 'ongoing' | 'pending' | 'upcoming';

interface SessionState {
  def: SessionDef;
  status: SessionStatus;
  actual: number;       // 今日该会话实际推文数
  label: string;        // 状态描述
  muAdjust: number;     // 对µ的修正量（正=上修，负=下修）
  isAnomaly: boolean;
  anomalyDesc: string;
  entrySignal: 'buy' | 'sell' | 'hold' | 'wait' | null;
}

function parseRange(range: string): { min: number; max: number } | null {
  const match = range.match(/(\d+)-(\d+)/);
  if (match) return { min: parseInt(match[1]), max: parseInt(match[2]) };
  if (range.includes('+')) {
    const num = parseInt(range.replace('+', ''));
    return { min: num, max: 9999 };
  }
  return null;
}


function getPhase(remainingDays: number): { name: string; color: string; bg: string } {
  if (remainingDays >= 5) return { name: '前期布局', color: 'text-teal-400', bg: 'bg-teal-500/20 border-teal-500/40 text-indigo-300' };
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
      // Extract YES-side token ID for CLOB historical price lookup
      let tokenId: string | undefined;
      try {
        const ids = typeof m.clobTokenIds === 'string'
          ? JSON.parse(m.clobTokenIds) : (m.clobTokenIds ?? []);
        tokenId = ids[0] ?? undefined;
      } catch { /* ignore */ }
      return {
        range: match[1],
        price,
        liquidity: parseFloat(m.liquidity ?? 0),
        slug: m.slug ?? '',
        tokenId,
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

// ─── CLOB historical price data ──────────────────────────────────────────────
// Polymarket CLOB API provides full price history from market creation.
// Each binary sub-market has a YES-token whose prices we fetch hourly.

const CLOB_BASE = 'https://clob.polymarket.com';

// Fetch full price history for a single YES-token from market creation to now.
// Requires interval=max; startTs/endTs parameters are NOT used by this endpoint.
// fidelity=1 gives minute-level granularity (typically 500-600 points per 7-day market).
async function fetchClobTokenHistory(
  tokenId: string,
): Promise<Array<{ t: number; p: number }>> {
  try {
    const url = `${CLOB_BASE}/prices-history?market=${tokenId}&interval=max&fidelity=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.history ?? []) as Array<{ t: number; p: number }>;
  } catch {
    return [];
  }
}

// Build PriceSnapshot[] from CLOB history for a given market.
// Strategy:
//  1. Fetch minute-level YES-token history for every range in parallel.
//  2. Bucket into 30-minute intervals so all ranges align in time.
//  3. For each bucket, use the last-known price per range (fill-forward).
//  4. Only emit a snapshot if at least 1 range has data.
async function buildClobSnapshots(market: MarketData): Promise<PriceSnapshot[]> {
  const rangesWithToken = market.ranges.filter(r => r.tokenId);
  if (rangesWithToken.length === 0) return [];

  // Fetch all ranges' price histories in parallel
  const histories = await Promise.allSettled(
    rangesWithToken.map(r => fetchClobTokenHistory(r.tokenId!))
  );

  // Build per-range sorted price series (unix seconds)
  type PriceSeries = Array<{ t: number; p: number }>;
  const seriesMap = new Map<string, PriceSeries>();
  histories.forEach((result, i) => {
    if (result.status !== 'fulfilled' || result.value.length === 0) return;
    const rangeName = rangesWithToken[i].range;
    seriesMap.set(rangeName, [...result.value].sort((a, b) => a.t - b.t));
  });
  if (seriesMap.size === 0) return [];

  // Determine bucket range: from earliest data point to now
  const allTsMs = [...seriesMap.values()].flatMap(s => s.map(p => p.t * 1000));
  const minTsMs = Math.min(...allTsMs);
  const maxTsMs = Math.min(Math.max(...allTsMs), Date.now());

  const BUCKET_MS = 30 * 60 * 1000; // 30-minute buckets
  const buckets: number[] = [];
  // Round first bucket down to nearest 30-min boundary
  const firstBucket = Math.floor(minTsMs / BUCKET_MS) * BUCKET_MS;
  for (let t = firstBucket; t <= maxTsMs + BUCKET_MS; t += BUCKET_MS) {
    buckets.push(t);
  }

  // For a given sorted series, get the last known price at or before tsMs
  function lastPriceAt(series: PriceSeries, tsMs: number): number | null {
    const tsSec = tsMs / 1000;
    let last: number | null = null;
    for (const point of series) {
      if (point.t <= tsSec) last = point.p;
      else break;
    }
    return last;
  }

  const snapshots: PriceSnapshot[] = [];
  for (const tsMs of buckets) {
    const ranges: import('./components/ProbabilityChart').RangeSnapshot[] = [];
    for (const [rangeName, series] of seriesMap) {
      const price = lastPriceAt(series, tsMs);
      if (price === null) continue;
      const pct = Math.round(price * 1000) / 10; // 0-1 → percentage
      ranges.push({
        range: rangeName,
        price: pct,
        modelProb: pct,
        liquidity: market.ranges.find(r => r.range === rangeName)?.liquidity ?? 0,
      });
    }
    if (ranges.length > 0) {
      snapshots.push({ timestamp: tsMs, marketSlug: market.slug, tweetCount: 0, ranges });
    }
  }

  return snapshots;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'market' | 'analysis' | 'heatmap' | 'tweet' | 'guide' | 'positions' | 'telegram'>('market');
  const [gistData, setGistData] = useState<MarketData[]>([]);
  const [trackings, setTrackings] = useState<Tracking[]>([]);
  const [selectedMarketIndex, setSelectedMarketIndex] = useState(0);
  const [isLoadingGist, setIsLoadingGist] = useState(true);
  const [isLoadingTracker, setIsLoadingTracker] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [currentTweetCount, setCurrentTweetCount] = useState(0);
  const [priceHistory, setPriceHistory] = useState<PriceSnapshot[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [positions, setPositions] = useState<Position[]>(() => {
    try { return JSON.parse(localStorage.getItem(POSITIONS_KEY) || '[]') as Position[]; }
    catch { return []; }
  });

  // Heatmap data state — reactive, powers session analysis panel on any tab
  const [heatmapData, setHeatmapData] = useState<Array<{date: string; hour: number; count: number}>>(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('musk_tweet_heatmap_data') || '{}');
      return Array.isArray(cached.data) ? cached.data : [];
    } catch { return []; }
  });

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

  // Persist positions to localStorage whenever they change
  useEffect(() => {
    try { localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions)); }
    catch { /* ignore quota errors */ }
  }, [positions]);

  // ── Fetch market list + prices directly from Gamma API (browser fetch, CORS open) ──
  const fetchMarketData = async () => {
    setIsLoadingGist(true);
    try {
      const markets = await discoverElonMarkets();
      if (markets.length > 0) {
        setGistData(markets);
        setLastUpdated(new Date().toISOString());
        console.log(`[markets] Loaded ${markets.length} active market(s)`);
        // Load full CLOB history in the background (don't await — non-blocking)
        fetchClobHistoryForMarkets(markets);
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

  // ── Fetch full price history from Polymarket CLOB API ─────────────────────
  // Called once after markets are discovered. Provides historical data from
  // market creation date — fills in the chart for periods before the site launched.
  const fetchClobHistoryForMarkets = async (markets: MarketData[]) => {
    for (const market of markets) {
      try {
        const snapshots = await buildClobSnapshots(market);
        if (snapshots.length === 0) continue;
        console.log(`[clob] Loaded ${snapshots.length} hourly snapshots for ${market.slug}`);
        setPriceHistory(prev => {
          // Merge: CLOB data wins for its timestamps, keep local/Gist data for others
          const clobKeys = new Set(snapshots.map(s => `${s.timestamp}-${s.marketSlug}`));
          const rest = prev.filter(s => !clobKeys.has(`${s.timestamp}-${s.marketSlug}`));
          return [...snapshots, ...rest].sort((a, b) => a.timestamp - b.timestamp);
        });
      } catch (err) {
        console.warn(`[clob] Failed for ${market.slug}:`, err);
      }
    }
  };

  const fetchTrackerData = async () => {
    try {
      // 1. 优先走 Vercel 代理 /api/xtracker（服务端调用，无 VPN 需求）
      const isProduction = !['localhost', '127.0.0.1'].includes(window.location.hostname);
      if (isProduction) {
        try {
          const res = await fetch('/api/xtracker', { signal: AbortSignal.timeout(15000) });
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.trackings?.length > 0) {
              console.log(`[xtracker] Vercel proxy 返回 ${data.trackings.length} 条`);
              setTrackings(data.trackings);
              return;
            }
          }
        } catch (e) {
          console.warn('[xtracker] Vercel proxy 失败，尝试 Gist:', e);
        }
      }

      // 2. Fallback：GitHub Actions 每 3 分钟存的 Gist（也无 VPN 需求）
      try {
        const gistRes = await fetch('/api/gist-data', { signal: AbortSignal.timeout(10000) });
        if (gistRes.ok) {
          // /api/gist-data 返回 polymarket-data.json；xtracker-data.json 另存
          // 直接读 raw gist URL（Vercel 服务端代理调 github API，无问题）
        }
      } catch { /* ignore */ }

      // Raw xtracker Gist（GitHub Actions 写入）
      const GIST_URL = 'https://gist.githubusercontent.com/Adul9981/d174b4498c408076ff218e164f24807e/raw/xtracker-data.json';
      const gistRes = await fetch(GIST_URL + '?t=' + Date.now());
      if (gistRes.ok) {
        const gistData = await gistRes.json();
        if (gistData.success && gistData.data?.length > 0) {
          console.log('[xtracker] Gist fallback 成功');
          setTrackings(gistData.data.map((t: any) => ({
            ...t,
            // Preserve slug if API already set it correctly; re-derive only as fallback.
            // Strip query string (?via=...) so slug matches Gamma API event slug.
            slug: t.slug || t.marketLink?.split('/').pop()?.split('?')[0] || '',
          })));
          return;
        }
      }

      console.warn('[xtracker] 所有数据源均失败');
    } catch (err) {
      console.error('Failed to fetch tracker data:', err);
    } finally {
      setIsLoadingTracker(false);
    }
  };

  // ── Proactively fetch heatmap data so session panel works on page load ──────
  // Without this, the panel only populates after visiting the heatmap tab.
  const fetchHeatmapPanel = async () => {
    const CACHE_KEY = 'musk_tweet_heatmap_data';
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      const isRecent = cached.cachedAt && Date.now() - cached.cachedAt < 20 * 60 * 1000;
      if (isRecent && Array.isArray(cached.data) && cached.data.length > 0) {
        setHeatmapData(cached.data); // ensure state is in sync with localStorage
        return;
      }
      const res = await fetch('/api/elon-tweets', { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const result = await res.json();
        if (result.tweets?.length > 0) {
          const filtered = result.tweets.map((item: any) => ({
            date: item.date, hour: item.hour,
            count: Math.min(item.count, 25),
          }));
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            data: filtered, lastUpdated: result.lastUpdated, cachedAt: Date.now(),
          }));
          setHeatmapData(filtered);
          console.log(`[heatmap] Prefetched ${filtered.length} hourly records for session panel`);
        }
      }
    } catch { /* non-critical — session panel degrades gracefully */ }
  };

  const handleRefresh = async () => {
    await Promise.all([fetchMarketData(), fetchTrackerData()]);
  };

  useEffect(() => {
    fetchMarketData();
    fetchTrackerData();
    fetchGistHistory();
    fetchHeatmapPanel(); // proactively load heatmap so session panel shows on first visit

    const marketInterval = setInterval(fetchMarketData, 5 * 60 * 1000);
    const histInterval = setInterval(fetchGistHistory, 10 * 60 * 1000);
    const heatmapInterval = setInterval(fetchHeatmapPanel, 20 * 60 * 1000); // refresh every 20 min
    return () => {
      clearInterval(marketInterval);
      clearInterval(histInterval);
      clearInterval(heatmapInterval);
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

  const currentMarket = activeMarkets[selectedMarketIndex] || activeMarkets[0];

  // Match tracking by slug, then by end-date (more robust when slug formats differ).
  // Do NOT fall back to activeTrackings[0] — that would show wrong data for markets
  // that don't yet have xtracker coverage (e.g. future weeks).
  const currentTracking: Tracking | undefined = (() => {
    if (!currentMarket) return activeTrackings[0];
    // 1. Exact slug match
    const bySlug = activeTrackings.find(t => t.slug === currentMarket.slug);
    if (bySlug) return bySlug;
    // 2. End-date match (normalize both to YYYY-MM-DD)
    const mEnd = currentMarket.end_date?.split('T')[0];
    if (mEnd) {
      const byDate = activeTrackings.find(t => t.endDate?.split('T')[0] === mEnd);
      if (byDate) return byDate;
    }
    // 3. No xtracker data for this market yet → return undefined (UI shows '—')
    return undefined;
  })();

  useEffect(() => {
    if (currentTracking?.stats) {
      setCurrentTweetCount(currentTracking.stats.total);
    } else {
      // No xtracker data for this market yet — reset to avoid showing stale stats
      setCurrentTweetCount(0);
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

  // ── 时间加权 µ（按剩余小时活跃权重加权）─────────────────────────────────────
  const timeWeightedMu = useMemo(() => {
    if (R <= 0 || T <= 0) return mu;
    const nowBJ = new Date(Date.now() + 8 * 3600 * 1000);
    const bjHour = nowBJ.getUTCHours();
    const minFrac = (60 - nowBJ.getUTCMinutes()) / 60;
    let w = HOURLY_WEIGHTS_BJ[bjHour] * minFrac;
    const fullLeft = Math.max(0, Math.floor(T) - 1);
    for (let i = 1; i <= fullLeft; i++) w += HOURLY_WEIGHTS_BJ[(bjHour + i) % 24];
    return Math.round((C + R * w) * 10) / 10;
  }, [C, R, T, mu]);

  // ── 今日各小时推文数（从 heatmapData state 派生，响应式）————————————————————
  // Must be declared BEFORE sessionAnalysis which references it.
  const todayHourly = useMemo(() => {
    const todayBJ = new Date(Date.now() + 8 * 3600 * 1000).toISOString().split('T')[0];
    const result: Record<number, number> = {};
    for (const d of heatmapData) {
      if (d.date === todayBJ) result[d.hour] = d.count;
    }
    return result;
  }, [heatmapData]);

  const hasTodayData = Object.keys(todayHourly).length > 0;

  // ── 会话状态分析（核心：识别今日各会话现状，驱动µ修正和入场信号）────────────
  const sessionAnalysis = useMemo(() => {
    const h = getBJHourNow();
    // Use todayHourly from component state (reactive — populated on mount via fetchHeatmapPanel)
    const hasHeatmapData = Object.keys(todayHourly).length > 0;
    const states: SessionState[] = [];
    let totalMuAdjust = 0;

    for (const def of SESSION_DEFS) {
      const windowStart = def.bjHours[0];
      const windowEnd   = def.bjHours[def.bjHours.length - 1];
      const actual      = def.bjHours.reduce((s, x) => s + (todayHourly[x] || 0), 0);
      // 期望推文量 = 按当前pace缩放（pace / 历史日均 * 历史期望贡献）
      const paceScale   = R > 0 ? R / 43.4 : 1;
      const expected    = Math.round(def.expectedContrib * paceScale);

      let status: SessionStatus;
      let label = '';
      let muAdjust = 0;
      let isAnomaly = false;
      let anomalyDesc = '';
      let entrySignal: SessionState['entrySignal'] = null;

      if (h < windowStart) {
        // 窗口尚未开始
        status = 'upcoming';
        label  = `待开始（BJ ${windowStart}:00后）`;
        // 未来窗口按期望贡献计入（已含在base µ中，不修正）
        if (def.name === '深夜会话' && h >= 11 && h <= 12) {
          entrySignal = 'buy'; // 深夜窗口即将开始，买入信号
        }
        if (def.name === '上午会话' && h >= 20 && h <= 21) {
          entrySignal = 'buy';
        }

      } else if (h <= windowEnd) {
        // 窗口当前开放
        if (!hasHeatmapData || actual === 0) {
          status = 'pending'; // 窗口已开但还没数据/推文
          label  = `窗口已开 · 等待首推`;
          // 不确定，不修正
        } else if (actual >= def.strongThreshold) {
          status = 'strong';
          label  = `强势进行中 · 已发 ${actual} 条`;
          muAdjust = Math.round(def.avgTweets * 0.3); // 超强，上修
          entrySignal = 'hold'; // 高峰期，持仓为主
        } else if (actual <= def.weakThreshold) {
          status = 'weak';
          label  = `较弱 · 已发 ${actual} 条`;
          isAnomaly = true;
          anomalyDesc = `当前${actual}条，预期${expected}条，偏低 ${Math.round((1-actual/Math.max(expected,1))*100)}%`;
          muAdjust = -Math.round(def.avgTweets * 0.25);
        } else {
          status = 'ongoing';
          label  = `进行中 · 已发 ${actual} 条`;
          entrySignal = def.name === '深夜会话' ? 'hold' : null;
        }

      } else {
        // 窗口已过
        if (!hasHeatmapData) {
          status = 'upcoming'; label = '无今日数据';
        } else if (actual === 0) {
          // 完全缺席
          status = 'absent';
          label  = `缺席（0条）`;
          isAnomaly = def.freq >= 0.6; // 高频会话缺席才算异常
          if (isAnomaly) {
            anomalyDesc = `历史${Math.round(def.freq*100)}%的天会出现，今日缺席`;
            muAdjust = -Math.round(def.expectedContrib * paceScale);
          }
          entrySignal = def.name === '深夜会话' && actual === 0 ? 'wait' : null;
        } else if (actual >= def.strongThreshold) {
          status = 'strong';
          label  = `✓ 强势 · ${actual}条`;
          muAdjust = Math.round((actual - def.avgTweets) * 0.5);
        } else if (actual <= def.weakThreshold) {
          status = 'weak';
          label  = `✓ 偏弱 · ${actual}条`;
          isAnomaly = true;
          anomalyDesc = `实际${actual}条，历史中位${def.medTweets}条，偏低明显`;
          muAdjust = -Math.round((def.medTweets - actual) * 0.6);
        } else {
          status = 'confirmed';
          label  = `✓ 正常 · ${actual}条`;
          muAdjust = Math.round((actual - def.avgTweets) * 0.3);
        }
      }

      totalMuAdjust += muAdjust;
      states.push({ def, status, actual, label, muAdjust, isAnomaly, anomalyDesc, entrySignal });
    }

    // 综合入场信号：找最高优先级信号
    const buySignals  = states.filter(s => s.entrySignal === 'buy');
    const sellSignals = states.filter(s => s.entrySignal === 'sell');
    const anomalies   = states.filter(s => s.isAnomaly);

    // 主时机判断（覆盖会话状态）
    const m = new Date(Date.now() + 8 * 3600 * 1000).getUTCMinutes();
    let timing: { badge: string; desc: string; level: string; color: string };
    if (h === 12 && m <= 35)
      timing = { level:'BEST',   badge:'⭐⭐ 最佳建仓时机', color:'emerald', desc:'深夜会话窗口将在25min内开启，历史+150%跳跃即将发生' };
    else if (states.find(s => s.def.name==='深夜会话' && (s.status==='ongoing'||s.status==='strong')))
      timing = { level:'ACTIVE', badge:'🌙 深夜会话进行中', color:'violet',  desc:`全天最强会话（均值14条），µ正在上移，评估止盈时机` };
    else if (h === 21 && m <= 35)
      timing = { level:'GOOD',   badge:'⭐ 上午会话前建仓', color:'sky',    desc:'上午会话（64%频率）即将在BJ 22:00开启' };
    else if (states.find(s => s.def.name==='上午会话' && (s.status==='ongoing'||s.status==='strong')))
      timing = { level:'ACTIVE', badge:'🏙️ 上午会话进行中', color:'amber',  desc:'CDT 9-11am活跃期，第二强信号，注意是否接近结束' };
    else if (h >= 17 && h <= 19)
      timing = { level:'DEAD',   badge:'💤 睡眠沉默期',    color:'slate',   desc:'深夜会话已结束，Musk入睡，µ冻结，适合冷静评估/剪仓' };
    else if (h >= 8 && h <= 11)
      timing = { level:'LOW',    badge:'🔵 深夜前过渡期',  color:'slate',   desc:'傍晚结束→等待深夜，CDT 7-10pm低谷，等BJ 12:00' };
    else if (states.find(s => s.def.name==='傍晚会话' && (s.status==='ongoing'||s.status==='strong')))
      timing = { level:'WATCH',  badge:'🌆 傍晚会话进行中', color:'yellow', desc:'傍晚会话（51%频率），若出现则65%概率今晚有深夜会话' };
    else
      timing = { level:'NEUTRAL',badge:'🟡 过渡时段',      color:'yellow',  desc:'活跃度中等，等待下一个会话窗口' };

    return { states, totalMuAdjust, timing, buySignals, sellSignals, anomalies };
  }, [R, mu, todayHourly]); // eslint-disable-line react-hooks/exhaustive-deps

  // 会话修正后的µ
  const sessionAdjustedMu = Math.round(timeWeightedMu + sessionAnalysis.totalMuAdjust);
  // 向用户展示的「最佳µ估计」= 取时间加权µ与会话修正µ的中间值（避免过度修正）
  // 下限：不低于当前推文数（落点不可能低于已发数），且不为负
  const bestMu = Math.max(
    currentTweetCount,
    Math.round((timeWeightedMu + sessionAdjustedMu) / 2)
  );

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
  


  const handleSelectMarket = (index: number) => {
    setSelectedMarketIndex(index);
  };

  // ── Position management handlers ──────────────────────────────────────────
  const handleAddPosition = (pos: Position) => {
    setPositions(prev => [...prev, pos]);
  };

  const handleDeletePosition = (id: string) => {
    setPositions(prev => prev.filter(p => p.id !== id));
  };

  const rangeOptions = useMemo(() =>
    analysisData.map(r => ({
      range: r.range,
      currentPrice: r.price,
      modelProb: r.realProb,
      isCenter: r.isCenter ?? false,
    })),
  [analysisData]);

  // ── Telegram 预警 ──
  const telegramAlertInput = useMemo(() => ({
    mu,
    remainingDays: remainingDays + remainingHoursFromApi / 24,
    currentTweetCount,
    todayTotal: currentTracking?.stats?.todayTotal ?? 0,
    apiPace,
    analysisData: analysisData.map(r => ({
      range: r.range,
      price: r.price,
      realProb: r.realProb,
      isCenter: r.isCenter,
      parsed: r.parsed ?? null,
    })),
  }), [mu, remainingDays, remainingHoursFromApi, currentTweetCount, currentTracking, apiPace, analysisData]);

  const { config: telegramConfig, saveConfig: saveTelegramConfig } = useTelegramAlerts(
    telegramAlertInput
  );

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

  // Alert system removed

  return (
    <div className="min-h-screen bg-[#0d0f1e]">
      {/* ── Header ── */}
      <header className="bg-[#10122a]/98 backdrop-blur border-b border-slate-700/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-400/40 flex items-center justify-center">
                <Radio className="w-4 h-4 text-teal-400" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white tracking-wide">马斯克推文预测市场</h1>
                <p className="text-[10px] text-slate-500 tracking-widest uppercase">Musk Tweet Prediction</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded text-xs font-medium bg-teal-500/10 border border-teal-500/30 text-teal-400">
                {phase.name}
              </span>
              <div className="hidden lg:flex items-center gap-3 text-xs font-mono">
                {/* Live clock */}
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Clock className="w-3 h-3 text-teal-500" />
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
                className="flex items-center gap-1.5 px-3 py-1.5 bg-transparent hover:bg-slate-800 text-slate-500 hover:text-slate-300 text-xs font-medium rounded-lg border border-slate-700/50 transition-all"
              >
                <span>主页</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href={`https://polymarket.com/event/${currentMarket?.slug || ''}${REFERRAL}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg transition-all shadow-lg shadow-teal-500/20"
              >
                <span>进入市场</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ── Nav ── */}
      <nav className="bg-[#10122a] border-b border-slate-700/60">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-0 overflow-x-auto scrollbar-hide">
            {/* 核心功能（高亮） */}
            {[
              { id: 'market',   label: '市场概览',  icon: TrendingUp, primary: true },
              { id: 'analysis', label: '概率分析',  icon: BarChart3,  primary: true },
              { id: 'heatmap',  label: '发推热力图', icon: Grid3X3,   primary: true },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-teal-400 text-teal-300 bg-teal-500/8'
                    : 'border-transparent text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
            {/* 分隔线 */}
            <div className="w-px bg-slate-700/60 my-2 mx-1" />
            {/* 辅助功能（低调） */}
            {[
              { id: 'positions', label: '持仓管理', icon: Wallet },
              { id: 'tweet',     label: '推文生成', icon: FileText },
              { id: 'guide',     label: '策略指南', icon: BookOpen },
              { id: 'telegram',  label: '预警',     icon: Bell },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-1.5 px-3.5 py-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-slate-400 text-slate-200 bg-white/5'
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/4'
                }`}
              >
                <tab.icon className="w-3 h-3" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Alert Banners disabled */}

      <main className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'market' && (() => {
          // ── 精准度计算（基于剩余时间）──
          const totalRemainingH = remainingDays * 24 + remainingHoursFromApi;
          const accuracy =
            totalRemainingH >= 72 ? 45 :
            totalRemainingH >= 48 ? Math.round(45 + (72 - totalRemainingH) / 24 * 13) :
            totalRemainingH >= 24 ? Math.round(58 + (48 - totalRemainingH) / 24 * 14) :
            totalRemainingH >= 12 ? Math.round(72 + (24 - totalRemainingH) / 12 * 10) :
            totalRemainingH >= 6  ? Math.round(82 + (12 - totalRemainingH) / 6  * 6)  : 88;

          // ── 当前活跃窗口 ──
          const bjH = getBJHourNow();
          const activeWindow =
            bjH >= 12 && bjH < 16 ? { emoji: '🔥', label: '深夜爆发期', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' } :
            bjH >= 16 && bjH < 20 ? { emoji: '💤', label: '入睡低谷',   color: 'text-slate-400',  bg: 'bg-slate-800/60 border-slate-600/40' } :
            (bjH >= 20 || bjH < 4) ? { emoji: '⚡', label: '美国活跃期', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' } :
                                     { emoji: '📉', label: '傍晚低谷',   color: 'text-teal-400',   bg: 'bg-teal-500/8 border-teal-500/20' };

          // ── 区间信号（VR = realProb / price）──
          const rangeSignals = analysisData.map(r => {
            const vr = r.price > 0 ? r.realProb / r.price : 0;
            const noPrice = 100 - r.price; // NO价格（¢）
            return { ...r, vr, noPrice };
          }).filter(r => r.vr > 0).sort((a, b) => (a.parsed?.min || 0) - (b.parsed?.min || 0));

          // highValueSignals: 入场信号条已移除，待重新设计后恢复
          // const highValueSignals = rangeSignals.filter(r => r.vr >= 1.5 && r.price <= 20);

          // ── 彩票仓信号：YES ≤ 2¢，区间下沿在 µ 射程内（µ ~ µ+60），仍可到达 ──
          const lotterySignals = analysisData
            .map(r => {
              const yesPrice = r.price;           // YES price in ¢
              const rangeMin = r.parsed?.min ?? 9999;
              const rangeMax = r.parsed?.max ?? 9999;
              const shootDist = rangeMin - mu;    // 距µ的距离（条）
              const tweetsNeeded = Math.max(0, rangeMin - currentTweetCount);
              return { ...r, yesPrice, rangeMin, rangeMax, shootDist, tweetsNeeded };
            })
            .filter(r =>
              r.yesPrice > 0 &&
              r.yesPrice <= 2 &&                  // YES极低价（≤2¢）
              r.rangeMin > currentTweetCount &&    // 还没到达该区间
              r.shootDist >= 0 &&                  // 区间在µ上方或包含µ
              r.shootDist <= 60                    // 不超过µ+60条
            )
            .sort((a, b) => a.rangeMin - b.rangeMin);

          // ── 每日热力色块颜色（等高色块，深浅=强度）──
          const dailyData = currentTracking?.stats?.daily?.slice(-7) || [];
          const maxDaily = Math.max(...dailyData.map(d => d.count), 1);
          const heatBg = (count: number) => {
            const ratio = count / maxDaily;
            if (ratio >= 0.8) return 'bg-emerald-400';
            if (ratio >= 0.6) return 'bg-emerald-600';
            if (ratio >= 0.4) return 'bg-emerald-700/80';
            if (ratio >= 0.2) return 'bg-emerald-900/70';
            return 'bg-slate-800/60';
          };
          const heatText = (count: number) => {
            const ratio = count / maxDaily;
            return ratio >= 0.6 ? 'text-white' : ratio >= 0.3 ? 'text-emerald-200' : 'text-slate-400';
          };

          // ── 市场标签日期格式：从 slug 提取计数周期日期（比 start_date 准确）──
          // slug 格式: elon-musk-of-tweets-{month}-{day}-{month}-{day}
          const SLUG_MONTH: Record<string, number> = {
            january:1, february:2, march:3, april:4, may:5, june:6,
            july:7, august:8, september:9, october:10, november:11, december:12
          };
          const marketTabLabel = (market: typeof activeMarkets[0]) => {
            const m = market.slug.match(/tweets-(\w+)-(\d+)-(\w+)-(\d+)$/);
            if (m) {
              const sm = SLUG_MONTH[m[1]]; const sd = parseInt(m[2]);
              const em = SLUG_MONTH[m[3]]; const ed = parseInt(m[4]);
              if (sm && em) return `${sm}月${sd}日–${em}月${ed}日`;
            }
            try {
              const s = new Date(market.start_date);
              const e = new Date(market.end_date);
              return `${s.getUTCMonth()+1}月${s.getUTCDate()}日–${e.getUTCMonth()+1}月${e.getUTCDate()}日`;
            } catch { return parseMarketTitle(market.title); }
          };

          return (
          <div className="space-y-4">
            {/* ── 顶部：市场切换标签 ── */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500 font-mono">BJ {bjH}:00</div>
              <div className="flex gap-1.5 flex-wrap justify-end">
                {activeMarkets.map((market, i) => (
                  <button
                    key={market.slug}
                    onClick={() => handleSelectMarket(i)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      i === selectedMarketIndex
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    }`}
                  >
                    {marketTabLabel(market)}
                  </button>
                ))}
              </div>
            </div>

            {/* ── 第一行：4个核心数字 ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-[#141414] border border-slate-700/40 rounded-2xl p-4 text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">推文数</p>
                <p className="text-3xl font-bold text-white font-mono">{currentTracking?.stats?.total ?? '—'}</p>
                <p className="text-xs text-slate-500 mt-1">条</p>
              </div>
              <div className="bg-[#141414] border border-slate-700/40 rounded-2xl p-4 text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">时速</p>
                <p className="text-3xl font-bold text-white font-mono">{currentTracking?.stats?.pace ?? '—'}</p>
                <p className="text-xs text-slate-500 mt-1">条/天</p>
              </div>
              <div className="bg-[#141414] border border-slate-700/40 rounded-2xl p-4 text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">剩余时间</p>
                <p className="text-3xl font-bold text-white font-mono">
                  {currentTracking?.stats ? (
                    remainingDays > 0
                      ? `${remainingDays}d`
                      : `${remainingHoursFromApi}h`
                  ) : '—'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {currentTracking?.stats && remainingDays > 0 && remainingHoursFromApi > 0
                    ? `${remainingHoursFromApi}h`
                    : ''}
                </p>
              </div>
              <div className={`rounded-2xl p-4 text-center border ${activeWindow.bg}`}>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">当前窗口</p>
                <p className="text-2xl font-bold">{activeWindow.emoji}</p>
                <p className={`text-xs font-semibold mt-1 ${activeWindow.color}`}>{activeWindow.label}</p>
              </div>
            </div>

            {/* ── 第二行：预测落点 + 精准度 ── */}
            <div className="bg-[#141414] border border-emerald-900/30 rounded-2xl p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">预测落点</p>
                <p className="text-4xl font-bold text-emerald-300 font-mono">~{predictedCenter}</p>
                <p className="text-xs text-slate-400 mt-1">条 · 日均 <span className="text-white font-mono">{apiPace.toFixed(1)}</span> 条/天</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 mb-1">预测精准度</p>
                <p className="text-4xl font-bold text-white font-mono">{accuracy}%</p>
                <p className="text-xs text-slate-400 mt-1">
                  {totalRemainingH >= 24
                    ? `距到期 ${remainingDays}d ${remainingHoursFromApi}h`
                    : `距到期 ${totalRemainingH}h`}
                </p>
              </div>
              <div className="hidden md:flex flex-col items-end gap-1">
                <a
                  href={`https://polymarket.com/event/${currentMarket?.slug || ''}${REFERRAL}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition-all"
                >
                  查看市场 <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  onClick={handleRefresh}
                  disabled={isLoadingGist || isLoadingTracker}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition-all disabled:opacity-40"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingGist || isLoadingTracker ? 'animate-spin' : ''}`} />
                  {isLoadingGist || isLoadingTracker ? '刷新中...' : '刷新'}
                </button>
              </div>
            </div>

            {/* ── 第三行：左=每日热力色块，右=区间定价 ── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* 左：每日热力色块 */}
              <div className="lg:col-span-2 bg-[#141414] border border-slate-700/40 rounded-2xl p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">本期每日发推</p>
                {dailyData.length > 0 ? (
                  <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${dailyData.length}, 1fr)` }}>
                    {dailyData.map((day, i) => {
                      const d = new Date(day.date + 'T00:00:00Z');
                      return (
                        <div
                          key={day.date || i}
                          className={`rounded-xl p-2 text-center transition-all ${heatBg(day.count)}`}
                          title={`${day.date} · ${day.count}条`}
                        >
                          <p className={`text-base font-bold font-mono leading-tight ${heatText(day.count)}`}>{day.count}</p>
                          <p className={`text-[9px] mt-1 ${heatText(day.count)} opacity-70`}>
                            {d.getUTCMonth()+1}/{d.getUTCDate()}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 text-center py-4">暂无本期每日数据</p>
                )}
              </div>

              {/* 右：区间定价 + VR + 盈亏比 */}
              <div className="lg:col-span-3 bg-[#141414] border border-slate-700/40 rounded-2xl p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">区间定价</p>
                {rangeSignals.length === 0 && (
                  <div className="flex items-center gap-2 py-4 px-2">
                    <span className="text-slate-600 text-xs">暂无区间数据 · 刷新或选择其他市场</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  {rangeSignals.slice(0, 6).map(r => {
                    const vrStars = r.vr >= 2.0 ? '⭐⭐' : r.vr >= 1.5 ? '⭐' : '';
                    const payoff = r.price > 0 ? (100 / r.price).toFixed(1) : '—';
                    const isHigh = r.vr >= 1.5 && r.price <= 20;
                    return (
                      <div
                        key={r.range}
                        className={`flex items-center justify-between rounded-xl px-3 py-2 border ${
                          r.isCenter
                            ? 'bg-emerald-500/8 border-emerald-500/30'
                            : isHigh
                            ? 'bg-amber-500/8 border-amber-500/25'
                            : 'bg-slate-800/30 border-slate-700/30'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-sm font-semibold ${r.isCenter ? 'text-emerald-300' : 'text-slate-200'}`}>
                            {r.range}
                          </span>
                          {r.isCenter && <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded font-bold">CENTER</span>}
                          {vrStars && <span className="text-xs">{vrStars}</span>}
                        </div>
                        <div className="flex items-center gap-3 text-right">
                          <div className="text-center">
                            <p className="text-[10px] text-slate-500">价格</p>
                            <p className="text-sm font-mono font-bold text-white">{r.price.toFixed(0)}¢</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-slate-500">VR</p>
                            <p className={`text-sm font-mono font-bold ${r.vr >= 1.5 ? 'text-emerald-400' : r.vr >= 1.0 ? 'text-slate-300' : 'text-rose-400'}`}>
                              {r.vr.toFixed(2)}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-slate-500">盈亏比</p>
                            <p className="text-sm font-mono font-bold text-amber-300">{payoff}x</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── 入场信号卡片 ── */}
            {(() => {
              // 阶段判断
              const isEndgame  = totalRemainingH <= 36;   // 最后1.5天
              const isMain     = totalRemainingH > 36 && totalRemainingH <= 48; // 第1–2天主力
              const isLight    = totalRemainingH > 48 && totalRemainingH <= 72; // 第3天轻仓
              const tooEarly   = totalRemainingH > 72;
              const tooLate    = totalRemainingH < 6 && !isEndgame;
              if (tooEarly || tooLate) return null;

              // 时段简单描述
              const timeLabel =
                bjH >= 11 && bjH < 17 ? { emoji:'🔥', text:'现在是马斯克最活跃的时段，价格变动快' } :
                bjH >= 17 && bjH < 20 ? { emoji:'😴', text:'马斯克通常已入睡，发推很少，适合冷静评估' } :
                bjH >= 20             ? { emoji:'⚡', text:'美国上午开始，马斯克可能重新活跃' } :
                bjH < 6               ? { emoji:'📈', text:'美国下午，发推稳定' } :
                                        { emoji:'💤', text:'发推偏少时段，等待即可' };

              // 中心落点仓：µ落在哪个区间就选哪个
              const centerRange = rangeSignals.find(r =>
                (r.parsed?.min ?? 0) <= mu && mu <= (r.parsed?.max ?? 0)
              ) ?? (rangeSignals.length > 0
                ? rangeSignals.reduce((a, b) =>
                    Math.abs(((a.parsed?.min??0)+(a.parsed?.max??0))/2 - mu) <
                    Math.abs(((b.parsed?.min??0)+(b.parsed?.max??0))/2 - mu) ? a : b)
                : null);

              // 保护仓：中心区间上方1档 + 下方1档
              const centerMin = centerRange?.parsed?.min ?? 0;
              const centerMax = centerRange?.parsed?.max ?? 0;
              const protectBelow = centerRange
                ? rangeSignals.find(r => (r.parsed?.max ?? 0) < centerMin)
                : null;
              const protectAbove = centerRange
                ? rangeSignals.find(r => (r.parsed?.min ?? 0) > centerMax)
                : null;

              // 期末NO埋伏候选（NO价格≤15¢，距区间上沿≥20条）
              const noAmbush = isEndgame ? rangeSignals.filter(r => {
                const noP = r.noPrice;
                const distToTop = (r.parsed?.max ?? 0) - currentTweetCount;
                return noP > 0 && noP <= 15 && distToTop >= 20 && distToTop <= 80;
              }) : [];

              // YES联动候选（距上沿≤15条，YES价格≤15¢）
              const yesSwing = isEndgame ? rangeSignals.filter(r => {
                const distToTop = (r.parsed?.max ?? 0) - currentTweetCount;
                return r.price > 0 && r.price <= 15 && distToTop >= 0 && distToTop <= 15;
              }) : [];

              const phaseLabel = isEndgame
                ? { emoji:'🔴', title:'最后1.5天 · 博弈高倍价差', color:'text-rose-400', border:'border-rose-500/30', bg:'bg-rose-500/6' }
                : isMain
                ? { emoji:'🟢', title:'主力建仓窗口（第1–2天）', color:'text-emerald-400', border:'border-emerald-500/30', bg:'bg-emerald-500/6' }
                : { emoji:'🟡', title:'轻仓布局（第3天）', color:'text-amber-400', border:'border-amber-500/30', bg:'bg-amber-500/6' };

              return (
                <div className={`rounded-2xl p-4 border ${phaseLabel.border} ${phaseLabel.bg} space-y-3`}>
                  {/* 标题 + 时段 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{phaseLabel.emoji}</span>
                      <span className={`text-xs font-bold ${phaseLabel.color}`}>{phaseLabel.title}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">{timeLabel.emoji} {timeLabel.text}</span>
                  </div>

                  {/* 普通建仓阶段：中心仓 + 保护仓 */}
                  {!isEndgame && (
                    <div className="space-y-2">
                      {centerRange ? (
                        <>
                          {/* 保护仓上方 */}
                          {protectAbove && (
                            <div className="flex items-center justify-between rounded-xl bg-slate-800/40 px-3 py-2 border border-slate-700/30">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500">🛡️ 保护仓↑</span>
                                <span className="font-mono text-sm font-bold text-slate-300">{protectAbove.range}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-slate-400">YES {protectAbove.price.toFixed(0)}¢</span>
                                <span className={`text-xs font-bold font-mono ${protectAbove.vr >= 1.0 ? 'text-emerald-400' : 'text-slate-500'}`}>VR {protectAbove.vr.toFixed(2)}</span>
                                <span className="text-[10px] text-slate-500">{isLight ? '$30–50' : '$50–70'}</span>
                              </div>
                            </div>
                          )}
                          {/* 中心落点仓 */}
                          <div className="flex items-center justify-between rounded-xl bg-slate-900/60 px-3 py-2 border border-emerald-700/30">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-emerald-500">🎯 中心落点仓</span>
                              <span className="font-mono text-sm font-bold text-white">{centerRange.range}</span>
                              <span className="text-[10px] text-slate-500">µ≈{Math.round(mu)}条</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-slate-300">YES {centerRange.price.toFixed(0)}¢</span>
                              <span className={`text-xs font-bold font-mono ${centerRange.vr >= 1.5 ? 'text-emerald-400' : centerRange.vr >= 1.0 ? 'text-amber-400' : 'text-slate-500'}`}>VR {centerRange.vr.toFixed(2)}</span>
                              <span className="text-[10px] text-slate-500">{isLight ? '$80–130' : '$170–210'}</span>
                            </div>
                          </div>
                          {/* 保护仓下方 */}
                          {protectBelow && (
                            <div className="flex items-center justify-between rounded-xl bg-slate-800/40 px-3 py-2 border border-slate-700/30">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500">🛡️ 保护仓↓</span>
                                <span className="font-mono text-sm font-bold text-slate-300">{protectBelow.range}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-slate-400">YES {protectBelow.price.toFixed(0)}¢</span>
                                <span className={`text-xs font-bold font-mono ${protectBelow.vr >= 1.0 ? 'text-emerald-400' : 'text-slate-500'}`}>VR {protectBelow.vr.toFixed(2)}</span>
                                <span className="text-[10px] text-slate-500">{isLight ? '$30–50' : '$50–70'}</span>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-slate-500 px-1">暂无µ对应区间数据</p>
                      )}
                    </div>
                  )}

                  {/* 期末博弈阶段 */}
                  {isEndgame && (
                    <div className="space-y-2">
                      {noAmbush.length > 0 && (
                        <div>
                          <p className="text-[10px] text-rose-400 font-semibold mb-1.5">NO埋伏机会 · 目标10¢→100¢</p>
                          {noAmbush.map(r => (
                            <div key={r.range} className="flex items-center justify-between rounded-xl bg-slate-900/50 px-3 py-2 mb-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-bold text-white">{r.range}</span>
                                <span className="text-[10px] text-slate-500">距上沿 {(r.parsed?.max ?? 0) - currentTweetCount}条</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-300">NO <span className="text-rose-300 font-bold font-mono">{r.noPrice.toFixed(0)}¢</span></span>
                                <span className="text-xs text-amber-300 font-mono font-bold">最高 {r.noPrice > 0 ? Math.round(100/r.noPrice) : 0}x</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {yesSwing.length > 0 && (
                        <div>
                          <p className="text-[10px] text-emerald-400 font-semibold mb-1.5">YES联动机会 · 目标20¢→80¢</p>
                          {yesSwing.map(r => (
                            <div key={r.range} className="flex items-center justify-between rounded-xl bg-slate-900/50 px-3 py-2 mb-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-bold text-white">{r.range}</span>
                                <span className="text-[10px] text-slate-500">距上沿 {(r.parsed?.max ?? 0) - currentTweetCount}条</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-300">YES <span className="text-emerald-300 font-bold font-mono">{r.price.toFixed(0)}¢</span></span>
                                <span className="text-xs text-amber-300 font-mono font-bold">最高 {r.price > 0 ? Math.round(100/r.price) : 0}x</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {noAmbush.length === 0 && yesSwing.length === 0 && (
                        <p className="text-xs text-slate-500 px-1">暂无符合条件的期末博弈机会，持续观察中</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── 彩票仓提示（YES ≤ 2¢ 且在µ射程内）── */}
            {lotterySignals.length > 0 && (
              <div className="bg-violet-500/8 border border-violet-500/30 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">🎰</span>
                  <p className="text-xs font-semibold text-violet-300">彩票仓机会</p>
                  <span className="text-[10px] text-slate-500 ml-auto">YES ≤ 2¢ · µ射程内 · 建议 ≤ $50</span>
                </div>
                <div className="space-y-2">
                  {lotterySignals.map(r => {
                    const payoffX = r.yesPrice > 0 ? Math.round(100 / r.yesPrice) : 0;
                    return (
                      <div key={r.range} className="flex items-center justify-between rounded-xl bg-slate-900/50 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-violet-200">{r.range}</span>
                          <span className="text-[10px] text-slate-500">还需 +{r.tweetsNeeded}条</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-mono text-violet-300 font-bold">{r.yesPrice.toFixed(1)}¢</span>
                          <span className="text-amber-300 font-bold font-mono">
                            最高 {payoffX}x
                          </span>
                          <span className="text-[10px] text-slate-500 bg-violet-900/30 px-2 py-0.5 rounded-lg border border-violet-700/30">
                            彩票仓 ≤$50
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-600 mt-2 leading-relaxed">
                  ⚠️ 高风险 · 极低成本 · 仅在确信今日节奏活跃时布局 · 最坏归零不影响主仓
                </p>
              </div>
            )}

            {/* ── 节奏面板（活跃时段 + 落点影响）── */}
            {(() => {
              const todayH  = todayHourly;
              const paceScale   = R > 0 ? R / 43.4 : 1;
              const t = sessionAnalysis.timing;

              const SEGS = [
                { label:'00–04', hours:[0,1,2,3],    level:'medium', zh:'美国下午' },
                { label:'04–08', hours:[4,5,6,7],    level:'low',    zh:'美国傍晚' },
                { label:'08–12', hours:[8,9,10,11],  level:'low',    zh:'美国晚上' },
                { label:'12–16', hours:[12,13,14,15],level:'peak',   zh:'深夜⭐' },
                { label:'16–20', hours:[16,17,18,19],level:'sleep',  zh:'入睡💤' },
                { label:'20–24', hours:[20,21,22,23],level:'medium', zh:'美国上午' },
              ] as const;

              const impactLines: { icon:string; text:string; color:string }[] = [];
              for (const s of sessionAnalysis.states) {
                if (s.status === 'absent' && s.def.freq >= 0.6) {
                  impactLines.push({ icon:'⚠️', color:'text-rose-300',
                    text:`${s.def.name}今日缺席，落点预计下移约 ${Math.round(s.def.expectedContrib * paceScale)} 条` });
                } else if (s.status === 'weak' && s.isAnomaly) {
                  impactLines.push({ icon:'🔻', color:'text-amber-300',
                    text:`${s.def.name}偏弱（今日${s.actual}条），落点可能小幅偏低` });
                } else if (s.status === 'strong' && s.muAdjust > 2) {
                  impactLines.push({ icon:'📈', color:'text-emerald-300',
                    text:`${s.def.name}强势（今日${s.actual}条），落点预计上移约 ${s.muAdjust} 条` });
                }
              }
              const upcomingNight = sessionAnalysis.states.find(s => s.def.name==='深夜会话' && s.status==='upcoming');
              const ongoingNight  = sessionAnalysis.states.find(s => s.def.name==='深夜会话' && (s.status==='ongoing'||s.status==='strong'||s.status==='pending'));
              if (upcomingNight) {
                const hoursLeft = Math.max(0, 13 - bjH);
                impactLines.push({ icon:'⏳', color:'text-teal-300',
                  text:`深夜爆发时段（BJ 13–16）约 ${hoursLeft} 小时后开始，是落点最大变量（历史均值 +14 条）` });
              } else if (ongoingNight) {
                impactLines.push({ icon:'🌙', color:'text-teal-300',
                  text:'深夜时段进行中（全天最高），µ正在上移，注意评估止盈' });
              }
              if (impactLines.length === 0) {
                impactLines.push({ icon:'✅', color:'text-slate-400',
                  text:`今日节奏正常，落点预测约 ${bestMu} 条` });
              }

              const timingBg =
                t.level==='BEST'   ? 'bg-emerald-500/10 border-emerald-500/35' :
                t.level==='GOOD'   ? 'bg-teal-500/10 border-teal-500/35' :
                t.level==='ACTIVE' ? 'bg-teal-500/10 border-teal-500/35' :
                t.level==='DEAD'   ? 'bg-slate-900/60 border-slate-600/50' :
                t.level==='WATCH'  ? 'bg-yellow-500/8 border-yellow-500/25' :
                                     'bg-slate-800/40 border-slate-700/40';
              const timingText =
                t.level==='BEST'   ? 'text-emerald-300' :
                t.level==='GOOD'   ? 'text-teal-300' :
                t.level==='ACTIVE' ? 'text-teal-300' :
                t.level==='DEAD'   ? 'text-slate-500' :
                t.level==='WATCH'  ? 'text-yellow-300' :
                                     'text-slate-300';

              return (
                <div className="space-y-4">
                  {/* 节奏面板 */}
                  <section className="bg-[#141414] rounded-2xl p-5 border border-slate-700/40 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-slate-300">📊 今日节奏 & 落点影响</h2>
                      <span className="text-xs text-slate-500 font-mono">BJ {bjH}:00 · 206天数据</span>
                    </div>

                    {/* 当前状态 + 落点 */}
                    <div className={`rounded-xl p-4 border ${timingBg}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className={`text-base font-bold leading-snug ${timingText}`}>{t.badge}</p>
                          <p className="text-sm text-slate-300 mt-1 leading-relaxed">{t.desc}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-3xl font-bold text-emerald-300 font-mono">{bestMu}</p>
                          <p className="text-xs text-slate-400 mt-0.5">落点预测</p>
                        </div>
                      </div>
                    </div>

                    {/* 24h 时间轴 */}
                    <div className="grid grid-cols-6 gap-1.5">
                      {SEGS.map(seg => {
                        const hours     = seg.hours as readonly number[];
                        const isCurrent = hours.includes(bjH);
                        const isPast    = hours[hours.length - 1] < bjH;
                        const actual    = hours.reduce((s, hh) => s + (todayH[hh] || 0), 0);
                        const actEmoji =
                          seg.level==='peak'  ? '🔥' :
                          seg.level==='sleep' ? '💤' :
                          seg.level==='medium'? '📢' : '🔵';
                        const cardBg =
                          isCurrent
                            ? 'bg-teal-500/15 border-teal-500/40'
                            : seg.level==='peak'
                            ? 'bg-teal-500/10 border-teal-500/25'
                            : seg.level==='sleep'
                            ? 'bg-slate-900/50 border-slate-700/20'
                            : 'bg-slate-800/40 border-slate-700/20';
                        return (
                          <div key={seg.label} className={`rounded-xl p-2.5 text-center border ${cardBg}`}>
                            <p className={`text-xs font-bold font-mono mb-1 ${isCurrent ? 'text-teal-300' : seg.level==='peak' ? 'text-teal-300' : 'text-slate-300'}`}>
                              {isCurrent && <span className="mr-0.5">▶</span>}{seg.label}
                            </p>
                            <p className="text-lg leading-none mb-1.5">{actEmoji}</p>
                            {isPast && hasTodayData ? (
                              <p className="text-sm font-mono font-bold text-slate-100">{actual}条</p>
                            ) : isCurrent ? (
                              <p className="text-xs font-semibold text-teal-400">进行中</p>
                            ) : (
                              <p className={`text-xs font-medium ${seg.level==='peak' ? 'text-teal-300' : seg.level==='sleep' ? 'text-slate-500' : 'text-slate-400'}`}>
                                {seg.level==='peak' ? '预计爆发' : seg.level==='sleep' ? '入睡' : '预计中等'}
                              </p>
                            )}
                            <p className="text-xs text-slate-400 mt-1.5 leading-tight">{seg.zh}</p>
                          </div>
                        );
                      })}
                    </div>

                    {/* 落点影响白话 */}
                    <div className="rounded-xl p-3 border border-slate-700/40 bg-slate-800/20 space-y-2">
                      <p className="text-xs font-semibold text-slate-400">📌 对本期落点的影响</p>
                      {impactLines.map((l, i) => (
                        <p key={i} className={`text-sm leading-relaxed ${l.color}`}>
                          {l.icon}  {l.text}
                        </p>
                      ))}
                    </div>
                  </section>

                  {/* 热力图（今日发推 24h）*/}
                  {hasTodayData && (
                    <section className="bg-[#141414] rounded-2xl p-5 border border-slate-700/40">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-slate-300">今日发推热力图</h2>
                        <span className="text-xs text-slate-500">北京时间 · 每小时实际条数 vs 历史基线</span>
                      </div>
                      <div className="flex items-end gap-1 h-28">
                        {Array.from({ length: 24 }, (_, h) => {
                          const actual   = todayH[h] || 0;
                          const baseline = Math.round(HOURLY_WEIGHTS_BJ[h] * 43.4 * 10) / 10;
                          const maxVal   = 6;
                          const actH     = Math.round((actual / maxVal) * 100);
                          const baseH    = Math.round((baseline / maxVal) * 100);
                          const isCurr   = h === bjH;
                          const isPastH  = h < bjH;
                          return (
                            <div key={h} className="flex-1 flex flex-col items-center gap-0.5" title={`BJ ${h}:00 · 实际${actual}条 · 基线${baseline}条`}>
                              <div className="w-full flex flex-col justify-end gap-px" style={{ height: '96px' }}>
                                <div className="relative w-full flex flex-col justify-end" style={{ height: '96px' }}>
                                  <div
                                    className={`w-full rounded-t-sm ${isCurr ? 'bg-teal-500/40' : 'bg-slate-700/50'}`}
                                    style={{ height: `${Math.min(100, baseH)}%` }}
                                  />
                                  {isPastH && actual > 0 && (
                                    <div
                                      className={`absolute bottom-0 w-full rounded-t-sm ${
                                        actual >= baseline * 1.4 ? 'bg-teal-500' :
                                        actual >= baseline * 0.6 ? 'bg-teal-500' : 'bg-rose-500/70'
                                      }`}
                                      style={{ height: `${Math.min(100, actH)}%` }}
                                    />
                                  )}
                                </div>
                              </div>
                              <p className={`text-xs font-mono ${isCurr ? 'text-teal-400' : 'text-slate-400'}`}>
                                {h === 0 || h % 4 === 0 ? h : ''}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-teal-500 inline-block"/>实际（正常）</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-500/70 inline-block"/>实际（偏低）</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-700/50 inline-block"/>历史基线</span>
                      </div>
                    </section>
                  )}
                </div>
              );
            })()}
          </div>
          );
        })()}

        {activeTab === 'analysis' && (
          <div className="space-y-6">
            {!currentMarket || analysisData.length === 0 ? (
              <div className="bg-[#13152e] rounded-2xl p-8 border border-slate-700/50 text-center">
                <p className="text-slate-500">暂无市场数据，请先选择一个活跃市场</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                {/* ── 马斯克节奏面板 v3 已移除（首页已有）── */}
                {false && (() => {
                  const bjH     = getBJHourNow();
                  const todayH  = todayHourly; // reactive — from heatmapData state
                  const paceScale   = R > 0 ? R / 43.4 : 1;
                  const t = sessionAnalysis.timing;

                  // 24h 时段定义 —— 每格告诉用户「这段时间马斯克在干嘛」
                  const SEGS = [
                    { label:'00–04', hours:[0,1,2,3],    level:'medium', zh:'美国下午\n稳定活跃' },
                    { label:'04–08', hours:[4,5,6,7],    level:'low',    zh:'美国傍晚\n偏低' },
                    { label:'08–12', hours:[8,9,10,11],  level:'low',    zh:'美国晚上\n低谷' },
                    { label:'12–16', hours:[12,13,14,15],level:'peak',   zh:'美国深夜\n全天最强⭐' },
                    { label:'16–20', hours:[16,17,18,19],level:'sleep',  zh:'Musk入睡\n全天最低💤' },
                    { label:'20–24', hours:[20,21,22,23],level:'medium', zh:'美国上午\n回暖' },
                  ] as const;

                  // 白话落点影响条目
                  const impactLines: { icon:string; text:string; color:string }[] = [];
                  for (const s of sessionAnalysis.states) {
                    if (s.status === 'absent' && s.def.freq >= 0.6) {
                      impactLines.push({ icon:'⚠️', color:'text-rose-300',
                        text:`${s.def.name}今日缺席（历史${Math.round(s.def.freq*100)}%天出现），落点预计下移约 ${Math.round(s.def.expectedContrib * paceScale)} 条` });
                    } else if (s.status === 'weak' && s.isAnomaly) {
                      impactLines.push({ icon:'🔻', color:'text-amber-300',
                        text:`${s.def.name}偏弱（今日${s.actual}条，历史均值${s.def.avgTweets}条），落点可能小幅偏低` });
                    } else if ((s.status === 'strong') && s.muAdjust > 2) {
                      impactLines.push({ icon:'📈', color:'text-emerald-300',
                        text:`${s.def.name}强势（今日${s.actual}条），落点预计上移约 ${s.muAdjust} 条` });
                    }
                  }
                  const upcomingNight = sessionAnalysis.states.find(s => s.def.name==='深夜会话' && s.status==='upcoming');
                  const ongoingNight  = sessionAnalysis.states.find(s => s.def.name==='深夜会话' && (s.status==='ongoing'||s.status==='strong'||s.status==='pending'));
                  if (upcomingNight) {
                    const hoursLeft = Math.max(0, 13 - bjH);
                    impactLines.push({ icon:'⏳', color:'text-teal-300',
                      text:`深夜爆发时段（BJ 13–16）约 ${hoursLeft} 小时后开始，是今日落点的最大变量（历史均值 +14 条）` });
                  } else if (ongoingNight) {
                    impactLines.push({ icon:'🌙', color:'text-teal-300',
                      text:'深夜爆发时段正在进行中，µ正在上移，注意评估止盈时机' });
                  }
                  if (impactLines.length === 0) {
                    impactLines.push({ icon:'✅', color:'text-slate-400',
                      text:`今日节奏正常，各时段无异常，落点预测约 ${bestMu} 条` });
                  }

                  const timingBg =
                    t.level==='BEST'   ? 'bg-emerald-500/10 border-emerald-500/35' :
                    t.level==='GOOD'   ? 'bg-teal-500/10 border-teal-500/35' :
                    t.level==='ACTIVE' ? 'bg-teal-500/10 border-teal-500/35' :
                    t.level==='DEAD'   ? 'bg-slate-900/60 border-slate-600/50' :
                    t.level==='WATCH'  ? 'bg-yellow-500/8 border-yellow-500/25' :
                                         'bg-slate-800/40 border-slate-700/40';
                  const timingText =
                    t.level==='BEST'   ? 'text-emerald-300' :
                    t.level==='GOOD'   ? 'text-teal-300' :
                    t.level==='ACTIVE' ? 'text-teal-300' :
                    t.level==='DEAD'   ? 'text-slate-500' :
                    t.level==='WATCH'  ? 'text-yellow-300' :
                                         'text-slate-300';

                  return (
                    <section className="bg-[#13152e] rounded-2xl p-6 border border-slate-700/60 space-y-5">
                      {/* 标题 */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/25 flex items-center justify-center">
                          <span className="text-xl">🕐</span>
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold text-white">马斯克节奏 & 落点影响</h2>
                          <p className="text-xs text-slate-400">北京时间 {bjH}:00 · 基于206天历史数据</p>
                        </div>
                      </div>

                      {/* ① 当前状态 + 落点预测 */}
                      <div className={`rounded-xl p-4 border ${timingBg}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-400 mb-1">当前马斯克状态</p>
                            <p className={`text-lg font-bold leading-snug ${timingText}`}>{t.badge}</p>
                            <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">{t.desc}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-3xl font-bold text-emerald-300 font-mono">{bestMu}</p>
                            <p className="text-xs text-slate-400 mt-0.5">本期落点预测（条）</p>
                            {Math.abs(bestMu - Math.round(mu)) >= 3 && (
                              <p className={`text-xs mt-0.5 ${bestMu > mu ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {bestMu > mu ? '↑' : '↓'} 比简单预测{bestMu > mu ? '高' : '低'} {Math.abs(bestMu - Math.round(mu))} 条
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ② 24h 时间轴 */}
                      <div>
                        <p className="text-xs text-slate-400 mb-2.5">今日24小时活跃规律（北京时间）</p>
                        <div className="grid grid-cols-6 gap-1.5">
                          {SEGS.map(seg => {
                            const hours     = seg.hours as readonly number[];
                            const isCurrent = hours.includes(bjH);
                            const isPast    = hours[hours.length - 1] < bjH;
                            const actual    = hours.reduce((s, hh) => s + (todayH[hh] || 0), 0);

                            const actEmoji =
                              seg.level === 'peak'   ? '🔥' :
                              seg.level === 'sleep'  ? '💤' :
                              seg.level === 'medium' ? '📢' : '🔵';

                            const cardBg =
                              isCurrent
                                ? 'bg-teal-500/15 border-teal-500/40'
                                : seg.level === 'peak'
                                ? 'bg-teal-500/10 border-teal-500/25'
                                : seg.level === 'sleep'
                                ? 'bg-slate-900/50 border-slate-700/20'
                                : 'bg-slate-800/40 border-slate-700/20';

                            const zhLines = seg.zh.split('\n');

                            return (
                              <div key={seg.label} className={`rounded-xl p-2.5 text-center border ${cardBg}`}>
                                <p className={`text-xs font-bold font-mono mb-1 ${isCurrent ? 'text-teal-300' : seg.level === 'peak' ? 'text-teal-300' : 'text-slate-300'}`}>
                                  {isCurrent && <span className="mr-0.5">▶</span>}{seg.label}
                                </p>
                                <p className="text-lg leading-none mb-1.5">{actEmoji}</p>
                                {/* 今日数据行 */}
                                {isPast && hasTodayData ? (
                                  <p className="text-sm font-mono font-bold text-slate-100">{actual}条</p>
                                ) : isCurrent ? (
                                  <p className="text-xs font-semibold text-teal-400">进行中</p>
                                ) : (
                                  <p className={`text-xs font-medium ${seg.level==='peak' ? 'text-teal-300' : seg.level==='sleep' ? 'text-slate-500' : 'text-slate-400'}`}>
                                    {seg.level==='peak' ? '预计爆发' : seg.level==='sleep' ? '入睡' : '预计中等'}
                                  </p>
                                )}
                                <p className="text-xs text-slate-400 mt-1.5 leading-tight">{zhLines[0]}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* ③ 落点影响白话文 */}
                      <div className="rounded-xl p-4 border border-slate-700/40 bg-slate-800/30 space-y-2.5">
                        <p className="text-xs font-semibold text-slate-300">📌 对本期落点的影响</p>
                        {impactLines.map((l, i) => (
                          <p key={i} className={`text-sm leading-relaxed ${l.color}`}>
                            {l.icon}  {l.text}
                          </p>
                        ))}
                      </div>
                    </section>
                  );
                })()}

                <section className="bg-[#13152e] rounded-2xl p-5 border border-slate-700/60">
                  {/* 标题行 */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-semibold text-white">盘口价值比</h2>
                      <p className="text-xs text-slate-500 mt-0.5">µ = {bestMu} · 当前 {currentTweetCount} 条 · 剩余 {remainingDays}d</p>
                    </div>
                    <span className="text-xs text-slate-500 font-mono">
                      {lastUpdated && new Date(lastUpdated).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* 表格 */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700/50">
                          <th className="text-left py-2 px-2 text-xs text-slate-500 font-medium">区间</th>
                          <th className="text-right py-2 px-2 text-xs text-slate-500 font-medium">盘口价</th>
                          <th className="text-right py-2 px-2 text-xs text-slate-500 font-medium">模型概率</th>
                          <th className="text-right py-2 px-2 text-xs text-slate-500 font-medium">VR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {intervalAnalysis.slice(0, 12).map((item) => {
                          if (!item) return null;
                          const vr = item.marketPrice > 0 ? item.trueProb / item.marketPrice : 0;
                          const vrClass = vr >= 1.2 ? 'text-emerald-400 font-bold' : vr >= 1.0 ? 'text-teal-400 font-semibold' : 'text-slate-500';
                          const vrLabel = vr >= 1.2 ? `${vr.toFixed(2)} ✓` : vr >= 1.0 ? vr.toFixed(2) : vr.toFixed(2);
                          const rowBg = item.isCenter ? 'bg-teal-500/8' : '';
                          return (
                            <tr key={item.range} className={`border-b border-slate-700/30 hover:bg-slate-800/30 ${rowBg}`}>
                              <td className={`py-2.5 px-2 font-mono font-semibold ${item.isCenter ? 'text-teal-300' : item.status === 'busted' ? 'text-slate-600' : 'text-slate-300'}`}>
                                {item.range}
                                {item.isCenter && <span className="ml-1.5 text-xs bg-teal-500/20 text-teal-400 px-1.5 py-0.5 rounded">µ</span>}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono text-slate-400">{item.marketPrice.toFixed(1)}¢</td>
                              <td className={`py-2.5 px-2 text-right font-mono ${item.trueProb > item.marketPrice ? 'text-emerald-400' : 'text-slate-400'}`}>
                                {item.trueProb.toFixed(1)}%
                              </td>
                              <td className={`py-2.5 px-2 text-right font-mono ${vrClass}`}>{vrLabel}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-xs text-slate-600">VR = 模型概率 ÷ 盘口价，≥1.2 有价值</p>
                </section>

                <section className="bg-[#13152e] rounded-2xl p-6 border border-slate-700/60">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                        <Gauge className="w-5 h-5 text-teal-400" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-white">目标区间时速倒推雷达</h2>
                        <p className="text-xs text-slate-400 font-mono">当前速率: {(apiPace / 24).toFixed(2)} 条/时</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {velocityRanges.slice(0, 12).map((item, idx) => {
                      if (!item) return null;
                      const borderColor = item.difficulty === 'impossible' ? 'border-rose-500/30' :
                                         item.difficulty === 'easy' ? 'border-emerald-500/30' :
                                         item.difficulty === 'medium' ? 'border-amber-500/30' :
                                         'border-teal-500/30';
                      const badgeColor = item.difficulty === 'impossible' ? 'bg-rose-500/20 text-rose-300' :
                                        item.difficulty === 'easy' ? 'bg-emerald-500/20 text-emerald-300' :
                                        item.difficulty === 'medium' ? 'bg-amber-500/20 text-amber-300' :
                                        'bg-teal-500/20 text-teal-300';
                      const label = item.difficulty === 'impossible' ? '需加速' :
                                   item.difficulty === 'easy' ? '轻松' :
                                   item.difficulty === 'medium' ? '中等' : '困难';

                      return (
                        <div key={idx} className={`p-4 rounded-xl border bg-slate-800/40 ${borderColor} ${item.isCenter ? 'ring-1 ring-teal-500/40' : ''}`}>
                          {/* Header: range + badges */}
                          <div className="flex items-center justify-between mb-3">
                            <span className={`font-bold text-sm font-mono ${item.isCenter ? 'text-teal-300' : 'text-slate-200'}`}>
                              {item.range}
                            </span>
                            <div className="flex gap-1">
                              {item.isCenter && (
                                <span className="px-1.5 py-0.5 bg-teal-500/20 text-teal-300 text-xs rounded font-semibold">中心</span>
                              )}
                              <span className={`px-1.5 py-0.5 text-xs rounded font-semibold ${badgeColor}`}>{label}</span>
                            </div>
                          </div>

                          {/* Primary: tweets needed — most prominent */}
                          <div className="bg-slate-900/50 rounded-lg p-3 mb-3 text-center">
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">还需发推</p>
                            <p className="text-2xl font-bold text-white font-mono leading-none">
                              +{item.tweetsNeededMin}
                              <span className="text-slate-400 text-lg mx-1">~</span>
                              +{item.tweetsNeededMax}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">条</p>
                          </div>

                          {/* Secondary: velocity & probability */}
                          <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-400">所需时速</span>
                              <span className="text-teal-400 font-mono">
                                {item.minVelocity === Infinity ? '∞' : item.minVelocity.toFixed(2)}
                                <span className="text-slate-400 mx-0.5">~</span>
                                {item.maxVelocity === Infinity ? '∞' : item.maxVelocity.toFixed(2)}/h
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">真实概率</span>
                              <span className="text-teal-400 font-bold font-mono">{item.trueProb.toFixed(1)}%</span>
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
                        <div className="w-2 h-2 rounded bg-teal-400"></div>
                        <span className="text-teal-400">较难</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded bg-rose-400"></div>
                        <span className="text-rose-400">需加速</span>
                      </div>
                    </div>
                  </div>
                </section>

              </div>

              <div className="space-y-6">

                {normalProbs.length > 0 && (
                  <section className="bg-[#13152e] rounded-2xl p-6 border border-slate-700/60">
                    <h2 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                        <BarChart3 className="w-4 h-4 text-teal-400" />
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
                                ? 'bg-teal-500/5 border border-teal-500/20'
                                : 'bg-slate-800/40'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className={`font-bold font-mono ${item.isCenter ? 'text-teal-300' : 'text-slate-200'}`}>
                                {item.range}
                              </span>
                              <span className="text-slate-400 text-xs font-mono">
                                市场 {item.price.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex gap-3 items-center">
                              <span className="text-teal-400 font-medium font-mono">泊松 {poissonVal.toFixed(1)}%</span>
                              <span className="text-teal-400 font-medium font-mono">正态 {normalVal.toFixed(1)}%</span>
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
                    <p className="mt-3 text-xs text-slate-400 text-center">
                      正态分布偏宽（Δ正）→ 尾部风险更大；偏窄（Δ负）→ 中心更集中
                    </p>
                  </section>
                )}


                <a
                  href={`https://polymarket.com/event/${currentMarket?.slug || ''}${REFERRAL}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full p-4 bg-violet-600 hover:bg-teal-500 rounded-xl text-center font-semibold text-white transition-all"
                >
                  <ExternalLink className="w-4 h-4 inline mr-2" />
                  进入 Polymarket 下注
                </a>
              </div>
            </div>
            )}
          </div>
        )}

        {activeTab === 'positions' && (
          <div className="max-w-4xl mx-auto">
            <PositionManager
              positions={positions}
              onAdd={handleAddPosition}
              onDelete={handleDeletePosition}
              rangeOptions={rangeOptions}
              currentMarketSlug={currentMarket?.slug ?? ''}
            />
          </div>
        )}

        {activeTab === 'heatmap' && (
          <div className="max-w-6xl mx-auto">
            <TweetHeatmap />
          </div>
        )}

        {activeTab === 'guide' && (
          <div className="max-w-4xl mx-auto">
            <StrategyGuide />
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

        {activeTab === 'telegram' && (
          <TelegramAlerts
            config={telegramConfig}
            onSave={saveTelegramConfig}
            alertInput={telegramAlertInput}
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

function TweetGenerator({ currentTracking, currentMarket, predictedCenter, apiPace, intervalAnalysis }: TweetGeneratorProps) {
  const [copied, setCopied] = useState(false);

  const tweetContent = useMemo(() => {
    const currentTotal = currentTracking?.stats?.total ?? 0;
    const todayTotal   = currentTracking?.stats?.todayTotal ?? 0;
    const daysRem      = currentTracking?.stats?.daysRemaining ?? 0;
    const hoursRem     = currentTracking?.stats?.hoursRemaining ?? 0;
    const totalHours   = daysRem * 24 + hoursRem;
    const totalDays    = totalHours / 24;
    // const currentSpeed = apiPace / 24; // 条/h (reserved)

    // ── 每日发推节奏（最近7天，从旧到新，显示真实日期）──
    const allDaily = currentTracking?.stats?.daily ?? [];
    const startDate = currentTracking?.startDate ?? '';
    const dailyData = allDaily.slice(-7);
    const dailyLines = dailyData.map((d, i) => {
      // 显示 M/D 格式日期（北京时间）
      const dt = new Date(d.date + 'T00:00:00+08:00');
      const label = `${dt.getMonth() + 1}/${dt.getDate()}`;
      const isToday = i === dailyData.length - 1;
      // 计算这是市场第几天
      const startMs = startDate ? new Date(startDate).getTime() : 0;
      const dayNum = startMs ? Math.round((dt.getTime() - startMs) / 86400000) + 1 : i + 1;
      return `D${dayNum} (${label})  ${d.count} 条${isToday ? '  ← 今天' : ''}`;
    }).join('\n');

    // ── 动态开头：根据今天节奏 vs 均值判断异常 ──
    let hook = '';
    const todayHoursPassed = 24 - (hoursRem % 24 || 24);
    const todayProjected = todayHoursPassed > 0 ? (todayTotal / todayHoursPassed) * 24 : 0;
    const avgPerDay = apiPace;

    // 检查落点是否接近区间边界
    const activeIntervals: any[] = (intervalAnalysis ?? []).filter((i: any) => i?.status === 'active');
    const centerInterval = activeIntervals.find((i: any) => i?.isCenter);
    const centerMax = centerInterval?.parsed?.max ?? 0;
    const centerMin = centerInterval?.parsed?.min ?? 0;
    const distToUpperBound = centerMax > 0 ? centerMax - predictedCenter : Infinity;
    const distToLowerBound = predictedCenter > 0 ? predictedCenter - centerMin : Infinity;
    const nearBoundary = Math.min(distToUpperBound, distToLowerBound) <= 8;

    if (totalDays < 0.5) {
      hook = `今晚 24:00 结算，答案快揭晓了。`;
    } else if (nearBoundary) {
      const side = distToUpperBound < distToLowerBound ? '上' : '下';
      hook = `还差 ${Math.round(Math.min(distToUpperBound, distToLowerBound))} 条，落点就要往${side}跨区间了。`;
    } else if (avgPerDay > 0 && todayProjected > 0 && todayProjected < avgPerDay * 0.5) {
      hook = `马斯克今天突然安静了。`;
    } else if (avgPerDay > 0 && todayProjected > avgPerDay * 1.8) {
      hook = `马斯克今天猛发了一波。`;
    } else if (totalDays >= 2.5) {
      hook = `马斯克推文预测，还剩 ${daysRem} 天。`;
    } else if (totalDays >= 1.5) {
      hook = `落点慢慢收敛了，还剩 ${daysRem} 天。`;
    } else {
      hook = `最后 ${daysRem > 0 ? daysRem + '天' : hoursRem + '小时'}，节奏很关键。`;
    }

    // ── 区间赔率（中心排第一，其余按概率降序，最多3个）──
    const otherIntervals = activeIntervals
      .filter((i: any) => !i?.isCenter)
      .sort((a: any, b: any) => b.trueProb - a.trueProb);
    const displayIntervals = (centerInterval
      ? [centerInterval, ...otherIntervals]
      : otherIntervals).slice(0, 3);

    const oddsLines = displayIntervals.map((i: any) => {
      const returnX = i.marketPrice > 0 ? (100 / i.marketPrice).toFixed(1) : '—';
      const prefix  = i.isCenter ? '► ' : '  ';
      return `${prefix}${i.range}  ${i.marketPrice.toFixed(0)}%（中奖 ${returnX}x）`;
    }).join('\n');

    // ── 个人视角：根据阶段 + 真实数据给有价值的判断 ──
    let take = '';
    const centerRange = centerInterval?.range ?? '';
    const centerPrice = centerInterval?.marketPrice ?? 0;
    const centerReturn = centerPrice > 0 ? (100 / centerPrice).toFixed(1) : '—';
    // 预测落点距结算还需要发多少条
    const tweetsLeft = predictedCenter > currentTotal ? Math.round(predictedCenter - currentTotal) : 0;
    const daysLabel = daysRem > 0 ? `${daysRem}天${hoursRem > 0 ? hoursRem + '小时' : ''}` : `${hoursRem}小时`;

    if (totalDays >= 2.5) {
      take = `落点还在跑，现在进太早。预测还剩 ~${tweetsLeft} 条要发，等节奏再稳一天看看。`;
    } else if (totalDays >= 2.0) {
      take = `第一次入场窗口。我主仓打 ${centerRange || '中心区间'}（现在 ${centerPrice.toFixed(0)}%，约 ${centerReturn}x），两翼各配一点，总资金 25%。`;
    } else if (totalDays >= 1.5) {
      take = `落点基本定了。${centerRange} 是核心，${centerPrice.toFixed(0)}% 赔率意味着赢了拿 ${centerReturn}x。现在集中加仓，两翼开始减持。`;
    } else if (totalDays >= 1.0) {
      take = `翼仓该动了——先减 40%，锁住收益。剩 ${daysLabel}，专注等 ${centerRange || '中心区间'} 结算。`;
    } else if (totalDays >= 0.5) {
      take = `最后不到一天。翼仓全清，${centerRange} 留仓等结果。现在进 ${centerRange} 的人赌的是 ${centerReturn}x。`;
    } else {
      take = `结算进入倒计时。仓位已定，等结果。`;
    }

    // ── 市场链接（带邀请码）──
    const marketSlug = currentMarket?.slug ?? '';
    const marketUrl = marketSlug
      ? `https://polymarket.com/event/${marketSlug}${REFERRAL}`
      : `https://polymarket.com${REFERRAL}`;

    const totalLabel = daysRem > 0
      ? `${daysRem}天${hoursRem > 0 ? hoursRem + '小时' : ''}`
      : `${hoursRem}小时`;

    return `${hook}

发推节奏（近 ${dailyData.length} 天）：
${dailyLines || `日均 ${apiPace.toFixed(0)} 条/天`}

累计 ${currentTotal} 条 · 预测落点 ~${predictedCenter} 条 · 还剩 ${totalLabel}

Polymarket 赔率：
${oddsLines}

——
${take}

${marketUrl} #Polymarket`.replace(/\n{3,}/g, '\n\n').trim();
  }, [currentTracking, currentMarket, predictedCenter, apiPace, intervalAnalysis]);

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
      <section className="bg-[#11202f] rounded-2xl p-6 border border-slate-700/50">
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
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
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

        <div className="bg-slate-900/80 rounded-xl p-5 mb-4 font-mono text-sm text-slate-300 leading-relaxed whitespace-pre-wrap border border-slate-700/50">
          {tweetContent}
        </div>

        <button
          onClick={copyToClipboard}
          className={`w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl font-semibold transition-all text-base ${
            copied
              ? 'bg-emerald-600 text-white'
              : 'bg-violet-600 hover:bg-teal-500 text-white'
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
