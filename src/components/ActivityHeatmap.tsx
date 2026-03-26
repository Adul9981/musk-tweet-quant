import { useState } from 'react';
import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';

const DAYS_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const generateMockData = (): number[][] => {
  const data: number[][] = [];
  
  for (let day = 0; day < 7; day++) {
    const row: number[] = [];
    for (let hour = 0; hour < 24; hour++) {
      let base = 0;
      
      if (day === 6 || day === 0) {
        base = hour >= 9 && hour <= 23 ? Math.floor(Math.random() * 15) + 3 : 0;
      } else {
        if (hour >= 0 && hour < 6) base = 0;
        else if (hour >= 6 && hour < 8) base = Math.floor(Math.random() * 5) + 1;
        else if (hour >= 8 && hour < 12) base = Math.floor(Math.random() * 12) + 5;
        else if (hour >= 12 && hour < 14) base = Math.floor(Math.random() * 8) + 2;
        else if (hour >= 14 && hour < 17) base = Math.floor(Math.random() * 10) + 4;
        else if (hour >= 17 && hour < 20) base = Math.floor(Math.random() * 15) + 6;
        else if (hour >= 20 && hour < 23) base = Math.floor(Math.random() * 18) + 8;
        else base = Math.floor(Math.random() * 6) + 2;
      }
      
      if (day === 4 && hour >= 18 && hour <= 22) base += 8;
      if (day === 2 && hour >= 14 && hour <= 16) base += 6;
      if (day === 3 && hour >= 21 && hour <= 23) base += 10;
      
      row.push(Math.min(base, 25));
    }
    data.push(row);
  }
  
  return data;
};

interface HeatmapProps {
  externalData?: number[][];
}

export function ActivityHeatmap({ externalData }: HeatmapProps) {
  const [showImport, setShowImport] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [importError, setImportError] = useState('');
  const [data, setData] = useState<number[][]>(externalData || generateMockData());

  const chartData = {
    series: DAYS_EN.map((day, dayIndex) => ({
      name: `${DAYS_CN[dayIndex]} ${day}`,
      data: data[dayIndex].map((value, hourIndex) => ({
        x: `${hourIndex.toString().padStart(2, '0')}:00`,
        y: value,
      })),
    })),
  };

  const chartOptions: ApexOptions = {
    chart: {
      type: 'heatmap',
      background: 'transparent',
      toolbar: { show: false },
      fontFamily: 'Inter, system-ui, sans-serif',
        animations: {
        enabled: true,
        speed: 800,
      },
    },
    plotOptions: {
      heatmap: {
        radius: 3,
        enableShades: true,
        shadeIntensity: 0.85,
        useFillColorAsStroke: false,
        colorScale: {
          ranges: [
            { from: 0, to: 0, name: '沉默', color: '#1a1a2e' },
            { from: 1, to: 3, name: '低活跃', color: '#16213e' },
            { from: 4, to: 7, name: '一般', color: '#0f3460' },
            { from: 8, to: 12, name: '活跃', color: '#1f4068' },
            { from: 13, to: 17, name: '高活跃', color: '#00d9ff' },
            { from: 18, to: 25, name: '狂发', color: '#00ff88' },
          ],
        },
      },
    },
    dataLabels: { enabled: false },
    stroke: { width: 2, colors: ['#0d1117'] },
    grid: {
      padding: { right: 20 },
    },
    xaxis: {
      labels: {
        rotate: 0,
        style: {
          colors: '#8b949e',
          fontSize: '10px',
        },
      },
      tickAmount: 8,
    },
    yaxis: {
      labels: {
        style: {
          colors: '#c9d1d9',
          fontSize: '11px',
          fontWeight: 500,
        },
      },
    },
    tooltip: {
      theme: 'dark',
      style: {
        fontSize: '12px',
      },
      custom: ({ seriesIndex, dataPointIndex, w }) => {
        const dayName = DAYS_CN[seriesIndex];
        const hour = w.globals.seriesX[seriesIndex][dataPointIndex];
        const value = w.globals.series[seriesIndex][dataPointIndex];
        return `
          <div class="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-xl">
            <div class="font-semibold text-white">${dayName} ${hour}</div>
            <div class="text-sm mt-1">
              <span class="text-gray-400">发推 </span>
              <span class="text-cyan-400 font-bold">${value} 条</span>
            </div>
          </div>
        `;
      },
    },
    theme: { mode: 'dark' },
  };

  const handleImport = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (Array.isArray(parsed) && parsed.length === 7 && parsed.every(row => Array.isArray(row) && row.length === 24)) {
        setData(parsed);
        setImportError('');
        setShowImport(false);
      } else {
        setImportError('数据格式错误：需要 7x24 的二维数组');
      }
    } catch {
      setImportError('JSON 解析失败');
    }
  };

  const getAverageByHour = () => {
    const hourAvg: number[] = [];
    for (let h = 0; h < 24; h++) {
      let sum = 0;
      for (let d = 0; d < 7; d++) sum += data[d][h];
      hourAvg.push(Math.round(sum / 7));
    }
    return hourAvg;
  };

  const peakHours = getAverageByHour().map((v, i) => ({ hour: i, avg: v })).sort((a, b) => b.avg - a.avg).slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-gray-700/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-100 flex items-center gap-2">
              <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              马斯克生物钟热力图
            </h3>
            <p className="text-xs text-gray-500 mt-1">Activity Heatmap · 北京时间 · 近7天统计</p>
          </div>
          <button
            onClick={() => setShowImport(!showImport)}
            className="text-xs px-3 py-1.5 bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 hover:text-gray-300 rounded-lg transition-colors border border-gray-600/30"
          >
            {showImport ? '收起' : '导入数据'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <ReactApexChart
            type="heatmap"
            series={chartData.series}
            options={chartOptions}
            height={280}
            width="100%"
          />
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-700/50">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#1a1a2e' }} />
              <span className="text-gray-500">沉默</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#00d9ff' }} />
              <span className="text-gray-500">活跃</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#00ff88' }} />
              <span className="text-gray-500">狂发</span>
            </div>
          </div>
          <div className="text-xs text-gray-500">
            <span className="text-gray-400">高峰时段：</span>
            {peakHours.map((p, i) => (
              <span key={i} className="text-cyan-400 font-medium ml-1">
                {p.hour.toString().padStart(2, '0')}:00 {i < peakHours.length - 1 ? '· ' : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      {showImport && (
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-gray-700/50">
          <h4 className="text-sm font-medium text-gray-300 mb-2">导入 JSON 数据</h4>
          <p className="text-xs text-gray-500 mb-3">粘贴 7×24 的二维数组，每行代表一天（周一到周日），每列代表一小时（0-23）</p>
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder='[[0,0,0,0,0,1,2,3,8,12,10,8,5,7,12,15,18,20,22,18,15,10,5,2], ...]'
            className="w-full h-32 bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono focus:border-cyan-500 focus:outline-none resize-none"
          />
          {importError && <p className="text-xs text-red-400 mt-2">{importError}</p>}
          <button
            onClick={handleImport}
            className="mt-3 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-sm font-medium rounded-lg transition-colors border border-cyan-500/30"
          >
            应用数据
          </button>
        </div>
      )}
    </div>
  );
}
