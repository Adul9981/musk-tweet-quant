import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, Clock } from 'lucide-react';

export interface RangeSnapshot {
  range: string;
  price: number;
  modelProb: number;
  liquidity: number;
}

export interface PriceSnapshot {
  timestamp: number;
  marketSlug: string;
  tweetCount: number;
  ranges: RangeSnapshot[];
}

const RANGE_COLORS = [
  '#38bdf8', '#34d399', '#fbbf24', '#f472b6',
  '#a78bfa', '#fb923c', '#4ade80', '#60a5fa',
  '#f87171', '#94a3b8', '#2dd4bf', '#e879f9',
];

interface Props {
  history: PriceSnapshot[];
  marketStartDate?: string;
  marketEndDate?: string;
}

export function ProbabilityChart({ history, marketStartDate, marketEndDate }: Props) {
  const [mode, setMode] = useState<'market' | 'model'>('market');

  const allRanges = useMemo(() => {
    if (history.length === 0) return [];
    const rangeSet = new Set<string>();
    history.forEach(s => s.ranges.forEach(r => rangeSet.add(r.range)));
    return [...rangeSet].sort((a, b) => {
      const aMin = parseInt(a.split('-')[0]) || parseInt(a) || 0;
      const bMin = parseInt(b.split('-')[0]) || parseInt(b) || 0;
      return aMin - bMin;
    });
  }, [history]);

  const hasFullDuration = !!(marketStartDate && marketEndDate);
  const totalDays = hasFullDuration
    ? Math.round((new Date(marketEndDate!).getTime() - new Date(marketStartDate!).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // ── 0 snapshots: empty state ────────────────────────────────────────────────
  if (history.length === 0) {
    return (
      <div className="bg-[#162538] rounded-2xl p-10 border border-slate-800/80 text-center">
        <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center mx-auto mb-4">
          <TrendingUp className="w-7 h-7 text-sky-400" />
        </div>
        <p className="text-slate-200 font-semibold text-lg mb-2">概率走势图建立中</p>
        <p className="text-slate-500 text-sm">市场数据加载完成后自动采样</p>
        <p className="text-slate-600 text-xs mt-2">请确保市场概览页面已成功加载数据</p>
      </div>
    );
  }

  // ── 1 snapshot: bar chart of current prices ─────────────────────────────────
  if (history.length < 2) {
    const latest = history[history.length - 1];
    const barData = latest.ranges
      .filter(r => r.price >= 1)
      .map((r, i) => ({
        range: r.range,
        value: mode === 'market' ? r.price : r.modelProb,
        color: RANGE_COLORS[i % RANGE_COLORS.length],
      }));

    const timeAgo = Math.round((Date.now() - latest.timestamp) / 60000);

    return (
      <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-200">各区间概率走势</h2>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
              已采集 1 个快照 · 5分钟后自动采集第2个 · 届时显示走势折线图
            </p>
          </div>
          <div className="flex gap-2">
            {(['market', 'model'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  mode === m
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                {m === 'market' ? '市场赔率' : '模型概率'}
              </button>
            ))}
          </div>
        </div>

        {/* Current snapshot bar preview */}
        <div className="mb-4 p-3 bg-slate-800/40 rounded-xl border border-slate-700/50 flex items-center gap-2 text-xs text-slate-400">
          <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span>当前快照 · {timeAgo < 1 ? '刚刚' : `${timeAgo}分钟前`} · 推文数: {latest.tweetCount || '—'}</span>
          <span className="ml-auto text-slate-500">持续打开页面，每5分钟自动追加一个数据点</span>
        </div>

        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={barData} margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f40" vertical={false} />
            <XAxis
              dataKey="range"
              tick={{ fontSize: 10, fill: '#475569' }}
              angle={-45}
              textAnchor="end"
              interval={0}
            />
            <YAxis
              tickFormatter={v => `${v}%`}
              tick={{ fontSize: 11, fill: '#475569' }}
              width={42}
            />
            <Tooltip
              formatter={(value: unknown) => [`${Number(value).toFixed(1)}%`, mode === 'market' ? '市场赔率' : '模型概率']}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid #1e3a5f',
                background: '#111f30',
              }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {barData.map((entry, i) => (
                <Cell key={i} fill={entry.color} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <p className="mt-3 text-center text-xs text-slate-600">
          当前各区间{mode === 'market' ? '市场赔率' : '模型概率'}分布 · 积累2个以上快照后切换为折线走势图
        </p>
      </div>
    );
  }

  // ── 2+ snapshots: full line chart ───────────────────────────────────────────
  const { chartData, nowIndex } = useMemo(() => {
    const startMs = marketStartDate ? new Date(marketStartDate).getTime() : null;
    const endMs = marketEndDate ? new Date(marketEndDate).getTime() : null;
    const nowMs = Date.now();

    if (!startMs || !endMs) {
      const data = history.map(snap => {
        const point: Record<string, number | string | null> = {
          time: new Date(snap.timestamp).toLocaleString('zh-CN', {
            month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false,
          }),
          timestamp: snap.timestamp,
        };
        snap.ranges.forEach(r => {
          point[r.range] = parseFloat((mode === 'market' ? r.price : r.modelProb).toFixed(1));
        });
        return point;
      });
      return { chartData: data, nowIndex: data.length - 1 };
    }

    const TICK_INTERVAL = 6 * 60 * 60 * 1000;
    const ticks: number[] = [];
    for (let t = startMs; t <= endMs; t += TICK_INTERVAL) ticks.push(t);
    if (ticks[ticks.length - 1] !== endMs) ticks.push(endMs);

    const SNAP_WINDOW = 15 * 60 * 1000;
    let currentNowIndex = ticks.findIndex(t => t >= nowMs);
    if (currentNowIndex === -1) currentNowIndex = ticks.length - 1;

    const data = ticks.map(t => {
      const label = new Date(t).toLocaleString('zh-CN', {
        month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      });
      const point: Record<string, number | string | null> = { time: label, timestamp: t };

      if (t > nowMs + SNAP_WINDOW) {
        allRanges.forEach(r => { point[r] = null; });
        return point;
      }

      let best: PriceSnapshot | null = null;
      let bestDiff = Infinity;
      for (const snap of history) {
        const diff = Math.abs(snap.timestamp - t);
        if (diff < bestDiff && diff < SNAP_WINDOW) { bestDiff = diff; best = snap; }
      }

      allRanges.forEach(r => {
        if (!best) { point[r] = null; return; }
        const rng = best.ranges.find(x => x.range === r);
        point[r] = rng ? parseFloat((mode === 'market' ? rng.price : rng.modelProb).toFixed(1)) : null;
      });
      return point;
    });

    return { chartData: data, nowIndex: currentNowIndex };
  }, [history, mode, marketStartDate, marketEndDate, allRanges]);

  const lastSnap = history[history.length - 1];
  const lastTime = new Date(lastSnap.timestamp).toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const nowLabel = hasFullDuration ? chartData[nowIndex]?.time as string | undefined : undefined;

  return (
    <div className="bg-[#162538] rounded-2xl p-6 border border-slate-800/80">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">各区间概率走势</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {hasFullDuration
              ? `完整 ${totalDays} 天周期 · ${history.length} 个采样点 · 最后更新 ${lastTime}`
              : `${history.length} 个采样点 · 最后更新 ${lastTime}`}
          </p>
        </div>
        <div className="flex gap-2">
          {(['market', 'model'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                mode === m
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-900/40'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              {m === 'market' ? '市场赔率' : '模型概率'}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f40" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: '#475569' }}
            interval={Math.max(0, Math.floor(chartData.length / 6))}
          />
          <YAxis
            tickFormatter={v => `${v}%`}
            tick={{ fontSize: 11, fill: '#475569' }}
            domain={[0, 'auto']}
            width={42}
          />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [
              value !== null ? `${Number(value).toFixed(1)}%` : '—',
              String(name ?? ''),
            ]}
            labelStyle={{ color: '#cbd5e1', fontWeight: 600 }}
            contentStyle={{
              fontSize: 12, borderRadius: 8,
              border: '1px solid #1e3a5f',
              background: '#111f30',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12, color: '#64748b' }} />
          {nowLabel && (
            <ReferenceLine
              x={nowLabel}
              stroke="#38bdf8"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{ value: '现在', position: 'top', fill: '#38bdf8', fontSize: 10 }}
            />
          )}
          {allRanges.map((range, i) => (
            <Line
              key={range}
              type="monotone"
              dataKey={range}
              stroke={RANGE_COLORS[i % RANGE_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-4 p-3 bg-slate-800/40 rounded-xl text-xs text-slate-500 flex items-center justify-between border border-slate-800">
        <span>
          {mode === 'market' ? '市场赔率：来自 Polymarket 实时价格' : '模型概率：基于泊松分布 (已归一化)'}
          {hasFullDuration && ' · 虚线后为未来空白区域'}
        </span>
        <span className="text-slate-600">推文数: {lastSnap.tweetCount || '—'}</span>
      </div>
    </div>
  );
}
