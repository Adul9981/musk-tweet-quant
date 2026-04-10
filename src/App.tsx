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
  Gauge
} from 'lucide-react';
import { TweetHeatmap } from './components/TweetHeatmap';

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
    .replace(/March\s*(\d+)/g, '3月$1日')
    .replace(/April\s*(\d+)/g, '4月$1日')
    .replace(/May\s*(\d+)/g, '5月$1日')
    .replace(/January\s*(\d+)/g, '1月$1日')
    .replace(/February\s*(\d+)/g, '2月$1日');
}

function parseTimestamp(ts: string): Date {
  if (!ts.endsWith('Z') && !ts.includes('+')) {
    ts = ts + 'Z';
  }
  return new Date(ts);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'market' | 'analysis' | 'heatmap' | 'tweet'>('market');
  const [gistData, setGistData] = useState<MarketData[]>([]);
  const [trackings, setTrackings] = useState<Tracking[]>([]);
  const [selectedMarketIndex, setSelectedMarketIndex] = useState(0);
  const [isLoadingGist, setIsLoadingGist] = useState(true);
  const [isLoadingTracker, setIsLoadingTracker] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [currentTweetCount, setCurrentTweetCount] = useState(0);

  const handleRefresh = async () => {
    setIsLoadingGist(true);
    setIsLoadingTracker(true);
    
    try {
      const GIST_ID = 'd174b4498c408076ff218e164f24807e';
      const res = await fetch(`https://api.github.com/gists/${GIST_ID}?t=${Date.now()}`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
        cache: 'no-store'
      });
      if (res.ok) {
        const gist = await res.json();
        const content = gist.files?.['polymarket-data.json']?.content;
        if (content) {
          const data = JSON.parse(content);
          setGistData(data);
          if (data[0]?.scraped_at) {
            setLastUpdated(data[0].scraped_at);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch Gist data:', err);
    } finally {
      setIsLoadingGist(false);
    }
    
    try {
      const res = await fetch('https://xtracker.polymarket.com/api/users/elonmusk/trackings?activeOnly=true');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          const sevenDay = data.data.filter((t: any) => {
            const days = (new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) / (1000 * 60 * 60 * 24);
            return days >= 6 && days <= 8;
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
                      daily: dailyTotals
                    }
                  };
                }
              } catch {}
              return null;
            })
          );
          
          setTrackings(trackingsWithStats.filter(Boolean) as any);
        }
      }
    } catch (err) {
      console.error('Failed to fetch tracker data:', err);
    } finally {
      setIsLoadingTracker(false);
    }
  };

  const fetchGistData = async () => {
    setIsLoadingGist(true);
    const GIST_ID = 'd174b4498c408076ff218e164f24807e';
    
    try {
      const res = await fetch(`https://api.github.com/gists/${GIST_ID}?t=${Date.now()}`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
        cache: 'no-store'
      });
      if (res.ok) {
        const gist = await res.json();
        const content = gist.files?.['polymarket-data.json']?.content;
        if (content) {
          const data = JSON.parse(content);
          setGistData(data);
          if (data[0]?.scraped_at) {
            setLastUpdated(data[0].scraped_at);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch Gist data:', err);
    } finally {
      setIsLoadingGist(false);
    }
  };

  useEffect(() => {
    const fetchTrackerData = async () => {
      try {
        const res = await fetch('https://xtracker.polymarket.com/api/users/elonmusk/trackings?activeOnly=true');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data) {
            const sevenDay = data.data.filter((t: any) => {
              const days = (new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) / (1000 * 60 * 60 * 24);
              return days >= 6 && days <= 8;
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

    fetchGistData();
    fetchTrackerData();
    
    const interval = setInterval(fetchGistData, 5 * 60 * 1000);
    return () => clearInterval(interval);
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
    <div className="min-h-screen">
      <header className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shadow-lg">
                <Radio className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">马斯克推文预测市场</h1>
                <p className="text-xs text-indigo-200">Musk Tweet Prediction Markets</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${phase.bg}`}>
                {phase.name}
              </span>
              {lastUpdated && (
                <div className="hidden lg:flex items-center gap-3 text-xs text-indigo-100">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    北京 {parseTimestamp(lastUpdated).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-indigo-300">|</span>
                  <span>美东 {parseTimestamp(lastUpdated).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
              <a
                href="https://polymarket.com/?r=adul"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-700 hover:bg-indigo-50 text-sm font-semibold rounded-lg transition-all shadow-md hover:shadow-lg"
              >
                <span>主页</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href={`https://polymarket.com/event/${currentMarket?.slug || ''}${REFERRAL}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white hover:bg-indigo-400 text-sm font-medium rounded-lg transition-all shadow-md hover:shadow-lg"
              >
                <span>进入市场</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1">
            {[
              { id: 'market', label: '市场概览', icon: TrendingUp },
              { id: 'analysis', label: '概率分析', icon: BarChart3 },
              { id: 'heatmap', label: '发推热力图', icon: Grid3X3 },
              { id: 'tweet', label: '推文生成', icon: FileText },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-5 py-4 text-sm font-medium border-b-2 transition-all ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50'
                    : 'border-transparent text-slate-500 hover:text-indigo-600 hover:bg-slate-50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
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
                <section className="bg-gradient-to-br from-slate-800/80 via-slate-800/60 to-slate-900/80 rounded-2xl p-6 border border-indigo-500/20 shadow-xl shadow-indigo-500/10">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/30 to-cyan-500/30 flex items-center justify-center border border-indigo-400/30">
                        <Target className="w-5 h-5 text-cyan-400" />
                      </div>
                      <h2 className="text-lg font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                        {currentMarket?.title ? parseMarketTitle(currentMarket.title) : '市场数据'}
                      </h2>
                    </div>
                    <button
                      onClick={handleRefresh}
                      disabled={isLoadingGist || isLoadingTracker}
                      className="flex items-center gap-2 text-sm px-4 py-2 bg-gradient-to-r from-indigo-600/80 to-violet-600/80 hover:from-indigo-500 hover:to-violet-500 text-white rounded-lg transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoadingGist || isLoadingTracker ? 'animate-spin' : ''}`} />
                      {isLoadingGist || isLoadingTracker ? '刷新中...' : '刷新数据'}
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 text-center shadow-lg">
                      <p className="text-xs text-indigo-100 mb-1">当前总数</p>
                      <p className="text-3xl font-bold text-white">{currentTracking?.stats?.total || '-'}</p>
                      <p className="text-xs text-indigo-200 mt-1">条推文</p>
                    </div>
                    <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl p-4 text-center shadow-lg">
                      <p className="text-xs text-cyan-100 mb-1">今日新增</p>
                      <p className="text-3xl font-bold text-white">{currentTracking?.stats?.todayTotal || '-'}</p>
                      <p className="text-xs text-cyan-200 mt-1">条</p>
                    </div>
                    <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 text-center shadow-lg">
                      <p className="text-xs text-amber-100 mb-1">日均时速</p>
                      <p className="text-3xl font-bold text-white">{currentTracking?.stats?.pace || '-'}</p>
                      <p className="text-xs text-amber-200 mt-1">条/天</p>
                    </div>
                    <div className="bg-gradient-to-br from-violet-500 to-violet-600 rounded-xl p-4 text-center shadow-lg">
                      <p className="text-xs text-violet-100 mb-1">剩余时间</p>
                      <p className="text-3xl font-bold text-white">
                        {currentTracking?.stats ? `${currentTracking.stats.daysRemaining}天` : '-'}
                      </p>
                      <p className="text-xs text-violet-200 mt-1">
                        {currentTracking?.stats && currentTracking.stats.hoursRemaining > 0 
                          ? `${currentTracking.stats.hoursRemaining}小时` 
                          : '结束'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-100 rounded-xl p-4 border border-slate-200 shadow-inner">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-600 font-medium">完成进度</span>
                      <span className="text-slate-800 font-semibold">{currentTracking?.stats?.percentComplete || 0}%</span>
                    </div>
                    <div className="w-full bg-slate-300 rounded-full h-3 overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-cyan-500 to-purple-500 transition-all duration-500"
                        style={{ width: `${Math.min(currentTracking?.stats?.percentComplete || 0, 100)}%` }}
                      />
                    </div>
                  </div>
                </section>

                {currentMarket && (
                  <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-lg">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
                          <Activity className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-800">Polymarket 赔率</h2>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs text-slate-500">交易量</p>
                          <p className="text-lg font-bold text-indigo-600">
                            ${(currentMarket.volume / 1000000).toFixed(1)}M
                          </p>
                        </div>
                        <a
                          href={`https://polymarket.com/event/${currentMarket?.slug || 'elon-musk-of-tweets-march-24-march-31'}${REFERRAL}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-all shadow-md hover:shadow-lg"
                        >
                          <span>查看市场</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                    {lastUpdated && (
                      <div className="text-xs text-slate-500 mb-4">
                        数据更新: {new Date(lastUpdated).toLocaleString('zh-CN')}
                      </div>
                    )}

                    <div className="mb-6 p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-300 font-medium">预测中心落点</span>
                        <span className="text-2xl font-bold text-indigo-400">
                          ~{predictedCenter} 条
                        </span>
                      </div>
                      <div className="text-sm text-slate-500 mt-1">
                        基于当前日均 <span className="text-cyan-600 font-semibold">{apiPace.toFixed(1)}</span> 条/天
                        <span className="ml-2 text-slate-400">({(apiPace / 24).toFixed(2)} 条/时)</span>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      {analysisData.slice(0, 8).map((r) => (
                        <div 
                          key={r.range} 
                          className={`flex items-center justify-between rounded-xl px-4 py-3 transition-colors ${
                            r.isCenter 
                              ? 'bg-indigo-100 border-2 border-indigo-400' 
                              : 'bg-slate-50 border border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`font-semibold ${r.isCenter ? 'text-indigo-700' : 'text-slate-700'}`}>
                              {r.range}
                            </span>
                            {r.isCenter && (
                              <span className="px-2 py-0.5 bg-indigo-200 text-indigo-700 text-xs rounded-full font-medium">中心</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="w-24 bg-slate-200 rounded-full h-2 overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${r.isCenter ? 'bg-indigo-500' : 'bg-violet-400'}`}
                                style={{ width: `${Math.min(r.price || 0, 25) * 4}%` }}
                              />
                            </div>
                            <span className={`text-sm font-bold w-14 text-right ${r.isCenter ? 'text-indigo-600' : 'text-slate-600'}`}>
                              {r.price.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              <div className="space-y-6">
                <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-lg">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
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
                          className={`p-4 rounded-xl border transition-all ${
                            isActive 
                              ? 'bg-indigo-50 border-indigo-400' 
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <button
                            onClick={() => handleSelectMarket(i)}
                            className="w-full text-left mb-3"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <span className={`text-sm font-semibold block ${isActive ? 'text-indigo-800' : 'text-slate-700'}`}>
                                  {parseMarketTitle(market.title)}
                                </span>
                                <span className="text-xs text-slate-400 mt-1 block">剩余 {daysLeft} 天 · ${(market.volume / 1000000).toFixed(1)}M</span>
                              </div>
                              <div className={`w-2 h-2 rounded-full mt-2 ${isActive ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                            </div>
                          </button>
                          <a
                            href={`https://polymarket.com/event/${market.slug}${REFERRAL}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors border border-slate-200"
                          >
                            <span>进入市场</span>
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {currentTracking?.stats?.daily && currentTracking.stats.daily.length > 0 && (
                  <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-slate-700">每日发推统计</h3>
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">UTC</span>
                    </div>
                    <div className="space-y-1">
                      {currentTracking.stats.daily.slice(-7).reverse().map((day, i) => (
                        <div key={day.date || i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                          <span className="text-sm text-slate-600">{formatDate(day.date)}</span>
                          <span className="text-sm font-semibold text-cyan-600">{day.count}</span>
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
              <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center shadow-lg">
                <p className="text-slate-500">暂无市场数据，请先选择一个活跃市场</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-lg">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                        <BarChart3 className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-800">盘口价值比分析</h2>
                        <p className="text-xs text-slate-500">基于泊松分布 · 预测中心 μ = {mu.toFixed(1)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Clock className="w-3 h-3" />
                      {lastUpdated && new Date(lastUpdated).toLocaleTimeString('zh-CN')}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="text-center p-4 bg-indigo-50 rounded-xl">
                      <p className="text-2xl font-bold text-indigo-600">{currentTweetCount}</p>
                      <p className="text-xs text-indigo-500">当前推文</p>
                    </div>
                    <div className="text-center p-4 bg-cyan-50 rounded-xl">
                      <p className="text-2xl font-bold text-cyan-600">{apiPace.toFixed(1)}</p>
                      <p className="text-xs text-cyan-500">日均时速</p>
                    </div>
                    <div className="text-center p-4 bg-amber-50 rounded-xl">
                      <p className="text-2xl font-bold text-amber-600">{E_rem.toFixed(0)}</p>
                      <p className="text-xs text-amber-500">预期剩余</p>
                    </div>
                    <div className="text-center p-4 bg-violet-50 rounded-xl">
                      <p className="text-2xl font-bold text-violet-600">{remainingDays}d</p>
                      <p className="text-xs text-violet-500">剩余时间</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200">
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
                          const statusClass = item.isCenter ? 'bg-indigo-200 text-indigo-700' : 
                                             item.status === 'busted' ? 'bg-rose-100 text-rose-700' :
                                             item.status === 'passed' ? 'bg-emerald-100 text-emerald-700' :
                                             'bg-slate-100 text-slate-600';
                          const statusText = item.isCenter ? '中心' : 
                                           item.status === 'busted' ? '已破' :
                                           item.status === 'passed' ? '已过' : '活跃';
                          const payout = item.marketPrice > 0 ? (100 / item.marketPrice * 100 - 100) : 0;
                          const payoutClass = payout > 100 ? 'text-emerald-600' : payout > 50 ? 'text-cyan-600' : 'text-slate-500';
                          const isPositive = item.trueProb > item.marketPrice;
                          const trueProbClass = isPositive ? 'text-emerald-600' : 'text-rose-500';
                          const profitLoss = item.trueProb - item.marketPrice;
                          const plClass = profitLoss > 0 ? 'text-emerald-500' : profitLoss < 0 ? 'text-rose-500' : 'text-slate-400';
                           
                          return (
                            <tr key={item.range} className={`border-b border-slate-100 hover:bg-slate-50 ${item.isCenter ? 'bg-indigo-50' : ''}`}>
                              <td className={`py-3 px-3 font-semibold ${item.isCenter ? 'text-indigo-700' : 'text-slate-700'}`}>
                                {item.range}
                              </td>
                              <td className="py-3 px-3 text-right text-slate-500">{item.marketPrice.toFixed(1)}%</td>
                              <td className={`py-3 px-3 text-right font-semibold ${trueProbClass}`}>{item.trueProb.toFixed(1)}%</td>
                              <td className={`py-3 px-3 text-right font-semibold ${payoutClass}`}>
                                {payout > 0 ? '+' : ''}{payout.toFixed(0)}%
                              </td>
                              <td className={`py-3 px-3 text-right font-semibold ${plClass}`}>
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
                  
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-500 p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-4">
                      <span>真实概率 &gt; 赔率 = <span className="text-emerald-600 font-medium">盈利</span></span>
                      <span>真实概率 &lt; 赔率 = <span className="text-rose-500 font-medium">亏损</span></span>
                    </div>
                    <span>回报率 = 1/赔率 - 1</span>
                  </div>
                </section>

                <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-lg">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center">
                        <Gauge className="w-5 h-5 text-cyan-600" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-800">目标区间时速倒推雷达</h2>
                        <p className="text-xs text-slate-500">当前速率: {(apiPace / 24).toFixed(2)} 条/时</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {velocityRanges.slice(0, 12).map((item, idx) => {
                      if (!item) return null;
                      const bgColor = item.difficulty === 'impossible' ? 'bg-rose-50 border-rose-200' :
                                     item.difficulty === 'easy' ? 'bg-emerald-50 border-emerald-200' :
                                     item.difficulty === 'medium' ? 'bg-amber-50 border-amber-200' :
                                     'bg-violet-50 border-violet-200';
                      const label = item.difficulty === 'impossible' ? '需加速' :
                                   item.difficulty === 'easy' ? '轻松' :
                                   item.difficulty === 'medium' ? '中等' : '困难';
                      const textColor = item.difficulty === 'impossible' ? 'text-rose-600' :
                                       item.difficulty === 'easy' ? 'text-emerald-600' :
                                       item.difficulty === 'medium' ? 'text-amber-600' : 'text-violet-600';
                      
                      return (
                        <div key={idx} className={`p-3 rounded-lg border ${bgColor} ${item.isCenter ? 'ring-2 ring-indigo-400' : ''}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`font-bold text-sm ${item.isCenter ? 'text-indigo-700' : 'text-slate-700'}`}>
                              {item.range}
                            </span>
                            {item.isCenter && (
                              <span className="px-1.5 py-0.5 bg-indigo-200 text-indigo-700 text-[10px] rounded-full">中心</span>
                            )}
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-500">时速下限:</span>
                              <span className="text-cyan-600 font-medium">{item.minVelocity === Infinity ? '∞' : item.minVelocity.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">时速上限:</span>
                              <span className="text-cyan-600 font-medium">{item.maxVelocity === Infinity ? '∞' : item.maxVelocity.toFixed(2)}</span>
                            </div>
                            <div className="border-t border-slate-200 pt-1 mt-1">
                              <div className="flex justify-between">
                                <span className="text-slate-500">需推下限:</span>
                                <span className="text-slate-700 font-medium">+{item.tweetsNeededMin}条</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">需推上限:</span>
                                <span className="text-slate-700 font-medium">+{item.tweetsNeededMax}条</span>
                              </div>
                            </div>
                            <div className="border-t border-slate-200 pt-1 mt-1">
                              <div className="flex justify-between">
                                <span className="text-slate-500">真实概率:</span>
                                <span className="text-indigo-600 font-bold">{item.trueProb.toFixed(1)}%</span>
                              </div>
                            </div>
                          </div>
                          <div className={`mt-2 text-center text-xs font-bold ${textColor}`}>
                            {label}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="mt-4 p-3 bg-slate-100 rounded-lg">
                    <div className="grid grid-cols-4 gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded bg-emerald-300"></div>
                        <span className="text-emerald-600">轻松</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded bg-amber-300"></div>
                        <span className="text-amber-600">中等</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded bg-violet-300"></div>
                        <span className="text-violet-600">较难</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded bg-rose-300"></div>
                        <span className="text-rose-600">需加速</span>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-lg">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <Target className="w-4 h-4 text-emerald-600" />
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
                          <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                            <div className="flex items-center gap-3 mb-4">
                              <span className="px-3 py-1 bg-indigo-200 text-indigo-700 rounded-full text-sm font-semibold">核心仓位</span>
                              <span className="text-slate-800 font-bold text-lg">{centerItem.range}</span>
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                              <div className="text-center p-3 bg-white rounded-lg">
                                <p className="text-2xl font-bold text-indigo-600">{centerRatio.toFixed(0)}%</p>
                                <p className="text-xs text-slate-500">仓位比例</p>
                              </div>
                              <div className="text-center p-3 bg-white rounded-lg">
                                <p className="text-2xl font-bold text-cyan-600">{centerItem.trueProb.toFixed(1)}%</p>
                                <p className="text-xs text-slate-500">真实概率</p>
                              </div>
                              <div className="text-center p-3 bg-white rounded-lg">
                                <p className="text-2xl font-bold text-rose-600">{maxLoss.toFixed(0)}%</p>
                                <p className="text-xs text-slate-500">潜在亏损</p>
                              </div>
                              <div className="text-center p-3 bg-white rounded-lg">
                                <p className="text-2xl font-bold text-emerald-600">{maxGain.toFixed(0)}%</p>
                                <p className="text-xs text-slate-500">潜在收益</p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 text-sm text-slate-600 bg-white/50 p-3 rounded-lg">
                              <span className="font-medium">风险收益比:</span>
                              <span className="text-rose-500 font-semibold">-{maxLoss.toFixed(0)}%</span>
                              <span className="text-slate-400">vs</span>
                              <span className="text-emerald-500 font-semibold">+{maxGain.toFixed(0)}%</span>
                              <span className="text-slate-400 ml-2">(赔率 {centerItem.marketPrice.toFixed(1)}%)</span>
                            </div>
                          </div>
                        )}
                        
                        <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl">
                          <h3 className="text-sm font-semibold text-slate-600 mb-3">下注区间参考</h3>
                          <div className="space-y-2">
                            {intervalAnalysis.slice(0, 8).map(item => item && (
                              <div key={item.range} className={`flex items-center justify-between p-2 rounded-lg ${item.isCenter ? 'bg-indigo-100 border border-indigo-300' : 'bg-white'}`}>
                                <span className={`font-medium ${item.isCenter ? 'text-indigo-700' : 'text-slate-700'}`}>
                                  {item.range}
                                  {item.isCenter && <span className="ml-2 text-xs bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded">推荐</span>}
                                </span>
                                <div className="flex items-center gap-4 text-sm">
                                  <span className="text-slate-500">赔率: {item.marketPrice.toFixed(1)}%</span>
                                  <span className={`font-medium ${item.alpha > 1 ? 'text-emerald-600' : item.alpha < 1 ? 'text-rose-600' : 'text-slate-600'}`}>
                                    α: {item.alpha.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        {undervaluedItems.length > 0 && (
                          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                            <h3 className="text-sm font-semibold text-emerald-600 mb-2">价值区间 (α &gt; 1.1)</h3>
                            <p className="text-xs text-slate-500 mb-2">市场定价低于真实概率，值得关注</p>
                            <div className="flex flex-wrap gap-2">
                              {undervaluedItems.slice(0, 5).map(item => item && (
                                <span key={item.range} className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm">
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
                <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-lg">
                  <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center">
                      <Activity className="w-4 h-4 text-cyan-600" />
                    </div>
                    泊松概率模型
                  </h2>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-sm text-slate-600">当前已发推</span>
                      <span className="text-sm font-bold text-slate-800">{probabilityModel.C} 条</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-sm text-slate-600">日均发推</span>
                      <span className="text-sm font-bold text-amber-600">{probabilityModel.R.toFixed(1)} 条/天</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-sm text-slate-600">剩余时间</span>
                      <span className="text-sm font-bold text-slate-800">{(T / 24).toFixed(1)} 天</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                      <span className="text-sm text-slate-600">预期落点 μ</span>
                      <span className="text-lg font-bold text-indigo-600">{probabilityModel.mu.toFixed(0)} 条</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-cyan-50 rounded-lg border border-cyan-200">
                      <span className="text-sm text-slate-600">预期剩余 λ</span>
                      <span className="text-sm font-bold text-cyan-600">{probabilityModel.E_rem.toFixed(1)} 条</span>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-slate-100 rounded-lg text-xs text-slate-500">
                    泊松分布: P(X=k) = μ^k * e^(-μ) / k!
                  </div>
                </section>

                {currentTracking?.stats?.daily && currentTracking.stats.daily.length > 0 && (
                  <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-slate-700">每日发推统计</h3>
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">UTC</span>
                    </div>
                    <div className="space-y-1">
                      {currentTracking.stats.daily.slice(-7).reverse().map((day, i) => (
                        <div key={day.date || i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                          <span className="text-sm text-slate-600">{formatDate(day.date)}</span>
                          <span className="text-sm font-semibold text-cyan-600">{day.count}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <a
                  href={`https://polymarket.com/event/${currentMarket?.slug || ''}${REFERRAL}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full p-4 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-center font-semibold text-white transition-all shadow-lg"
                >
                  <ExternalLink className="w-4 h-4 inline mr-2" />
                  进入 Polymarket 下注
                </a>
              </div>
            </div>
            )}
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
}

function TweetGenerator({ currentTracking, currentMarket, predictedCenter, apiPace, remainingHours, centerRange }: TweetGeneratorProps) {
  const [copied, setCopied] = useState(false);

  const marketTitle = currentMarket?.title ? parseMarketTitle(currentMarket.title) : '预测市场';

  const tweetContent = useMemo(() => {
    const phase = currentTracking?.stats ? getPhase(currentTracking.stats.daysRemaining) : getPhase(7);
    const currentTotal = currentTracking?.stats?.total || 0;
    const todayTotal = currentTracking?.stats?.todayTotal || 0;

    return `📊 ${marketTitle} 实时分析

📈 当前进度: ${currentTotal} 条 (今日+${todayTotal})
⚡ 发推日均: ${apiPace.toFixed(1)}条/天 (≈${(apiPace/24).toFixed(2)}条/时)
🎯 预测落点: ~${predictedCenter}条

📍 阶段: ${phase.name}
⏰ 剩余时间: ${Math.floor(Math.round(remainingHours) / 24)}天${Math.round(Math.round(remainingHours) % 24)}小时
📍 中心区间: ${centerRange || '待确定'}

💡 基于当前数据模型预测最终落点约${predictedCenter}条

🔗 Polymarket: https://polymarket.com${currentMarket?.slug ? '/event/' + currentMarket.slug : ''}${REFERRAL}

#ElonMusk #PredictionMarket #X`;
  }, [currentTracking, currentMarket, predictedCenter, apiPace, remainingHours, centerRange, marketTitle]);

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
      <section className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-amber-400" />
            </div>
            推文生成
          </h2>
          <div className="flex gap-2">
            <button
              onClick={openTelegram}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
              Telegram
            </button>
            <button
              onClick={openTwitter}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
              Twitter/X
            </button>
          </div>
        </div>

        <div className="bg-slate-900/50 rounded-xl p-5 mb-4 font-mono text-sm text-slate-300 leading-relaxed whitespace-pre-wrap border border-slate-700">
          {tweetContent}
        </div>

        <button
          onClick={copyToClipboard}
          className={`w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl font-semibold transition-all text-base ${
            copied
              ? 'bg-emerald-500 text-white'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
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
