import { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  BarChart3, 
  Grid3X3, 
  ExternalLink, 
  RefreshCw,
  Clock,
  Zap,
  Target,
  Camera,
  ArrowRight,
  AlertCircle,
  Copy,
  CheckCircle,
  FileText,
  Send
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

function getPhase(remainingDays: number): { name: string; class: string } {
  if (remainingDays >= 5) return { name: '前期布局', class: 'bg-blue-500/20 text-blue-400 border-blue-500/40' };
  if (remainingDays >= 3) return { name: '中期调整', class: 'bg-violet-500/20 text-violet-400 border-violet-500/40' };
  if (remainingDays >= 1) return { name: '后期收缩', class: 'bg-orange-500/20 text-orange-400 border-orange-500/40' };
  return { name: '最后24H', class: 'bg-rose-500/20 text-rose-400 border-rose-500/40' };
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
  const [, setIsLoadingGist] = useState(true);
  const [, setIsLoadingTracker] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [currentTweetCount, setCurrentTweetCount] = useState(0);
  const [snapshotCount, setSnapshotCount] = useState<number | ''>('');
  const [hoursSinceSnapshot, setHoursSinceSnapshot] = useState<number | ''>('');

  useEffect(() => {
    const GIST_ID = 'd174b4498c408076ff218e164f24807e';
    
    const fetchGistData = async () => {
      try {
        const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
          headers: { 'Accept': 'application/vnd.github.v3+json' }
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

  const sortedMarkets = useMemo(() => 
    [...gistData].sort((a, b) => new Date(a.end_date).getTime() - new Date(b.end_date).getTime()),
    [gistData]
  );

  const sortedTrackings = useMemo(() => 
    [...trackings].sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime()),
    [trackings]
  );

  const currentTracking = sortedTrackings[selectedMarketIndex] || sortedTrackings[0];
  const currentMarket = sortedMarkets[selectedMarketIndex] || sortedMarkets[0];

  useEffect(() => {
    if (currentTracking?.stats) {
      setCurrentTweetCount(currentTracking.stats.total);
    }
  }, [currentTracking]);

  const phase = currentTracking?.stats ? getPhase(currentTracking.stats.daysRemaining) : getPhase(7);

  const snapshotVal = typeof snapshotCount === 'number' ? snapshotCount : 0;
  const hoursVal = typeof hoursSinceSnapshot === 'number' && hoursSinceSnapshot > 0 ? hoursSinceSnapshot : 0;
  
  const daysElapsed = currentTracking?.stats?.percentComplete ? (currentTracking.stats.percentComplete / 100) * (currentTracking.stats.daysTotal || 7) : 0;
  const hoursElapsed = daysElapsed * 24;
  const currentVelocity = hoursElapsed > 0 ? currentTweetCount / hoursElapsed : 0;
  
  const dynamicVelocity = hoursVal > 0 && snapshotVal > 0 && snapshotVal < currentTweetCount
    ? (currentTweetCount - snapshotVal) / hoursVal 
    : 0;
  
  const compositeVelocity = dynamicVelocity > 0 
    ? currentVelocity * 0.6 + dynamicVelocity * 0.4 
    : currentVelocity;
  
  const daysTotal = currentTracking?.stats?.daysTotal || 7;
  const totalHours = daysTotal * 24;
  const remainingHours = Math.max(0, totalHours - hoursElapsed);

  const probabilityModel = useMemo(() => {
    const C = currentTweetCount;
    const T = remainingHours;
    const R = compositeVelocity;

    const E_rem = T * R;
    const mu = C + E_rem;
    const sigmaBase = Math.sqrt(Math.max(E_rem, 1));
    const dispersionK = 2.2;
    const sigma = Math.max(25, sigmaBase * dispersionK);
    const sigmaCalc = Math.max(25, sigmaBase * 1.5);

    const normalCDF = (x: number): number => {
      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
      const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
      const sign = x < 0 ? -1 : 1;
      x = Math.abs(x) / Math.sqrt(2);
      const t = 1.0 / (1.0 + p * x);
      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
      return 0.5 * (1.0 + sign * y);
    };

    const calculateRawProb = (min: number, max: number): number => {
      const adjustedMin = min - 0.5;
      const adjustedMax = max + 0.5;
      const zMin = (adjustedMin - mu) / sigmaCalc;
      const zMax = (adjustedMax - mu) / sigmaCalc;
      return Math.max(0, normalCDF(zMax) - normalCDF(zMin));
    };

    return { mu, sigma, sigmaCalc, dispersionK, E_rem, calculateRawProb, normalCDF };
  }, [currentTweetCount, remainingHours, compositeVelocity]);

  const predictedCenter = Math.round(probabilityModel.mu);

  const analysisData = useMemo(() => {
    if (!currentMarket?.ranges) return [];
    const ranges = currentMarket.ranges.map(r => ({
      ...r,
      parsed: parseRange(r.range)
    })).filter(d => d.parsed && d.price >= 3);

    const rawProbs = ranges.map(r => ({
      ...r,
      rawProb: r.parsed ? probabilityModel.calculateRawProb(r.parsed.min, r.parsed.max) : 0
    }));

    const totalRawProb = rawProbs.reduce((sum, r) => sum + r.rawProb, 0);

    return rawProbs.map(r => {
      const parsed = r.parsed!;
      const normalizedProb = totalRawProb > 0 ? (r.rawProb / totalRawProb) * 100 : 0;
      const isCenter = probabilityModel.mu >= parsed.min && probabilityModel.mu <= parsed.max;
      return { ...r, normalizedProb, isCenter };
    }).sort((a, b) => (a.parsed?.min || 0) - (b.parsed?.min || 0));
  }, [currentMarket, probabilityModel]);

  const handleSelectMarket = (index: number) => {
    setSelectedMarketIndex(index);
  };

  const calculateIntervalAnalysis = (item: typeof analysisData[0]) => {
    if (!item?.parsed) return null;
    const marketPrice = item.price;
    const trueProb = item.normalizedProb;
    
    const alpha = marketPrice > 0 ? trueProb / marketPrice : 1;
    const edge = trueProb - marketPrice;
    
    const minVelocity = remainingHours > 0 ? (item.parsed.min - currentTweetCount) / remainingHours : Infinity;
    const maxVelocity = remainingHours > 0 ? (item.parsed.max - currentTweetCount) / remainingHours : Infinity;
    
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
    };
  };

  const intervalAnalysis = analysisData.map(calculateIntervalAnalysis).filter(Boolean);

  const reverseEngineering = intervalAnalysis.map(item => {
    if (!item) return null;
    const minNeeded = Math.max(0, item.parsed.min - currentTweetCount);
    const maxNeeded = Math.max(0, item.parsed.max - currentTweetCount);
    return {
      id: item.range,
      lowerBound: item.parsed.min,
      upperBound: item.parsed.max,
      tweetsNeededMin: minNeeded,
      tweetsNeededMax: maxNeeded,
      minVelocity: item.minVelocity,
      maxVelocity: item.maxVelocity,
      status: currentTweetCount > item.parsed.max ? 'busted' : 
              currentTweetCount >= item.parsed.min ? 'passed' : 'active',
    };
  }).filter(Boolean);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      <header className="bg-gray-900/90 backdrop-blur-sm border-b border-gray-700/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg">
                <Zap className="w-5 h-5 text-gray-900" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">马斯克推文预测市场</h1>
                <p className="text-xs text-gray-400">Musk Tweet Prediction Markets</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${phase.class}`}>
                {phase.name}
              </span>
              {lastUpdated && (
                <div className="flex items-center gap-2 text-xs hidden sm:flex">
                  <span className="text-yellow-400 font-semibold">
                    北京 {parseTimestamp(lastUpdated).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-gray-600">
                    美东 {parseTimestamp(lastUpdated).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
              <a
                href={`https://polymarket.com/event/${currentMarket?.slug || 'elon-musk-of-tweets-march-24-march-31'}${REFERRAL}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-semibold rounded-lg hover:from-purple-600 hover:to-indigo-600 transition-all shadow-md"
              >
                <span>进入 Polymarket</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-700/50">
        <div className="max-w-7xl mx-auto px-4">
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
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-yellow-400 text-yellow-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'market' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <section className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Clock className="w-5 h-5 text-yellow-400" />
                        {currentMarket?.title ? parseMarketTitle(currentMarket.title) : '市场数据'}
                      </h2>
                    </div>
                    <button
                      onClick={() => window.location.reload()}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 rounded-lg transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      刷新
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-gray-900/50 rounded-xl p-4 text-center border border-gray-700/30">
                      <p className="text-xs text-gray-400 mb-1">当前总数</p>
                      <p className="text-3xl font-bold text-white">{currentTracking?.stats?.total || '-'}</p>
                      <p className="text-xs text-gray-500 mt-1">条推文</p>
                    </div>
                    <div className="bg-gray-900/50 rounded-xl p-4 text-center border border-gray-700/30">
                      <p className="text-xs text-gray-400 mb-1">今日新增</p>
                      <p className="text-3xl font-bold text-cyan-400">{currentTracking?.stats?.todayTotal || '-'}</p>
                      <p className="text-xs text-gray-500 mt-1">条</p>
                    </div>
                    <div className="bg-gray-900/50 rounded-xl p-4 text-center border border-gray-700/30">
                      <p className="text-xs text-gray-400 mb-1">日均时速</p>
                      <p className="text-3xl font-bold text-yellow-400">{currentTracking?.stats?.pace || '-'}</p>
                      <p className="text-xs text-gray-500 mt-1">条/天</p>
                    </div>
                    <div className="bg-gray-900/50 rounded-xl p-4 text-center border border-gray-700/30">
                      <p className="text-xs text-gray-400 mb-1">剩余时间</p>
                      <p className="text-3xl font-bold text-purple-400">
                        {currentTracking?.stats ? `${currentTracking.stats.daysRemaining}天` : '-'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {currentTracking?.stats && currentTracking.stats.hoursRemaining > 0 
                          ? `${currentTracking.stats.hoursRemaining}小时` 
                          : '结束'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/30">
                    <div className="flex justify-between text-xs text-gray-400 mb-2">
                      <span>完成进度</span>
                      <span>{currentTracking?.stats?.percentComplete || 0}%</span>
                    </div>
                    <div className="w-full bg-gray-700/50 rounded-full h-3">
                      <div 
                        className="bg-gradient-to-r from-cyan-500 via-yellow-400 to-orange-500 h-3 rounded-full transition-all"
                        style={{ width: `${Math.min(currentTracking?.stats?.percentComplete || 0, 100)}%` }}
                      />
                    </div>
                  </div>
                </section>

                {currentMarket && (
                  <section className="bg-gradient-to-br from-purple-900/30 to-indigo-900/30 backdrop-blur-sm rounded-2xl p-6 border border-purple-500/20">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-bold text-white">Polymarket 赔率</h2>
                      <div className="text-right">
                        <p className="text-sm text-gray-400">交易量</p>
                        <p className="text-lg font-bold text-purple-400">
                          ${(currentMarket.volume / 1000000).toFixed(1)}M
                        </p>
                      </div>
                    </div>

                    <div className="mb-4 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-300">预测中心落点</span>
                        <span className="text-xl font-bold text-cyan-400">
                          ~{predictedCenter} 条
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        基于当前时速 {compositeVelocity.toFixed(2)} 条/小时
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      {analysisData.slice(0, 8).map((r) => (
                        <div 
                          key={r.range} 
                          className={`flex items-center justify-between rounded-lg px-4 py-3 ${
                            r.isCenter 
                              ? 'bg-yellow-500/20 border border-yellow-500/40' 
                              : 'bg-gray-800/30 border border-gray-700/20'
                          }`}
                        >
                          <span className={`font-medium ${r.isCenter ? 'text-yellow-400' : 'text-gray-300'}`}>
                            {r.range}
                            {r.isCenter && <span className="ml-2 text-xs text-yellow-500">(中心)</span>}
                          </span>
                          <div className="flex items-center gap-3">
                            <div className="w-24 bg-gray-700/50 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${r.isCenter ? 'bg-yellow-500' : 'bg-purple-500'}`}
                                style={{ width: `${(r.price || 0) * 4}%` }}
                              />
                            </div>
                            <span className={`text-sm font-semibold w-14 text-right ${r.isCenter ? 'text-yellow-400' : 'text-purple-400'}`}>
                              {r.price}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
                  <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Camera className="w-5 h-5 text-cyan-400" />
                    动态快照法
                  </h2>
                  <p className="text-xs text-gray-500 mb-4">输入两次观测的发推数据，系统自动计算动态时速</p>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">当前推文总数</label>
                      <input
                        type="number"
                        value={currentTweetCount}
                        onChange={(e) => setCurrentTweetCount(Number(e.target.value))}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">上次快照总数</label>
                      <input
                        type="number"
                        value={snapshotCount}
                        onChange={(e) => setSnapshotCount(Number(e.target.value))}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">距上次(小时)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={hoursSinceSnapshot}
                        onChange={(e) => setHoursSinceSnapshot(Number(e.target.value))}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="p-4 bg-gradient-to-r from-cyan-500/10 to-teal-500/10 rounded-xl border border-cyan-500/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">动态时速：</span>
                      <span className="text-lg font-bold text-cyan-400">{Math.max(0, dynamicVelocity).toFixed(2)} 条/小时</span>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-cyan-500/20">
                      <span className="text-sm text-gray-300">综合时速：</span>
                      <span className="text-lg font-bold text-yellow-400">{compositeVelocity.toFixed(2)} 条/小时</span>
                    </div>
                  </div>
                </section>
              </div>

              <div className="space-y-6">
                <section className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
                  <h3 className="text-sm font-semibold text-gray-300 mb-4">市场列表</h3>
                  <div className="space-y-2">
                    {sortedMarkets.map((market, i) => {
                      const end = new Date(market.end_date);
                      const now = new Date();
                      const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                      const isActive = i === selectedMarketIndex;
                      
                      return (
                        <button
                          key={market.slug}
                          onClick={() => handleSelectMarket(i)}
                          className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between ${
                            isActive 
                              ? 'bg-yellow-500/10 border-yellow-500/40' 
                              : 'bg-gray-800/50 border-gray-700/30 hover:bg-gray-700/50'
                          }`}
                        >
                          <div>
                            <span className={`text-sm font-semibold ${isActive ? 'text-yellow-400' : 'text-gray-300'}`}>
                              {parseMarketTitle(market.title)}
                            </span>
                            <div className="text-xs text-gray-500 mt-1">剩余 {daysLeft} 天</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-purple-400 text-sm">${(market.volume / 1000000).toFixed(1)}M</span>
                            {isActive && <ArrowRight className="w-4 h-4 text-yellow-400" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {currentTracking?.stats?.daily && currentTracking.stats.daily.length > 0 && (
                  <section className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
                    <h3 className="text-sm font-semibold text-gray-300 mb-4">每日发推统计</h3>
                    <div className="space-y-2">
                      {currentTracking.stats.daily.slice(-7).reverse().map((day, i) => (
                        <div key={day.date || i} className="flex items-center justify-between py-2 border-b border-gray-700/30 last:border-0">
                          <span className="text-sm text-gray-400">{formatDate(day.date)}</span>
                          <span className="text-sm font-semibold text-cyan-400">{day.count}</span>
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <section className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-yellow-400" />
                      盘口价值比雷达
                    </h2>
                    <div className="flex items-center gap-2">
                      {lastUpdated && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-yellow-400 font-semibold">
                            北京 {parseTimestamp(lastUpdated).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-gray-600">
                            美东 {parseTimestamp(lastUpdated).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )}
                      <button
                        onClick={() => window.location.reload()}
                        className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 rounded transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        刷新
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-xs text-gray-400 border-b border-gray-700">
                          <th className="text-left py-3 px-2 font-semibold">区间</th>
                          <th className="text-right py-3 px-2 font-semibold">市场%</th>
                          <th className="text-right py-3 px-2 font-semibold">AI概率%</th>
                          <th className="text-right py-3 px-2 font-semibold">Edge</th>
                          <th className="text-right py-3 px-2 font-semibold">Alpha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {intervalAnalysis
                          .filter(Boolean)
                          .sort((a, b) => (a?.parsed?.min || 0) - (b?.parsed?.min || 0))
                          .map((item) => !item ? null : (
                            <tr
                              key={item.range}
                              className={`border-b border-gray-700/30 ${
                                item.alpha > 1.0 ? 'bg-emerald-500/10' : 
                                item.alpha < 1.0 ? 'bg-rose-500/10' : ''
                              }`}
                            >
                              <td className={`py-3 px-2 font-semibold ${item.isCenter ? 'text-yellow-400' : 'text-white'}`}>
                                [{item.range}]
                              </td>
                              <td className="py-3 px-2 text-right text-gray-400">
                                {item.marketPrice.toFixed(2)}%
                              </td>
                              <td className="py-3 px-2 text-right text-cyan-400 font-medium">
                                {item.trueProb.toFixed(2)}%
                              </td>
                              <td className={`py-3 px-2 text-right font-bold ${
                                item.edge > 0 ? 'text-emerald-400' : 
                                item.edge < 0 ? 'text-rose-400' : 'text-gray-400'
                              }`}>
                                {item.edge > 0 ? '+' : ''}{item.edge.toFixed(2)}%
                              </td>
                              <td className={`py-3 px-2 text-right font-bold ${
                                item.alpha > 1.0 ? 'text-emerald-400' : 
                                item.alpha < 1.0 ? 'text-rose-400' : 'text-gray-400'
                              }`}>
                                {item.alpha.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-500 mt-3">
                    Alpha &gt; 1.0 = 低估(买入) | Alpha &lt; 1.0 = 高估(卖出)
                  </p>
                </section>

                <section className="bg-gradient-to-br from-purple-900/30 to-indigo-900/30 backdrop-blur-sm rounded-2xl p-6 border border-purple-500/20">
                  <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Target className="w-5 h-5 text-purple-400" />
                    目标区间时速倒推雷达
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {reverseEngineering.filter(Boolean).map((item) => !item ? null : (
                      <div
                        key={`${item.lowerBound}-${item.upperBound}`}
                        className={`p-3 rounded-xl border ${
                          item.status === 'busted'
                            ? 'bg-gray-800/50 border-gray-600'
                            : item.status === 'passed'
                            ? 'bg-amber-500/10 border-amber-500/30'
                            : 'bg-purple-500/10 border-purple-500/30'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-sm font-semibold ${
                            item.status === 'busted' ? 'text-gray-500 line-through' : 
                            item.status === 'passed' ? 'text-amber-400' : 'text-white'
                          }`}>
                            [{item.lowerBound}-{item.upperBound}]
                          </span>
                          <span className="text-base">
                            {item.status === 'busted' ? '❌' : item.status === 'passed' ? '⚠️' : '🎯'}
                          </span>
                        </div>
                        <div className="text-xs">
                          {item.status === 'busted' ? (
                            <span className="text-gray-500">已击穿</span>
                          ) : item.status === 'passed' ? (
                            <span className="text-amber-400">已突破下限</span>
                          ) : (
                            <>
                              <div className="text-purple-400">
                                还需 {item.tweetsNeededMin} ~ {item.tweetsNeededMax} 条
                              </div>
                              <div className="text-gray-400 mt-1">
                                时速: {item.minVelocity === Infinity ? '∞' : `${item.minVelocity.toFixed(2)}`} ~ {item.maxVelocity === Infinity ? '∞' : `${item.maxVelocity.toFixed(2)}`}/h
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="bg-gradient-to-br from-emerald-900/30 to-teal-900/30 backdrop-blur-sm rounded-2xl p-6 border border-emerald-500/20">
                  <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                    仓位分配策略建议
                  </h2>
                  <div className="space-y-4">
                    {(() => {
                      const validItems = analysisData.filter(item => item.parsed && item.price >= 3);
                      const mu = probabilityModel.mu;
                      
                      const sortedByProb = [...validItems].sort((a, b) => b.normalizedProb - a.normalizedProb);
                      const bestItem = sortedByProb[0];
                      
                      const bestIdx = validItems.findIndex(i => i.range === bestItem?.range);
                      
                      const aboveItems = bestIdx > 0 ? validItems.slice(0, bestIdx).reverse() : [];
                      const belowItems = bestIdx < validItems.length - 1 ? validItems.slice(bestIdx + 1) : [];

                      return (
                        <>
                          <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/30">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <p className="text-xs text-gray-400">模型预测落点</p>
                                <p className="text-2xl font-bold text-cyan-400">~{Math.round(mu)} 条</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-gray-400">概率最高区间</p>
                                <p className="text-lg font-bold text-white">{bestItem?.range}</p>
                              </div>
                            </div>
                            <div className="flex items-center justify-center gap-2 py-2">
                              {aboveItems.slice(0, 3).map(item => (
                                <span key={item.range} className="px-2 py-1 bg-amber-500/20 text-amber-300 text-xs rounded">
                                  {item.range}
                                </span>
                              ))}
                              <span className="px-3 py-1 bg-emerald-500/30 text-emerald-300 text-sm font-bold rounded border border-emerald-500/50">
                                {bestItem?.range}
                              </span>
                              {belowItems.slice(0, 3).map(item => (
                                <span key={item.range} className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded">
                                  {item.range}
                                </span>
                              ))}
                            </div>
                            <div className="text-center text-xs text-gray-500">
                              ← 低区间 | 当前预测分布 | 高区间 →
                            </div>
                          </div>

                          <div className="p-5 bg-gradient-to-r from-emerald-500/20 to-emerald-600/10 rounded-xl border-2 border-emerald-500/50">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <span className="w-12 h-12 bg-emerald-500/40 rounded-full flex items-center justify-center text-xl">🏆</span>
                                <div>
                                  <p className="text-sm text-emerald-400 font-medium">🥇 最佳落点区间</p>
                                  <p className="text-2xl font-bold text-white">{bestItem?.range}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-3xl font-bold text-emerald-400">$500</p>
                                <p className="text-sm text-gray-400">建议买入 50%</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="bg-gray-900/50 rounded-lg p-3">
                                <p className="text-xs text-gray-400 mb-1">模型预测概率</p>
                                <p className="text-xl font-bold text-white">{bestItem?.normalizedProb.toFixed(1)}%</p>
                              </div>
                              <div className="bg-gray-900/50 rounded-lg p-3">
                                <p className="text-xs text-gray-400 mb-1">市场当前价格</p>
                                <p className="text-xl font-bold text-yellow-400">{bestItem?.price.toFixed(1)}%</p>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            {aboveItems.slice(0, 2).map(item => (
                              <div key={item.range} className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/30">
                                <div className="flex items-center justify-between mb-2">
                                  <div>
                                    <p className="text-xs text-amber-400">↑ 高于最佳</p>
                                    <p className="text-lg font-bold text-amber-200">{item.range}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-lg font-bold text-amber-400">$200</p>
                                    <p className="text-xs text-gray-400">20%</p>
                                  </div>
                                </div>
                                <div className="flex justify-between text-xs text-gray-400">
                                  <span>AI {item.normalizedProb.toFixed(1)}%</span>
                                  <span>价格 {item.price.toFixed(1)}%</span>
                                </div>
                              </div>
                            ))}
                            {belowItems.slice(0, 2).map(item => (
                              <div key={item.range} className="p-4 bg-purple-500/10 rounded-xl border border-purple-500/30">
                                <div className="flex items-center justify-between mb-2">
                                  <div>
                                    <p className="text-xs text-purple-400">↓ 低于最佳</p>
                                    <p className="text-lg font-bold text-purple-200">{item.range}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-lg font-bold text-purple-400">$200</p>
                                    <p className="text-xs text-gray-400">20%</p>
                                  </div>
                                </div>
                                <div className="flex justify-between text-xs text-gray-400">
                                  <span>AI {item.normalizedProb.toFixed(1)}%</span>
                                  <span>价格 {item.price.toFixed(1)}%</span>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="border-t border-gray-700/50 pt-4">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-400">总预算分配</span>
                              <span className="text-white font-bold">$1000</span>
                            </div>
                            <div className="flex gap-1 mt-2 h-4">
                              <div className="bg-emerald-500 rounded-l h-full" style={{ width: '50%' }}></div>
                              <div className="bg-amber-500 h-full" style={{ width: '20%' }}></div>
                              <div className="bg-purple-500 h-full" style={{ width: '20%' }}></div>
                              <div className="bg-yellow-500 rounded-r h-full" style={{ width: '10%' }}></div>
                            </div>
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                              <span>🏆最佳50%</span>
                              <span>↑上方20%</span>
                              <span>↓下方20%</span>
                              <span>备用10%</span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </section>
              </div>

              <div className="space-y-6">
                <section className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
                  <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-cyan-400" />
                    时速分析
                  </h2>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-2 bg-gray-900/50 rounded-lg">
                      <span className="text-sm text-gray-400">全局均速</span>
                      <span className="text-sm font-semibold text-emerald-400">{(currentVelocity).toFixed(2)}/h</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gray-900/50 rounded-lg">
                      <span className="text-sm text-gray-400">动态时速</span>
                      <span className="text-sm font-semibold text-cyan-400">{Math.max(0, dynamicVelocity).toFixed(2)}/h</span>
                    </div>
                    <div className="border-t border-gray-700 pt-3 flex justify-between items-center">
                      <span className="text-sm font-semibold text-white">综合时速</span>
                      <span className="text-lg font-bold text-yellow-400">{compositeVelocity.toFixed(2)}/h</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-700/50 text-xs text-gray-400">
                      剩余 {remainingHours.toFixed(0)} 小时 | 预期落点 ~{predictedCenter} 条
                    </div>
                  </div>
                </section>

                <section className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
                  <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-400" />
                    概率模型参数
                  </h2>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-2 bg-gray-900/50 rounded-lg">
                      <span className="text-sm text-gray-400">预期落点 μ</span>
                      <span className="text-sm font-semibold text-cyan-400">{probabilityModel.mu.toFixed(0)} 条</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gray-900/50 rounded-lg">
                      <span className="text-sm text-gray-400">计算标准差 σ</span>
                      <span className="text-sm font-semibold text-yellow-400">{probabilityModel.sigmaCalc.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gray-900/50 rounded-lg">
                      <span className="text-sm text-gray-400">发疯系数</span>
                      <span className="text-sm font-semibold text-orange-400">{probabilityModel.dispersionK.toFixed(1)} (仅供参考)</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gray-900/50 rounded-lg">
                      <span className="text-sm text-gray-400">剩余推文</span>
                      <span className="text-sm font-semibold text-gray-300">{probabilityModel.E_rem.toFixed(0)} 条</span>
                    </div>
                    <div className="border-t border-gray-700 pt-3 text-xs text-gray-500">
                      基于正态逼近模型 + 连续性修正 + 概率归一化
                    </div>
                  </div>
                </section>

                {currentTracking?.stats?.daily && currentTracking.stats.daily.length > 0 && (
                  <section className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
                    <h3 className="text-sm font-semibold text-gray-300 mb-4">每日发推统计</h3>
                    <div className="space-y-2">
                      {currentTracking.stats.daily.slice(-7).reverse().map((day, i) => (
                        <div key={day.date || i} className="flex items-center justify-between py-2 border-b border-gray-700/30 last:border-0">
                          <span className="text-sm text-gray-400">{formatDate(day.date)}</span>
                          <span className="text-sm font-semibold text-cyan-400">{day.count}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <a
                  href={`https://polymarket.com/event/${currentMarket?.slug || ''}${REFERRAL}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full p-4 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl text-center font-semibold text-white hover:from-purple-600 hover:to-indigo-600 transition-all shadow-lg"
                >
                  <ExternalLink className="w-4 h-4 inline mr-2" />
                  进入 Polymarket 下注
                </a>
              </div>
            </div>
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
            compositeVelocity={compositeVelocity}
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
  compositeVelocity: number;
  remainingHours: number;
  centerRange: string;
}

function TweetGenerator({ currentTracking, currentMarket, predictedCenter, compositeVelocity, remainingHours, centerRange }: TweetGeneratorProps) {
  const [copied, setCopied] = useState(false);

  const marketTitle = currentMarket?.title ? parseMarketTitle(currentMarket.title) : '预测市场';

  const tweetContent = useMemo(() => {
    const phase = currentTracking?.stats ? getPhase(currentTracking.stats.daysRemaining) : getPhase(7);
    const currentTotal = currentTracking?.stats?.total || 0;
    const todayTotal = currentTracking?.stats?.todayTotal || 0;

    return `📊 ${marketTitle} 实时分析

📈 当前进度: ${currentTotal} 条 (今日+${todayTotal})
⚡ 发推时速: ${compositeVelocity.toFixed(2)}条/小时
🎯 预测落点: ~${predictedCenter}条

📍 阶段: ${phase.name}
⏰ 剩余时间: ${Math.floor(remainingHours / 24)}天${Math.round(remainingHours % 24)}小时
📍 中心区间: ${centerRange || '待确定'}

💡 基于当前数据模型预测最终落点约${predictedCenter}条

🔗 Polymarket: https://polymarket.com${currentMarket?.slug ? '/event/' + currentMarket.slug : ''}${REFERRAL}

#ElonMusk #PredictionMarket #X`;
  }, [currentTracking, currentMarket, predictedCenter, compositeVelocity, remainingHours, centerRange, marketTitle]);

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
      <section className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-yellow-400" />
            推文生成
          </h2>
          <div className="flex gap-2">
            <button
              onClick={openTelegram}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-sm rounded-lg border border-blue-500/30 transition-colors"
            >
              <Send className="w-4 h-4" />
              Telegram
            </button>
            <button
              onClick={openTwitter}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 text-sm rounded-lg border border-sky-500/30 transition-colors"
            >
              <Send className="w-4 h-4" />
              Twitter/X
            </button>
          </div>
        </div>

        <div className="bg-gray-900/50 rounded-xl p-4 mb-4">
          <pre className="whitespace-pre-wrap text-sm text-gray-200 leading-relaxed font-sans">
            {tweetContent}
          </pre>
        </div>

        <button
          onClick={copyToClipboard}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
            copied
              ? 'bg-emerald-500 text-white'
              : 'bg-yellow-500 hover:bg-yellow-600 text-gray-900'
          }`}
        >
          {copied ? (
            <>
              <CheckCircle className="w-5 h-5" />
              已复制到剪贴板!
            </>
          ) : (
            <>
              <Copy className="w-5 h-5" />
              一键复制推文内容
            </>
          )}
        </button>
      </section>
    </div>
  );
}
