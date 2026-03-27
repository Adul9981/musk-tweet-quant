import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Download } from 'lucide-react';

interface HeatmapData {
  date: string;
  hour: number;
  count: number;
}

const generateMockHeatmapData = (): HeatmapData[] => {
  const data: HeatmapData[] = [];
  const now = new Date();
  
  for (let dayOffset = 14; dayOffset >= 0; dayOffset--) {
    const date = new Date(now);
    date.setDate(date.getDate() - dayOffset);
    const dateStr = date.toISOString().split('T')[0];
    
    for (let hour = 0; hour < 24; hour++) {
      let baseCount = 0;
      
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      if (isWeekend) {
        if (hour >= 10 && hour <= 23) {
          baseCount = Math.floor(Math.random() * 12) + 2;
        }
      } else {
        if (hour >= 6 && hour < 9) baseCount = Math.floor(Math.random() * 6) + 1;
        else if (hour >= 9 && hour < 12) baseCount = Math.floor(Math.random() * 10) + 4;
        else if (hour >= 12 && hour < 14) baseCount = Math.floor(Math.random() * 7) + 2;
        else if (hour >= 14 && hour < 17) baseCount = Math.floor(Math.random() * 9) + 3;
        else if (hour >= 17 && hour < 20) baseCount = Math.floor(Math.random() * 14) + 5;
        else if (hour >= 20 && hour < 23) baseCount = Math.floor(Math.random() * 16) + 6;
        else if (hour >= 23 || hour < 6) baseCount = Math.floor(Math.random() * 5) + 1;
      }
      
      if (dayOfWeek === 4 && hour >= 18 && hour <= 22) baseCount += Math.floor(Math.random() * 8) + 4;
      if (dayOfWeek === 3 && hour >= 21 && hour <= 23) baseCount += Math.floor(Math.random() * 10) + 5;
      if (Math.random() < 0.05) baseCount += Math.floor(Math.random() * 15) + 8;
      
      data.push({
        date: dateStr,
        hour,
        count: Math.min(baseCount, 25),
      });
    }
  }
  
  return data;
};

const getColorForCount = (count: number): string => {
  if (count === 0) return '#1a1a2e';
  if (count <= 2) return '#2d1f1f';
  if (count <= 5) return '#4a2c2a';
  if (count <= 8) return '#c75b39';
  if (count <= 12) return '#e8845f';
  if (count <= 16) return '#f0a868';
  return '#f5d485';
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

interface TweetHeatmapProps {
  externalData?: HeatmapData[];
  apiEndpoint?: string;
}

export function TweetHeatmap({ externalData, apiEndpoint }: TweetHeatmapProps) {
  const [data, setData] = useState<HeatmapData[]>(externalData || generateMockHeatmapData());
  const [isLoading, setIsLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [importError, setImportError] = useState('');
  const [hoveredCell, setHoveredCell] = useState<HeatmapData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const uniqueDates = useMemo(() => {
    const dates = [...new Set(data.map(d => d.date))].sort();
    return dates.slice(-15);
  }, [data]);

  const fetchData = async () => {
    if (!apiEndpoint) return;
    setIsLoading(true);
    try {
      const response = await fetch(apiEndpoint);
      if (response.ok) {
        const result = await response.json();
        if (result.heatmap) {
          setData(result.heatmap);
          setLastRefresh(new Date());
        }
      }
    } catch (error) {
      console.error('Failed to fetch heatmap data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (apiEndpoint) {
      fetchData();
    }
  }, [apiEndpoint]);

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
        setImportError('数据格式错误：需要 [{date, hour, count}, ...]');
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
    const activeHours = recentData.filter(d => d.count > 0).length;
    const avgPerDay = totalTweets / uniqueDates.length;
    const peakHour = recentData.reduce((max, d) => d.count > max.count ? d : max, recentData[0] || { hour: 0, count: 0 });
    return { totalTweets, activeHours, avgPerDay, peakHour };
  };

  const stats = getStats();
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-gray-700/50">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-100 flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2" opacity="0.2" />
              <path d="M7 7h2v10H7V7zm4 3h2v7h-2v-7zm4-5h2v12h-2V5z" />
            </svg>
            马斯克发推热力图
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            过去15天 · 24小时分布 · 
            <span className="text-orange-400 ml-1">
              共 {stats.totalTweets} 条
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            更新: {lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button
            onClick={fetchData}
            disabled={isLoading || !apiEndpoint}
            className="p-1.5 bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 hover:text-gray-300 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={exportData}
            className="p-1.5 bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 hover:text-gray-300 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="text-xs px-3 py-1.5 bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 hover:text-gray-300 rounded-lg transition-colors border border-gray-600/30"
          >
            {showImport ? '收起' : '导入'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="flex gap-1 mb-2 pl-12">
            {hours.map(hour => (
              <div
                key={hour}
                className="text-xs text-gray-500 text-center"
                style={{ width: '20px', fontSize: '9px' }}
              >
                {hour % 3 === 0 ? hour.toString().padStart(2, '0') : ''}
              </div>
            ))}
          </div>
          
          {uniqueDates.map((date) => (
            <div key={date} className="flex items-center gap-1 mb-1">
              <div className="w-11 text-xs text-gray-500 text-right pr-2 text-[10px]">
                {getDayLabel(date)}
              </div>
              {hours.map(hour => {
                const cellData = data.find(d => d.date === date && d.hour === hour);
                const count = cellData?.count || 0;
                return (
                  <div
                    key={hour}
                    className="rounded-sm cursor-pointer transition-all hover:scale-110 hover:z-10"
                    style={{
                      width: '18px',
                      height: '18px',
                      backgroundColor: getColorForCount(count),
                    }}
                    onMouseEnter={(e) => {
                      if (cellData) {
                        setHoveredCell(cellData);
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
                      }
                    }}
                    onMouseLeave={() => setHoveredCell(null)}
                  />
                );
              })}
              <span className="text-xs text-gray-400 pl-2 text-[10px]">
                {formatDate(date)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-700/50">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">少</span>
          {[0, 2, 5, 8, 12, 16, 20].map((level, i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: getColorForCount(level) }}
            />
          ))}
          <span className="text-xs text-gray-500 ml-1">多</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-gray-500">
            均值: <span className="text-orange-400 font-medium">{stats.avgPerDay.toFixed(0)}/天</span>
          </span>
          <span className="text-gray-500">
            高峰: <span className="text-orange-400 font-medium">{stats.peakHour?.hour}:00</span>
          </span>
        </div>
      </div>

      {hoveredCell && (
        <div
          className="fixed z-50 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 shadow-xl pointer-events-none"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y - 60,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="text-xs text-gray-400">{formatDate(hoveredCell.date)}</div>
          <div className="text-sm font-semibold text-white">
            {hoveredCell.hour}:00 - {hoveredCell.count} 条推文
          </div>
        </div>
      )}

      {showImport && (
        <div className="mt-4 pt-4 border-t border-gray-700/50">
          <h4 className="text-sm font-medium text-gray-300 mb-2">导入 JSON 数据</h4>
          <p className="text-xs text-gray-500 mb-3">格式: [{`{date: "2026-03-27", hour: 14, count: 8}`}, ...]</p>
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder='[{"date": "2026-03-27", "hour": 14, "count": 8}, ...]'
            className="w-full h-24 bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono focus:border-orange-500 focus:outline-none resize-none"
          />
          {importError && <p className="text-xs text-red-400 mt-2">{importError}</p>}
          <button
            onClick={handleImport}
            className="mt-3 px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 text-sm font-medium rounded-lg transition-colors border border-orange-500/30"
          >
            应用数据
          </button>
        </div>
      )}
    </div>
  );
}
