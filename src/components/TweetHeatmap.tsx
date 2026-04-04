import { useState, useMemo, useEffect } from 'react';
import { Download, RefreshCw, ExternalLink, Loader2 } from 'lucide-react';

const XTRACKER_URL = 'https://xtracker.polymarket.com/user/elonmusk';
const MAX_TWEETS_PER_HOUR = 25;

const validateData = (data: HeatmapData[]): boolean => {
  if (!data || data.length === 0) return false;
  const hasAbnormal = data.some(item => item.count > MAX_TWEETS_PER_HOUR);
  return !hasAbnormal;
};

interface HeatmapData {
  date: string;
  hour: number;
  count: number;
}

const getColorForCount = (count: number): string => {
  if (count === 0) return '#e2e8f0';
  if (count <= 2) return '#c7d2fe';
  if (count <= 5) return '#a5b4fc';
  if (count <= 8) return '#818cf8';
  if (count <= 12) return '#6366f1';
  if (count <= 16) return '#4f46e5';
  return '#4338ca';
};

const isAbnormal = (count: number): boolean => count > MAX_TWEETS_PER_HOUR;

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

const CACHE_KEY = 'musk_tweet_heatmap_data';
const CACHE_TTL = 20 * 60 * 1000;

interface CacheData {
  data: HeatmapData[];
  lastUpdated: string;
  cachedAt: number;
}

function getCache(): CacheData | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (!parsed.lastUpdated || !parsed.data) return null;
    return parsed;
  } catch {
    localStorage.removeItem(CACHE_KEY);
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
  if (!validateData(cache.data)) return false;
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
        if (result.error?.includes('credentials') || result.error?.includes('configured')) {
          setError('API 配置错误，请检查环境变量');
        } else {
          setError(result.message || result.error || '获取数据失败');
        }
        return;
      }
      
      if (result.tweets && result.tweets.length > 0) {
        const filteredData = result.tweets.map((item: HeatmapData) => ({
          ...item,
          count: Math.min(item.count, MAX_TWEETS_PER_HOUR)
        }));
        setData(filteredData);
        setLastUpdated(new Date(result.lastUpdated));
        setCache(filteredData, result.lastUpdated);
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
        const filteredData = parsed.map((item: HeatmapData) => ({
          ...item,
          count: Math.min(item.count, MAX_TWEETS_PER_HOUR)
        }));
        setData(filteredData);
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
    
    const blockSize = 4;
    const blockCounts: Record<number, { start: number; count: number; avgCount: number }> = {};
    for (let i = 0; i < 24; i += blockSize) {
      let blockTotal = 0;
      let daysInBlock = 0;
      for (let h = i; h < i + blockSize && h < 24; h++) {
        if (hourCounts[h]) {
          blockTotal += hourCounts[h];
          daysInBlock++;
        }
      }
      const days = uniqueDates.length;
      blockCounts[i] = {
        start: i,
        count: blockTotal,
        avgCount: days > 0 ? blockTotal / days : 0,
      };
    }
    
    const sortedBlocks = Object.values(blockCounts)
      .sort((a, b) => b.avgCount - a.avgCount);
    const topBlocks = sortedBlocks.slice(0, 3);
    
    return { totalTweets, avgPerDay, topBlocks };
  };

  const stats = getStats();
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const cellSize = 38;

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <div>
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-cyan-100 flex items-center justify-center">
                <span className="text-2xl">📊</span>
              </div>
              马斯克发推热力图
            </h3>
          <div className="flex items-center gap-4 mt-2">
            {lastUpdated && (
              <span className="text-xs text-slate-500">
                {isFromCache && <span className="text-amber-500 mr-1">缓存</span>}
                更新: {new Date(lastUpdated).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchRealData()}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading || isRefreshing ? 'animate-spin' : ''}`} />
            {isLoading ? '加载中...' : isRefreshing ? '刷新中...' : '刷新数据'}
          </button>
          <button
            onClick={exportData}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
            title="导出"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="text-sm px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium rounded-lg transition-colors"
          >
            {showImport ? '收起' : '导入'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm text-rose-400">
          {error}
          {error.includes('余额') && (
            <a href="https://socialdata.tools" target="_blank" rel="noopener noreferrer" className="ml-2 underline">
              去充值 <ExternalLink className="w-3 h-3 inline" />
            </a>
          )}
        </div>
      )}

      {isLoading && data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-500 mb-4" />
          <p className="text-lg">正在获取数据...</p>
          <p className="text-sm text-slate-500 mt-2">约需 10-20 秒</p>
        </div>
      )}

      {!isLoading && data.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <p className="text-lg">暂无数据</p>
          <p className="text-sm text-slate-500 mt-2">点击上方按钮获取数据</p>
        </div>
      )}

      {data.length > 0 && (
        <div className="overflow-x-auto pb-4">
          <div className="inline-block min-w-full">
            <div className="flex gap-1 mb-1 pl-14">
              {hours.map(hour => (
                <div
                  key={hour}
                  className="flex flex-col items-center"
                  style={{ width: cellSize }}
                >
                  <span className="text-xs text-slate-400 font-medium">{hour}点</span>
                  <span className="text-[9px] text-slate-500">({getETFromBeijing(hour).replace(' ET', '')})</span>
                  {hour === currentBJHour && (
                    <div className="w-1 h-1 bg-indigo-400 rounded-full mt-0.5" />
                  )}
                </div>
              ))}
            </div>
          
            {uniqueDates.map((date) => {
              const dayTotal = data.filter(d => d.date === date).reduce((sum, d) => sum + d.count, 0);
              return (
                <div key={date} className="flex items-center gap-1 mb-1">
                  <div className="w-14 flex flex-col items-end pr-2 leading-tight">
                    <span className="text-sm text-slate-700 font-bold">{formatDate(date).split(' ')[0]}</span>
                    <span className="text-xs text-slate-500">{formatDate(date).split(' ')[1]}</span>
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
                          isCurrentHour ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-white' : ''
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
                              color: count <= 5 ? '#312e81' : '#ffffff',
                            }}
                          >
                            {count}
                          </span>
                        )}
                        {isAbnormal(count) && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full flex items-center justify-center" title="数据异常">
                            <span className="text-[8px] font-bold text-white">!</span>
                          </div>
                        )}
                        {isCurrentHour && (
                          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-b-2 border-l-transparent border-r-transparent border-b-indigo-600" />
                        )}
                      </div>
                    );
                  })}
                  <span className="text-sm font-bold text-indigo-600 w-12 text-right ml-2">
                    {dayTotal}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.length > 0 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded">北京时间</span>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#e2e8f0' }} />
              <span className="text-xs text-slate-500 mr-2">无</span>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#c7d2fe' }} />
              <span className="text-xs text-slate-500 mr-2">1-2</span>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#a5b4fc' }} />
              <span className="text-xs text-slate-500 mr-2">3-5</span>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#818cf8' }} />
              <span className="text-xs text-slate-500 mr-2">6-8</span>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#6366f1' }} />
              <span className="text-xs text-slate-500 mr-2">9-12</span>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#4f46e5' }} />
              <span className="text-xs text-slate-500">13+</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-indigo-400 rounded-full" />
              <span className="text-slate-400">当前时段</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-slate-400">高频时段:</span>
              {stats.topBlocks.slice(0, 2).map((block, i) => (
                <span key={i} className={`text-xs px-2 py-0.5 rounded ${i === 0 ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-700 text-slate-400'}`}>
                  {block.start}:00-{block.start + 3}:59
                </span>
              ))}
              <span className="text-slate-500 text-[10px]">(4小时区间)</span>
            </div>
            <span className="text-slate-500 text-[10px]">灰色数字为美东时间 | 右侧为每日发推总数</span>
          </div>
        </div>
      )}

      {hoveredCell && (
        <div 
          className="fixed z-50 bg-slate-800 border border-indigo-500/50 rounded-xl px-4 py-3 shadow-xl pointer-events-none"
          style={{
            left: hoveredPos.x,
            top: hoveredPos.y - 100,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="text-sm text-slate-400">{formatDate(hoveredCell.date)}</div>
          <div className="text-base font-bold text-white flex items-center gap-3">
            <span>{hoveredCell.hour.toString().padStart(2, '0')}:00 北京时间</span>
            <span className="text-slate-400 text-sm">({getETFromBeijing(hoveredCell.hour)})</span>
          </div>
          <div className="text-sm mt-1">
            <span className="text-slate-400">发推 </span>
            <span className={`font-bold text-xl ${isAbnormal(hoveredCell.count) ? 'text-rose-400' : 'text-cyan-400'}`}>{hoveredCell.count}</span>
            <span className="text-slate-400"> 条</span>
            {isAbnormal(hoveredCell.count) && (
              <span className="ml-2 text-xs bg-rose-500/30 text-rose-300 px-2 py-0.5 rounded">数据异常</span>
            )}
          </div>
        </div>
      )}

      {showImport && (
        <div className="mt-6 pt-6 border-t border-slate-700">
          <h4 className="text-sm font-medium text-slate-300 mb-2">导入 JSON 数据</h4>
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder='[{"date": "2026-03-27", "hour": 14, "count": 8}, ...]'
            className="w-full h-24 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-300 font-mono resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          {importError && <p className="text-xs text-rose-400 mt-2">{importError}</p>}
          <button
            onClick={handleImport}
            className="mt-3 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors"
          >
            应用
          </button>
        </div>
      )}

      <LatestTweets />
    </div>
  );
}

function LatestTweets() {
  const [posts, setPosts] = useState<Array<{ id: string; content: string; createdAt: string; platformId: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const res = await fetch('https://xtracker.polymarket.com/api/users/elonmusk/posts?limit=20');
        if (res.ok) {
          const data = await res.json();
          if (data.data && Array.isArray(data.data)) {
            setPosts(data.data.slice(0, 10));
          }
        }
      } catch (err) {
        console.error('Failed to fetch posts:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPosts();
  }, []);

  const formatTimeAgo = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    return date.toLocaleDateString('zh-CN');
  };

  const truncateContent = (content: string, maxLength: number = 200): string => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  return (
    <div className="mt-8 pt-6 border-t border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <span className="text-lg">📝</span>
          最新推文
        </h4>
        <a
          href={XTRACKER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors"
        >
          <span>查看全部</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-500">加载中...</p>
      ) : posts.length > 0 ? (
        <div className="space-y-3">
          {posts.map((post) => (
            <a
              key={post.id}
              href={`https://x.com/elonmusk/status/${post.platformId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-slate-900/50 rounded-xl p-4 border border-slate-700 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-colors"
            >
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                {truncateContent(post.content)}
              </p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-slate-500">{formatTimeAgo(post.createdAt)}</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </div>
            </a>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">暂无推文数据</p>
      )}
    </div>
  );
}
