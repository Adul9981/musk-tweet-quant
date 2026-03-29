import { useState, useMemo, useEffect } from 'react';
import { Download, RefreshCw, ExternalLink, Loader2, TrendingUp } from 'lucide-react';

interface HeatmapData {
  date: string;
  hour: number;
  count: number;
}

interface TrackingData {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  marketLink: string;
  slug: string;
  stats: {
    total: number;
    pace: number;
    percentComplete: number;
    daysElapsed: number;
    daysRemaining: number;
    hoursRemaining: number;
    daysTotal: number;
    daily: Array<{ date: string; count: number; cumulative: number }>;
    todayTotal: number;
  } | null;
}

interface PostData {
  id: string;
  content: string;
  createdAt: string;
}

const getColorForCount = (count: number): string => {
  if (count === 0) return '#0d4f4f';
  if (count <= 3) return '#f5e6a3';
  if (count <= 7) return '#f5d066';
  if (count <= 12) return '#f5b833';
  if (count <= 18) return '#e69500';
  return '#cc7000';
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${date.getMonth() + 1}/${date.getDate()} ${dayNames[date.getDay()]}`;
};

const getETFromBeijing = (bjHour: number): string => {
  const etHour = bjHour - 13;
  if (etHour < 0) return `${etHour + 24}:00 ET`;
  if (etHour >= 24) return `${etHour - 24}:00 ET`;
  return `${etHour}:00 ET`;
};

const getTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;
  return date.toLocaleDateString('zh-CN');
};

const parseTitleToCN = (title: string): string => {
  const match = title.match(/(March|April|May)\s*(\d+)\s*-\s*(March|April|May)\s*(\d+)/i);
  if (match) {
    const startMonth = match[1];
    const startDay = match[2];
    const endMonth = match[3];
    const endDay = match[4];
    const monthMap: { [key: string]: string } = { 'March': '3月', 'April': '4月', 'May': '5月' };
    return `${monthMap[startMonth]}${startDay}日-${monthMap[endMonth]}${endDay}日`;
  }
  const monthMatch = title.match(/(March|April|May)\s+(\d+),?\s*(\d{4})/i);
  if (monthMatch) {
    const month = monthMatch[1];
    const day = monthMatch[2];
    const monthMap: { [key: string]: string } = { 'March': '3月', 'April': '4月', 'May': '5月' };
    return `${monthMap[month]}${day}日`;
  }
  return '';
};

const CACHE_KEY = 'musk_tweet_heatmap_data';
const CACHE_TTL = 60 * 60 * 1000;

interface CacheData {
  data: HeatmapData[];
  lastUpdated: string;
  cachedAt: number;
}

function getCache(): CacheData | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

function setCache(data: HeatmapData[], lastUpdated: string): void {
  try {
    const cacheData: CacheData = {
      data,
      lastUpdated,
      cachedAt: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch {
    console.warn('Failed to save cache');
  }
}

function isCacheValid(): boolean {
  const cache = getCache();
  if (!cache) return false;
  return Date.now() - cache.cachedAt < CACHE_TTL;
}

export function TweetHeatmap() {
  const cached = getCache();
  const initialData = cached?.data || [];
  const initialLastUpdated = cached ? new Date(cached.lastUpdated) : null;
  const initialIsFromCache = !!cached;
  const needsRefresh = cached && !isCacheValid();

  const [data, setData] = useState<HeatmapData[]>(initialData);
  const [isLoading, setIsLoading] = useState(!cached);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [importError, setImportError] = useState('');
  const [hoveredCell, setHoveredCell] = useState<HeatmapData | null>(null);
  const [hoveredPos, setHoveredPos] = useState({ x: 0, y: 0 });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(initialLastUpdated);
  const [isFromCache, setIsFromCache] = useState(initialIsFromCache);
  const [trackings, setTrackings] = useState<TrackingData[]>([]);
  const [latestPosts, setLatestPosts] = useState<PostData[]>([]);

  useEffect(() => {
    if (!needsRefresh) return;
    
    const timer = setTimeout(() => {
      setIsRefreshing(true);
      fetch('/api/elon-tweets')
        .then(res => res.json())
        .then(result => {
          if (result.tweets?.length > 0) {
            setData(result.tweets);
            setLastUpdated(new Date(result.lastUpdated));
            setCache(result.tweets, result.lastUpdated);
            setIsFromCache(false);
          }
        })
        .catch(err => console.error('Silent refresh failed:', err))
        .finally(() => setIsRefreshing(false));
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [needsRefresh]);

  useEffect(() => {
    const fetchXTrackerData = async () => {
      try {
        const [trackingsRes, postsRes] = await Promise.all([
          fetch('/api/xtracker'),
          fetch('/api/elon-posts'),
        ]);
        
        if (trackingsRes.ok) {
          const trackingsData = await trackingsRes.json();
          if (trackingsData.success && trackingsData.trackings) {
            setTrackings(trackingsData.trackings);
          }
        }
        
        if (postsRes.ok) {
          const postsData = await postsRes.json();
          if (postsData.success && postsData.posts) {
            setLatestPosts(postsData.posts.slice(0, 5));
          }
        }
      } catch (err) {
        console.error('Failed to fetch XTracker data:', err);
      }
    };
    
    fetchXTrackerData();
  }, []);

  const now = useMemo(() => new Date(), []);
  const currentBJHour = now.getHours();
  const currentDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const uniqueDates = useMemo(() => {
    const dates = [...new Set(data.map(d => d.date))].sort();
    return dates.slice(-15);
  }, [data]);

  const fetchRealData = async () => {
    setIsLoading(true);
    setIsRefreshing(true);
    setError(null);
    
    try {
      const response = await fetch('/api/elon-tweets');
      const result = await response.json();
      
      if (!response.ok) {
        if (response.status === 402) {
          setError('SocialData 余额不足，请充值');
        } else {
          setError(result.message || '获取数据失败');
        }
        return;
      }
      
      if (result.tweets && result.tweets.length > 0) {
        setData(result.tweets);
        setLastUpdated(new Date(result.lastUpdated));
        setCache(result.tweets, result.lastUpdated);
        setIsFromCache(false);
      } else {
        setError('未获取到数据，请稍后重试');
      }
    } catch (err) {
      setError('网络请求失败');
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleImport = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (Array.isArray(parsed) && parsed.every(item => 
        typeof item.date === 'string' && 
        typeof item.hour === 'number' && 
        typeof item.count === 'number'
      )) {
        setData(parsed);
        setImportError('');
        setShowImport(false);
      } else {
        setImportError('数据格式错误');
      }
    } catch {
      setImportError('JSON 解析失败');
    }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heatmap-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStats = () => {
    const recentData = data.filter(d => uniqueDates.includes(d.date));
    const totalTweets = recentData.reduce((sum, d) => sum + d.count, 0);
    const avgPerDay = uniqueDates.length > 0 ? totalTweets / uniqueDates.length : 0;
    
    const hourCounts: Record<number, number> = {};
    for (const d of recentData) {
      hourCounts[d.hour] = (hourCounts[d.hour] || 0) + d.count;
    }
    const peakHour = Object.entries(hourCounts).reduce((max, [hour, count]) => 
      count > max.count ? { hour: parseInt(hour), count } : max, 
      { hour: 0, count: 0 }
    );
    
    return { totalTweets, avgPerDay, peakHour };
  };

  const stats = getStats();
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const cellSize = 38;

  return (
    <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-yellow-400 flex items-center gap-3">
            <span className="text-3xl">♟</span>
            马斯克发推热力图
          </h3>
          <div className="flex items-center gap-4 mt-2">
            {lastUpdated && (
              <span className="text-xs text-gray-500">
                {isFromCache && <span className="text-yellow-500/60 mr-1">[缓存]</span>}
                更新: {lastUpdated.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchRealData()}
            disabled={isLoading}
            className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-sm rounded-lg transition-colors disabled:opacity-50 border border-cyan-500/30"
          >
            <RefreshCw className={`w-4 h-4 inline mr-1 ${isLoading || isRefreshing ? 'animate-spin' : ''}`} />
            {isLoading ? '加载中...' : isRefreshing ? '刷新中...' : '刷新数据'}
          </button>
          <button
            onClick={exportData}
            className="p-2 bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 rounded-lg"
            title="导出"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="text-sm px-3 py-1.5 bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 rounded-lg"
          >
            {showImport ? '收起' : '导入'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-sm text-red-400">
          {error}
          {error.includes('余额') && (
            <a href="https://socialdata.tools" target="_blank" rel="noopener noreferrer" className="ml-2 underline">
              去充值 <ExternalLink className="w-3 h-3 inline" />
            </a>
          )}
        </div>
      )}

      {isLoading && data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-12 h-12 animate-spin text-cyan-400 mb-4" />
          <p className="text-lg">正在从 SocialData 获取数据...</p>
          <p className="text-sm text-gray-500 mt-2">约需 10-20 秒</p>
        </div>
      )}

      {!isLoading && data.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <p className="text-lg">暂无数据</p>
          <p className="text-sm text-gray-500 mt-2">点击上方按钮获取数据</p>
        </div>
      )}

      {data.length > 0 && (
        <div className="overflow-x-auto pb-4">
          <div className="inline-block">
            <div className="flex gap-1 mb-1 pl-12">
              {hours.map(hour => (
                <div
                  key={hour}
                  className="flex flex-col items-center"
                  style={{ width: cellSize }}
                >
                  <span className="text-xs text-yellow-400 font-medium">{hour}点</span>
                  <span className="text-[9px] text-gray-500">({getETFromBeijing(hour).replace(' ET', '')})</span>
                  {hour === currentBJHour && (
                    <div className="w-1 h-1 bg-cyan-400 rounded-full mt-0.5" />
                  )}
                </div>
              ))}
            </div>
          
            {uniqueDates.map((date) => (
              <div key={date} className="flex items-center gap-1 mb-1">
                <div className="w-14 flex flex-col items-end pr-2 leading-tight">
                  <span className="text-sm text-gray-300 font-bold">{formatDate(date).split(' ')[0]}</span>
                  <span className="text-xs text-gray-500">{formatDate(date).split(' ')[1]}</span>
                </div>
                {hours.map(hour => {
                  const cellData = data.find(d => d.date === date && d.hour === hour);
                  const count = cellData?.count || 0;
                  const isEmpty = count === 0;
                  const isCurrentHour = date === currentDateStr && hour === currentBJHour;
                  
                  return (
                    <div
                      key={hour}
                      className={`relative rounded cursor-pointer transition-all hover:scale-110 hover:z-10 ${
                        isCurrentHour ? 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-gray-900' : ''
                      }`}
                      style={{
                        width: cellSize,
                        height: cellSize,
                        backgroundColor: getColorForCount(count),
                      }}
                      onMouseEnter={(e) => {
                        setHoveredCell(cellData || { date, hour, count: 0 });
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredPos({ x: rect.left + rect.width / 2, y: rect.top });
                      }}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      {!isEmpty && (
                        <span 
                          className="absolute inset-0 flex items-center justify-center text-xs font-bold"
                          style={{ 
                            color: count <= 7 ? '#1a1a2e' : '#ffffff',
                          }}
                        >
                          {count}
                        </span>
                      )}
                      {isCurrentHour && (
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-b-2 border-l-transparent border-r-transparent border-b-cyan-400" />
                      )}
                    </div>
                  );
                })}
                <span className="text-xs text-gray-500 pl-2 w-6">
                  {formatDate(date).split(' ')[1]}
                </span>
                <span className="text-xs font-bold text-yellow-400 w-10 text-right pl-2 border-l border-gray-700">
                  {data.filter(d => d.date === date).reduce((sum, d) => sum + d.count, 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {trackings.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-700/50">
          <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-yellow-400" />
            7天推文预测市场
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...trackings]
              .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
              .slice(0, 3)
              .map((tracking) => {
                const titleCN = parseTitleToCN(tracking.title);
                const remainingText = tracking.stats 
                  ? (tracking.stats.hoursRemaining > 0 
                      ? `${tracking.stats.daysRemaining}天${tracking.stats.hoursRemaining}小时` 
                      : `${tracking.stats.daysRemaining}天`)
                  : '';
                return (
                  <a
                    key={tracking.id}
                    href={tracking.marketLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-gradient-to-br from-gray-800 to-gray-900 hover:from-gray-750 hover:to-gray-850 rounded-xl p-4 border border-yellow-500/20 hover:border-yellow-500/40 transition-all hover:shadow-lg hover:shadow-yellow-500/10 group"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-yellow-400">{titleCN}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400/80 rounded">7天</span>
                        </div>
                        <span className="text-[10px] text-gray-500 truncate block">{tracking.title}</span>
                      </div>
                      <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-yellow-400 transition-colors" />
                    </div>
                    {tracking.stats && (
                      <div className="space-y-2">
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs text-gray-400">当前总数</span>
                          <span className="text-2xl font-bold text-white">{tracking.stats.total}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-gray-700/30 rounded-lg px-2 py-1.5">
                            <div className="text-[10px] text-gray-500">今日</div>
                            <div className="text-sm font-medium text-cyan-400">{tracking.stats.todayTotal}条</div>
                          </div>
                          <div className="bg-gray-700/30 rounded-lg px-2 py-1.5">
                            <div className="text-[10px] text-gray-500">日均</div>
                            <div className="text-sm font-medium text-gray-300">{tracking.stats.pace}条</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">剩余时间</span>
                          <span className="text-gray-300 font-medium">{remainingText}</span>
                        </div>
                        <div className="relative">
                          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                            <span>进度</span>
                            <span>{tracking.stats.percentComplete}%</span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-2">
                            <div 
                              className="bg-gradient-to-r from-cyan-500 to-yellow-400 h-2 rounded-full"
                              style={{ width: `${Math.min(tracking.stats.percentComplete, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </a>
                );
              })}
          </div>
        </div>
      )}

      {latestPosts.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-700/50">
          <h4 className="text-sm font-semibold text-gray-300 mb-3">最新推文</h4>
          <div className="space-y-2">
            {latestPosts.map((post) => {
              const postDate = new Date(post.createdAt);
              const timeAgo = getTimeAgo(postDate);
              const displayContent = post.content.length > 100 
                ? post.content.substring(0, 100) + '...' 
                : post.content;
              return (
                <div key={post.id} className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/30 hover:bg-gray-800/50 hover:border-gray-700/50 transition-colors">
                  <p className="text-sm text-gray-300 leading-relaxed">{displayContent}</p>
                  <span className="text-[10px] text-gray-500 mt-1 block">{timeAgo}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.length > 0 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-700/50">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">图例</span>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#0d4f4f' }} />
              <span className="text-xs text-gray-500 mr-2">无</span>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#f5e6a3' }} />
              <span className="text-xs text-gray-500 mr-2">1-3</span>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#f5d066' }} />
              <span className="text-xs text-gray-500 mr-2">4-7</span>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#f5b833' }} />
              <span className="text-xs text-gray-500 mr-2">8-12</span>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#e69500' }} />
              <span className="text-xs text-gray-500 mr-2">13-18</span>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#cc7000' }} />
              <span className="text-xs text-gray-500">19+</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-cyan-400 rounded-full" />
              <span className="text-gray-400">当前时段</span>
            </div>
            <span className="text-gray-400">
              高峰时段: <span className="text-yellow-400 font-semibold">{stats.peakHour.hour}:00</span>
              <span className="text-gray-500 text-[10px] ml-1">(基于15天历史数据)</span>
            </span>
            <span className="text-gray-500 text-[10px]">右侧为当日发推总数 | 灰色数字为美东时间</span>
          </div>
        </div>
      )}

      {hoveredCell && (
        <div 
          className="fixed z-50 bg-gray-800 border border-yellow-500/50 rounded-lg px-4 py-3 shadow-2xl pointer-events-none"
          style={{
            left: hoveredPos.x,
            top: hoveredPos.y - 100,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="text-sm text-gray-300">{formatDate(hoveredCell.date)}</div>
          <div className="text-base font-bold text-white flex items-center gap-3">
            <span>{hoveredCell.hour.toString().padStart(2, '0')}:00 北京时间</span>
            <span className="text-gray-400 text-sm">({getETFromBeijing(hoveredCell.hour)})</span>
          </div>
          <div className="text-sm mt-1">
            <span className="text-gray-400">发推 </span>
            <span className="text-yellow-400 font-bold text-xl">{hoveredCell.count}</span>
            <span className="text-gray-400"> 条</span>
          </div>
        </div>
      )}

      {showImport && (
        <div className="mt-4 pt-4 border-t border-gray-700/50">
          <h4 className="text-sm font-medium text-gray-300 mb-2">导入 JSON 数据</h4>
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder='[{"date": "2026-03-27", "hour": 14, "count": 8}, ...]'
            className="w-full h-24 bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 font-mono resize-none"
          />
          {importError && <p className="text-xs text-red-400 mt-2">{importError}</p>}
          <button
            onClick={handleImport}
            className="mt-2 px-4 py-1.5 bg-yellow-500/20 text-yellow-400 text-sm rounded-lg border border-yellow-500/30"
          >
            应用
          </button>
        </div>
      )}
    </div>
  );
}
