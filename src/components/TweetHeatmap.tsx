import { useState, useMemo, useEffect } from 'react';
import { Download, RefreshCw, ExternalLink, Loader2 } from 'lucide-react';

interface HeatmapData {
  date: string;
  hour: number;
  count: number;
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

const getDayLabel = (dateStr: string): string => {
  const date = new Date(dateStr);
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return dayNames[date.getDay()];
};

const getETFromBeijing = (bjHour: number): string => {
  const etHour = bjHour - 13;
  if (etHour < 0) return `${etHour + 24}:00 ET`;
  if (etHour >= 24) return `${etHour - 24}:00 ET`;
  return `${etHour}:00 ET`;
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
          <div className="flex justify-center">
            <div className="flex gap-1 mb-1 pl-14">
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
                <div className="w-14 text-sm text-gray-300 text-right pr-3 font-semibold">
                  {getDayLabel(date)}
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
                <span className="text-sm text-gray-500 pl-2 w-14">
                  {formatDate(date).split(' ')[0]}
                </span>
              </div>
            ))}
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
              高峰: <span className="text-yellow-400 font-semibold">{stats.peakHour.hour}:00</span>
            </span>
            <span className="text-gray-500 text-[10px]">默认按北京时间排序，灰色为美东时间</span>
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
