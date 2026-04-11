import { useState, useMemo, useEffect, useCallback } from 'react';
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
  if (count === 0) return '#0d2035';
  if (count <= 2) return '#1a3a6e';
  if (count <= 5) return '#1d4ed8';
  if (count <= 8) return '#2563eb';
  if (count <= 12) return '#3b82f6';
  if (count <= 16) return '#60a5fa';
  return '#93c5fd';
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
    const cacheData: CacheData = { data, lastUpdated, cachedAt: Date.now() };
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

/** Fetch recent posts from xtracker and build hourly heatmap data */
async function fetchFromXtracker(): Promise<HeatmapData[]> {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const tweetsMap = new Map<string, number>();

  let offset = 0;
  const limit = 100;
  let keepGoing = true;

  while (keepGoing) {
    const res = await fetch(
      `https://xtracker.polymarket.com/api/users/elonmusk/posts?limit=${limit}&offset=${offset}`
    );
    if (!res.ok) break;
    const json = await res.json();
    const posts: Array<{ createdAt: string }> = json.data || json.posts || json || [];
    if (!Array.isArray(posts) || posts.length === 0) break;

    let reachedCutoff = false;
    for (const post of posts) {
      const ts = new Date(post.createdAt).getTime();
      if (ts < cutoff) { reachedCutoff = true; break; }

      // Convert to Beijing time (UTC+8)
      const bjDate = new Date(ts + 8 * 60 * 60 * 1000);
      const dateStr = bjDate.toISOString().split('T')[0];
      const hour = bjDate.getUTCHours();
      const key = `${dateStr}-${hour}`;
      tweetsMap.set(key, (tweetsMap.get(key) || 0) + 1);
    }

    if (reachedCutoff || posts.length < limit) break;
    offset += limit;
    if (offset > 2000) break; // safety limit
  }

  return Array.from(tweetsMap.entries()).map(([key, count]) => {
    const [y, m, d, hourStr] = key.split('-');
    return { date: `${y}-${m}-${d}`, hour: parseInt(hourStr), count };
  });
}

export function TweetHeatmap() {
  const cached = getCache();
  const initialData = cached?.data || [];
  const initialLastUpdated = cached ? new Date(cached.lastUpdated) : null;
  const initialIsFromCache = !!cached;

  const [data, setData] = useState<HeatmapData[]>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [importError, setImportError] = useState('');
  const [hoveredCell, setHoveredCell] = useState<HeatmapData | null>(null);
  const [hoveredPos, setHoveredPos] = useState({ x: 0, y: 0 });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(initialLastUpdated);
  const [isFromCache, setIsFromCache] = useState(initialIsFromCache);

  const fetchRealData = useCallback(async () => {
    if (isLoading || isRefreshing) return;
    setIsLoading(true);
    setIsRefreshing(true);
    setError(null);

    try {
      // Try Vercel serverless route first (works in production)
      const response = await fetch('/api/elon-tweets');
      if (response.ok) {
        const result = await response.json();
        if (result.tweets && result.tweets.length > 0) {
          const filteredData = result.tweets.map((item: HeatmapData) => ({
            ...item,
            count: Math.min(item.count, MAX_TWEETS_PER_HOUR),
          }));
          setData(filteredData);
          setLastUpdated(new Date(result.lastUpdated));
          setCache(filteredData, result.lastUpdated);
          setIsFromCache(false);
          return;
        }
      }
      throw new Error('primary API unavailable');
    } catch {
      // Fallback: build heatmap from xtracker posts API (works everywhere)
      try {
        const xtrackerData = await fetchFromXtracker();
        if (xtrackerData.length > 0) {
          const now = new Date().toISOString();
          setData(xtrackerData);
          setLastUpdated(new Date());
          setCache(xtrackerData, now);
          setIsFromCache(false);
          return;
        }
      } catch (fallbackErr) {
        console.error('xtracker fallback failed:', fallbackErr);
      }
      setError('获取数据失败，请重试或手动导入');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isLoading, isRefreshing]);

  // Auto-fetch on mount if cache is missing or stale
  useEffect(() => {
    if (!isCacheValid()) {
      fetchRealData();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const now = useMemo(() => new Date(), []);
  const currentBJHour = now.getHours();
  const currentDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const uniqueDates = useMemo(() => {
    const dates = [...new Set(data.map(d => d.date))].sort();
    return dates.slice(-20);
  }, [data]);

  const handleImport = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (
        Array.isArray(parsed) &&
        parsed.every(
          item =>
            typeof item.date === 'string' &&
            typeof item.hour === 'number' &&
            typeof item.count === 'number'
        )
      ) {
        const filteredData = parsed.map((item: HeatmapData) => ({
          ...item,
          count: Math.min(item.count, MAX_TWEETS_PER_HOUR),
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
      for (let h = i; h < i + blockSize && h < 24; h++) {
        if (hourCounts[h]) blockTotal += hourCounts[h];
      }
      const days = uniqueDates.length;
      blockCounts[i] = { start: i, count: blockTotal, avgCount: days > 0 ? blockTotal / days : 0 };
    }

    const sortedBlocks = Object.values(blockCounts).sort((a, b) => b.avgCount - a.avgCount);
    return { totalTweets, avgPerDay, topBlocks: sortedBlocks.slice(0, 3) };
  };

  const stats = getStats();
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const cellSize = 34;

  return (
    <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center">
              <span className="text-2xl">📊</span>
            </div>
            马斯克发推热力图
          </h3>
          <div className="flex items-center gap-4 mt-2">
            {lastUpdated && (
              <span className="text-xs text-slate-500">
                {isFromCache && <span className="text-amber-400 mr-1">缓存</span>}
                更新:{' '}
                {new Date(lastUpdated).toLocaleTimeString('zh-CN', {
                  timeZone: 'Asia/Shanghai',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchRealData}
            disabled={isLoading || isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading || isRefreshing ? 'animate-spin' : ''}`} />
            {isLoading ? '加载中...' : isRefreshing ? '刷新中...' : '刷新数据'}
          </button>
          <button
            onClick={exportData}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors border border-slate-700"
            title="导出"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="text-sm px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 font-medium rounded-lg transition-colors border border-slate-700"
          >
            {showImport ? '收起' : '导入'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm text-rose-400">
          {error}
        </div>
      )}

      {isLoading && data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-12 h-12 animate-spin text-sky-500 mb-4" />
          <p className="text-lg">正在获取数据...</p>
          <p className="text-sm text-slate-500 mt-2">约需 10-20 秒</p>
        </div>
      )}

      {!isLoading && data.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <p className="text-lg">暂无数据</p>
          <p className="text-sm mt-2">点击上方按钮获取数据</p>
        </div>
      )}

      {data.length > 0 && (
        <div className="overflow-x-auto pb-4">
          <div className="inline-block min-w-full">
            <div className="flex gap-1 mb-1 pl-14">
              {hours.map(hour => (
                <div key={hour} className="flex flex-col items-center" style={{ width: cellSize }}>
                  <span className="text-xs text-slate-400 font-medium">{hour}点</span>
                  <span className="text-[9px] text-slate-600">
                    ({getETFromBeijing(hour).replace(' ET', '')})
                  </span>
                  {hour === currentBJHour && (
                    <div className="w-1 h-1 bg-sky-400 rounded-full mt-0.5" />
                  )}
                </div>
              ))}
            </div>

            {uniqueDates.map(date => {
              const dayTotal = data
                .filter(d => d.date === date)
                .reduce((sum, d) => sum + d.count, 0);
              return (
                <div key={date} className="flex items-center gap-1 mb-1">
                  <div className="w-14 flex flex-col items-end pr-2 leading-tight">
                    <span className="text-sm text-slate-300 font-bold">
                      {formatDate(date).split(' ')[0]}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatDate(date).split(' ')[1]}
                    </span>
                  </div>
                  {hours.map(hour => {
                    const cellData = data.find(d => d.date === date && d.hour === hour);
                    const count = cellData?.count || 0;
                    const isCurrentHour = date === currentDateStr && hour === currentBJHour;

                    return (
                      <div
                        key={hour}
                        className={`relative rounded cursor-pointer transition-all hover:scale-110 hover:z-10 ${
                          isCurrentHour
                            ? 'ring-2 ring-sky-400 ring-offset-1 ring-offset-[#162538]'
                            : ''
                        }`}
                        style={{
                          width: cellSize,
                          height: cellSize,
                          backgroundColor: getColorForCount(count),
                        }}
                        onMouseEnter={e => {
                          setHoveredCell(cellData || { date, hour, count: 0 });
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredPos({ x: rect.left + rect.width / 2, y: rect.top });
                        }}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        {count > 0 && (
                          <span
                            className="absolute inset-0 flex items-center justify-center text-xs font-bold"
                            style={{ color: count <= 5 ? '#bfdbfe' : '#ffffff' }}
                          >
                            {count}
                          </span>
                        )}
                        {isAbnormal(count) && (
                          <div
                            className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full flex items-center justify-center"
                            title="数据异常"
                          >
                            <span className="text-[8px] font-bold text-white">!</span>
                          </div>
                        )}
                        {isCurrentHour && (
                          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-b-2 border-l-transparent border-r-transparent border-b-sky-400" />
                        )}
                      </div>
                    );
                  })}
                  <span className="text-sm font-bold text-sky-400 w-10 text-right">{dayTotal}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.length > 0 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded border border-slate-700">
              北京时间
            </span>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#0d2035' }} />
              <span className="text-xs text-slate-500 mr-2">无</span>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#1a3a6e' }} />
              <span className="text-xs text-slate-500 mr-2">1-2</span>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#1d4ed8' }} />
              <span className="text-xs text-slate-500 mr-2">3-5</span>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#2563eb' }} />
              <span className="text-xs text-slate-500 mr-2">6-8</span>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#3b82f6' }} />
              <span className="text-xs text-slate-500 mr-2">9-12</span>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#60a5fa' }} />
              <span className="text-xs text-slate-500">13+</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-sky-400 rounded-full" />
              <span className="text-slate-500">当前时段</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-slate-500">高频时段:</span>
              {stats.topBlocks.slice(0, 2).map((block, i) => (
                <span
                  key={i}
                  className={`text-xs px-2 py-0.5 rounded ${
                    i === 0 ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {block.start}:00-{block.start + 3}:59
                </span>
              ))}
              <span className="text-slate-600 text-[10px]">(4小时区间)</span>
            </div>
          </div>
        </div>
      )}

      {hoveredCell && (
        <div
          className="fixed z-50 bg-[#111f30] border border-sky-500/40 rounded-xl px-4 py-3 shadow-2xl pointer-events-none"
          style={{
            left: hoveredPos.x,
            top: hoveredPos.y - 100,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="text-sm text-slate-400">{formatDate(hoveredCell.date)}</div>
          <div className="text-base font-bold text-white flex items-center gap-3">
            <span>{hoveredCell.hour.toString().padStart(2, '0')}:00 北京时间</span>
            <span className="text-slate-500 text-sm">({getETFromBeijing(hoveredCell.hour)})</span>
          </div>
          <div className="text-sm mt-1">
            <span className="text-slate-400">发推 </span>
            <span
              className={`font-bold text-xl ${
                isAbnormal(hoveredCell.count) ? 'text-rose-400' : 'text-sky-300'
              }`}
            >
              {hoveredCell.count}
            </span>
            <span className="text-slate-400"> 条</span>
            {isAbnormal(hoveredCell.count) && (
              <span className="ml-2 text-xs bg-rose-500/30 text-rose-300 px-2 py-0.5 rounded">
                数据异常
              </span>
            )}
          </div>
        </div>
      )}

      {showImport && (
        <div className="mt-6 pt-6 border-t border-slate-800">
          <h4 className="text-sm font-medium text-slate-300 mb-2">导入 JSON 数据</h4>
          <textarea
            value={jsonInput}
            onChange={e => setJsonInput(e.target.value)}
            placeholder='[{"date": "2026-03-27", "hour": 14, "count": 8}, ...]'
            className="w-full h-24 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-300 font-mono resize-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
          />
          {importError && <p className="text-xs text-rose-400 mt-2">{importError}</p>}
          <button
            onClick={handleImport}
            className="mt-3 px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-500 transition-colors"
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
  const [posts, setPosts] = useState<
    Array<{ id: string; content: string; createdAt: string; platformId: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const res = await fetch(
          'https://xtracker.polymarket.com/api/users/elonmusk/posts?limit=20'
        );
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

  const truncateContent = (content: string, maxLength = 200): string => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  return (
    <div className="mt-8 pt-6 border-t border-slate-800">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <span className="text-lg">📝</span>
          最新推文
        </h4>
        <a
          href={XTRACKER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded-lg transition-colors"
        >
          <span>查看全部</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-500">加载中...</p>
      ) : posts.length > 0 ? (
        <div className="space-y-3">
          {posts.map(post => (
            <a
              key={post.id}
              href={`https://x.com/elonmusk/status/${post.platformId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-slate-800/40 rounded-xl p-4 border border-slate-700/50 hover:border-sky-500/40 hover:bg-slate-800/70 transition-colors"
            >
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                {truncateContent(post.content)}
              </p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-slate-500">{formatTimeAgo(post.createdAt)}</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-600" />
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
