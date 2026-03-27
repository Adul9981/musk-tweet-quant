import { useState, useEffect, useMemo } from 'react';
import { Download } from 'lucide-react';

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

interface TweetHeatmapProps {
  externalData?: HeatmapData[];
  apiEndpoint?: string;
}

export function TweetHeatmap({ externalData, apiEndpoint }: TweetHeatmapProps) {
  const [data, setData] = useState<HeatmapData[]>(externalData || generateMockHeatmapData());
  const [showImport, setShowImport] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [importError, setImportError] = useState('');
  const [hoveredCell, setHoveredCell] = useState<HeatmapData | null>(null);
  const [lastRefresh] = useState<Date>(new Date());

  const uniqueDates = useMemo(() => {
    const dates = [...new Set(data.map(d => d.date))].sort();
    return dates.slice(-15);
  }, [data]);

  const fetchData = async () => {
    if (!apiEndpoint) return;
    try {
      const response = await fetch(apiEndpoint);
      if (response.ok) {
        const result = await response.json();
        if (result.heatmap) {
          setData(result.heatmap);
        }
      }
    } catch (error) {
      console.error('Failed to fetch heatmap data:', error);
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
    const avgPerDay = totalTweets / uniqueDates.length;
    const peakHour = recentData.reduce((max, d) => d.count > max.count ? d : max, recentData[0] || { hour: 0, count: 0 });
    return { totalTweets, avgPerDay, peakHour };
  };

  const stats = getStats();
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const cellSize = 36;

  return (
    <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="text-2xl">♟</span>
            马斯克发推热力图
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            过去15天 · 24小时分布
            <span className="text-yellow-400 ml-2">
              共 {stats.totalTweets} 条
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            生成: {lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button
            onClick={exportData}
            className="p-2 bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 hover:text-gray-300 rounded-lg transition-colors"
            title="导出数据"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="text-sm px-4 py-2 bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 rounded-lg transition-colors border border-gray-600/30"
          >
            {showImport ? '收起' : '导入数据'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto pb-4">
        <div className="inline-block">
          <div className="flex gap-1 mb-1 pl-16">
            {hours.map(hour => (
              <div
                key={hour}
                className="text-xs text-gray-500 text-center font-mono"
                style={{ width: cellSize }}
              >
                {hour.toString().padStart(2, '0')}
              </div>
            ))}
          </div>
          
          {uniqueDates.map((date) => (
            <div key={date} className="flex items-center gap-1 mb-1">
              <div className="w-14 text-sm text-gray-400 text-right pr-3 font-medium">
                {getDayLabel(date)}
              </div>
              {hours.map(hour => {
                const cellData = data.find(d => d.date === date && d.hour === hour);
                const count = cellData?.count || 0;
                const isEmpty = count === 0;
                
                return (
                  <div
                    key={hour}
                    className="relative rounded cursor-pointer transition-all hover:scale-105 hover:z-10 hover:ring-2 hover:ring-white/30"
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: getColorForCount(count),
                    }}
                    onMouseEnter={() => setHoveredCell(cellData || null)}
                    onMouseLeave={() => setHoveredCell(null)}
                  >
                    {!isEmpty && (
                      <span 
                        className="absolute inset-0 flex items-center justify-center text-xs font-bold"
                        style={{ 
                          color: count <= 7 ? '#1a1a2e' : '#ffffff',
                          textShadow: count <= 7 ? 'none' : '0 1px 2px rgba(0,0,0,0.3)'
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </div>
                );
              })}
              <span className="text-xs text-gray-500 pl-3 w-16">
                {formatDate(date)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-700/50">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">图例</span>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded" style={{ backgroundColor: '#0d4f4f' }} />
            <span className="text-xs text-gray-500 mr-3">无</span>
            <div className="w-6 h-6 rounded" style={{ backgroundColor: '#f5e6a3' }} />
            <span className="text-xs text-gray-500 mr-3">少</span>
            <div className="w-6 h-6 rounded" style={{ backgroundColor: '#f5d066' }} />
            <span className="text-xs text-gray-500 mr-3">中</span>
            <div className="w-6 h-6 rounded" style={{ backgroundColor: '#f5b833' }} />
            <span className="text-xs text-gray-500 mr-3">多</span>
            <div className="w-6 h-6 rounded" style={{ backgroundColor: '#e69500' }} />
            <span className="text-xs text-gray-500 mr-3">很多</span>
            <div className="w-6 h-6 rounded" style={{ backgroundColor: '#cc7000' }} />
            <span className="text-xs text-gray-500">狂发</span>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <span className="text-gray-500">
            日均: <span className="text-yellow-400 font-semibold">{stats.avgPerDay.toFixed(0)} 条</span>
          </span>
          <span className="text-gray-500">
            高峰: <span className="text-yellow-400 font-semibold">{stats.peakHour?.hour}:00</span>
          </span>
        </div>
      </div>

      {hoveredCell && (
        <div className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 shadow-2xl pointer-events-none">
          <div className="text-sm text-gray-400">{formatDate(hoveredCell.date)}</div>
          <div className="text-lg font-bold text-white">
            {hoveredCell.hour}:00
          </div>
          <div className="text-sm mt-1">
            <span className="text-gray-400">发推 </span>
            <span className="text-yellow-400 font-bold text-xl">{hoveredCell.count}</span>
            <span className="text-gray-400"> 条</span>
          </div>
        </div>
      )}

      {showImport && (
        <div className="mt-6 pt-4 border-t border-gray-700/50">
          <h4 className="text-sm font-medium text-gray-300 mb-2">导入 JSON 数据</h4>
          <p className="text-xs text-gray-500 mb-3">格式: [{`{date: "2026-03-27", hour: 14, count: 8}`}, ...]</p>
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder='[{"date": "2026-03-27", "hour": 14, "count": 8}, ...]'
            className="w-full h-32 bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 font-mono focus:border-yellow-500 focus:outline-none resize-none"
          />
          {importError && <p className="text-xs text-red-400 mt-2">{importError}</p>}
          <button
            onClick={handleImport}
            className="mt-3 px-5 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 text-sm font-medium rounded-lg transition-colors border border-yellow-500/30"
          >
            应用数据
          </button>
        </div>
      )}
    </div>
  );
}
