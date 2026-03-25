import { useState, useMemo } from 'react';
import {
  Clock,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Target,
  Zap,
  Camera,
  Plus,
  Trash2,
  Copy,
  BarChart3,
  ExternalLink,
} from 'lucide-react';
import type {
  TimeParams,
  BaseParams,
  VelocitySnapshot,
  OrderBookEntry,
  PortfolioEntry,
  AnalysisResult,
} from './types';
import { analyzePredictionMarket, generateTweetContent, formatVelocity, formatPercent, formatMarketPrice, formatWeight } from './engine';

const generateId = () => Math.random().toString(36).substr(2, 9);

const defaultTimeParams: TimeParams = {
  totalDuration: 168,
  marketTitle: 'Elon 7天推文总数预测',
  currentTimestamp: Date.now(),
  remainingDays: 7,
  remainingHours: 0,
  remainingMinutes: 0,
};

const defaultBaseParams: BaseParams = {
  currentTweetCount: 250,
};

const defaultVelocitySnapshot: VelocitySnapshot = {
  snapshotCount: 250,
  hoursSinceSnapshot: 1,
};

const defaultOrderBook: OrderBookEntry[] = [
  { id: generateId(), lowerBound: 220, upperBound: 239, yesPrice: 5 },
  { id: generateId(), lowerBound: 260, upperBound: 279, yesPrice: 15 },
  { id: generateId(), lowerBound: 300, upperBound: 319, yesPrice: 25 },
];

const defaultPortfolio: PortfolioEntry[] = [];

function App() {
  const [timeParams, setTimeParams] = useState<TimeParams>(defaultTimeParams);
  const [baseParams, setBaseParams] = useState<BaseParams>(defaultBaseParams);
  const [velocitySnapshot, setVelocitySnapshot] = useState<VelocitySnapshot>(defaultVelocitySnapshot);
  const [orderBook, setOrderBook] = useState<OrderBookEntry[]>(defaultOrderBook);
  const [portfolioPositions] = useState<PortfolioEntry[]>(defaultPortfolio);
  const [cashBalance, setCashBalance] = useState(1000);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'strategy' | 'tweet'>('input');
  const POLYMARKET_URL = 'https://polymarket.com/event/elon-musk-of-tweets-march-20-march-27?r=adul#npOUGOn';

  const analysis: AnalysisResult = useMemo(() => {
    return analyzePredictionMarket(
      timeParams,
      baseParams,
      velocitySnapshot,
      orderBook,
      { cashBalance, positions: portfolioPositions }
    );
  }, [timeParams, baseParams, velocitySnapshot, orderBook, portfolioPositions, cashBalance]);

  const addOrderBookEntry = () => {
    const lastEntry = orderBook[orderBook.length - 1];
    const newLower = lastEntry ? lastEntry.upperBound + 1 : 300;
    const newUpper = newLower + 19;
    setOrderBook([
      ...orderBook,
      { id: generateId(), lowerBound: newLower, upperBound: newUpper, yesPrice: 25 },
    ]);
  };

  const removeOrderBookEntry = (id: string) => {
    setOrderBook(orderBook.filter((e) => e.id !== id));
  };

  const updateOrderBookEntry = (id: string, field: keyof OrderBookEntry, value: number) => {
    setOrderBook(orderBook.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const tweetContent = useMemo(() => {
    return generateTweetContent(analysis, timeParams.marketTitle, baseParams.currentTweetCount);
  }, [analysis, timeParams.marketTitle, baseParams.currentTweetCount]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(tweetContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getSignalColor = (alpha: number) => {
    if (alpha > 1.05) return 'text-teal-600';
    if (alpha < 0.8) return 'text-rose-600';
    return 'text-amber-600';
  };

  const getSignalBg = (alpha: number) => {
    if (alpha > 1.05) return 'bg-teal-50 border-teal-400 text-teal-700';
    if (alpha < 0.8) return 'bg-rose-50 border-rose-400 text-rose-700';
    return 'bg-amber-50 border-amber-400 text-amber-700';
  };

  const getPhaseBadge = (phase: string) => {
    const styles = {
      early: 'bg-blue-100 text-blue-700 border-blue-300',
      mid: 'bg-violet-100 text-violet-700 border-violet-300',
      late: 'bg-orange-100 text-orange-700 border-orange-300',
      endgame: 'bg-rose-100 text-rose-700 border-rose-300',
    };
    return styles[phase as keyof typeof styles] || styles.early;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-stone-100 text-gray-800">
      <header className="bg-white/90 backdrop-blur-sm border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shadow-md">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">马斯克推文预测量化分析</h1>
                <p className="text-xs text-gray-500">Prediction Market Quant Tool</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getPhaseBadge(analysis.strategy.phase)}`}>
                {analysis.strategy.phase === 'early' && '前期布局'}
                {analysis.strategy.phase === 'mid' && '中期调整'}
                {analysis.strategy.phase === 'late' && '后期收缩'}
                {analysis.strategy.phase === 'endgame' && '最后24H'}
              </span>
              <a
                href={POLYMARKET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-semibold rounded-lg hover:from-indigo-600 hover:to-purple-600 transition-all shadow-md"
              >
                <span>进入 Polymarket 下注</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1">
            {[
              { id: 'input', label: '数据输入', icon: Target },
              { id: 'strategy', label: '策略输出', icon: BarChart3 },
              { id: 'tweet', label: '推文生成', icon: Copy },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-teal-500 text-teal-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
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
        {activeTab === 'input' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <section className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
                <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-teal-500" />
                  时间参数
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">市场标题</label>
                    <input
                      type="text"
                      value={timeParams.marketTitle}
                      onChange={(e) => setTimeParams({ ...timeParams, marketTitle: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-teal-400 focus:ring-2 focus:ring-teal-100 focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">总时长 (小时)</label>
                    <input
                      type="number"
                      value={timeParams.totalDuration}
                      onChange={(e) => setTimeParams({ ...timeParams, totalDuration: Number(e.target.value) })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-teal-400 focus:ring-2 focus:ring-teal-100 focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">剩余天数</label>
                    <input
                      type="number"
                      value={timeParams.remainingDays}
                      onChange={(e) => setTimeParams({ ...timeParams, remainingDays: Number(e.target.value) })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-teal-400 focus:ring-2 focus:ring-teal-100 focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">剩余小时</label>
                    <input
                      type="number"
                      value={timeParams.remainingHours}
                      onChange={(e) => setTimeParams({ ...timeParams, remainingHours: Number(e.target.value) })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-teal-400 focus:ring-2 focus:ring-teal-100 focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">剩余分钟</label>
                    <input
                      type="number"
                      value={timeParams.remainingMinutes}
                      onChange={(e) => setTimeParams({ ...timeParams, remainingMinutes: Number(e.target.value) })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-teal-400 focus:ring-2 focus:ring-teal-100 focus:outline-none transition-all"
                    />
                  </div>
                </div>
              </section>

              <section className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
                <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Camera className="w-5 h-5 text-teal-500" />
                  动态快照法
                </h2>
                <p className="text-xs text-gray-400 mb-4">填入你上次查看时的数据，系统自动计算动态时速</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">当前推文总数</label>
                    <input
                      type="number"
                      value={baseParams.currentTweetCount}
                      onChange={(e) => setBaseParams({ ...baseParams, currentTweetCount: Number(e.target.value) })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-teal-400 focus:ring-2 focus:ring-teal-100 focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">上次快照总数</label>
                    <input
                      type="number"
                      value={velocitySnapshot.snapshotCount}
                      onChange={(e) => setVelocitySnapshot({ ...velocitySnapshot, snapshotCount: Number(e.target.value) })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-teal-400 focus:ring-2 focus:ring-teal-100 focus:outline-none transition-all"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">距上次经过小时数</label>
                    <input
                      type="number"
                      step="0.1"
                      value={velocitySnapshot.hoursSinceSnapshot}
                      onChange={(e) => setVelocitySnapshot({ ...velocitySnapshot, hoursSinceSnapshot: Number(e.target.value) })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-teal-400 focus:ring-2 focus:ring-teal-100 focus:outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="mt-4 p-4 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-xl border border-teal-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 font-medium">综合时速：</span>
                    <span className="text-lg font-bold text-teal-600">{formatVelocity(analysis.compositeVelocity)} 条/小时</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-teal-200/50 flex items-center justify-between text-xs text-gray-500">
                    <span>当前权重分配</span>
                    <span>全局 {formatWeight(analysis.velocityWeights.globalWeight)} / 微观 {formatWeight(analysis.velocityWeights.microWeight)}</span>
                  </div>
                </div>
              </section>

              <section className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
                <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-teal-500" />
                  账户状态
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">可用现金 (USD)</label>
                    <input
                      type="number"
                      value={cashBalance}
                      onChange={(e) => setCashBalance(Number(e.target.value))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-teal-400 focus:ring-2 focus:ring-teal-100 focus:outline-none transition-all"
                    />
                  </div>
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-teal-500" />
                    盘口数据
                  </h2>
                  <button
                    onClick={addOrderBookEntry}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 text-white text-xs font-semibold rounded-lg hover:bg-teal-600 transition-colors shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    添加区间
                  </button>
                </div>
                <p className="text-xs text-gray-400 mb-3">YES价格请填整数（如28代表28%）</p>
                <div className="space-y-3">
                  {orderBook.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                      <div className="flex-1 grid grid-cols-3 gap-2">
                        <div>
                          <input
                            type="number"
                            value={entry.lowerBound}
                            onChange={(e) => updateOrderBookEntry(entry.id, 'lowerBound', Number(e.target.value))}
                            className="w-full bg-white border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:border-teal-400 focus:ring-2 focus:ring-teal-100 focus:outline-none transition-all"
                          />
                          <span className="text-xs text-gray-400 mt-1 block text-center">下限</span>
                        </div>
                        <div className="flex items-center justify-center text-gray-400 font-medium">-</div>
                        <div>
                          <input
                            type="number"
                            value={entry.upperBound}
                            onChange={(e) => updateOrderBookEntry(entry.id, 'upperBound', Number(e.target.value))}
                            className="w-full bg-white border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:border-teal-400 focus:ring-2 focus:ring-teal-100 focus:outline-none transition-all"
                          />
                          <span className="text-xs text-gray-400 mt-1 block text-center">上限</span>
                        </div>
                      </div>
                      <div className="w-24">
                        <input
                          type="number"
                          value={entry.yesPrice}
                          onChange={(e) => updateOrderBookEntry(entry.id, 'yesPrice', Number(e.target.value))}
                          className="w-full bg-white border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:border-teal-400 focus:ring-2 focus:ring-teal-100 focus:outline-none transition-all"
                        />
                        <span className="text-xs text-gray-400 mt-1 block text-center">YES价格(%)</span>
                      </div>
                      <button
                        onClick={() => removeOrderBookEntry(entry.id)}
                        className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
                <h2 className="text-base font-semibold text-gray-800 mb-4">核心指标看板</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-cyan-50 to-teal-50 rounded-xl p-4 text-center border border-teal-100">
                    <p className="text-xs text-gray-500 mb-1">全局均速</p>
                    <p className="text-2xl font-bold text-teal-600">{formatVelocity(analysis.globalVelocity)}</p>
                    <p className="text-xs text-gray-400">条/小时</p>
                  </div>
                  <div className="bg-gradient-to-br from-teal-50 to-emerald-50 rounded-xl p-4 text-center border border-emerald-100">
                    <p className="text-xs text-gray-500 mb-1">动态时速</p>
                    <p className="text-2xl font-bold text-emerald-600">{formatVelocity(analysis.microVelocity)}</p>
                    <p className="text-xs text-gray-400">条/小时</p>
                  </div>
                  <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-4 text-center border border-violet-100">
                    <p className="text-xs text-gray-500 mb-1">预期中心落点</p>
                    <p className="text-2xl font-bold text-violet-600">{Math.round(analysis.expectedCenter)}</p>
                    <p className="text-xs text-gray-400">条推文</p>
                  </div>
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 text-center border border-amber-100">
                    <p className="text-xs text-gray-500 mb-1">动态标准差</p>
                    <p className="text-2xl font-bold text-amber-600">{analysis.currentSigma.toFixed(1)}</p>
                    <p className="text-xs text-gray-400">σ</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {activeTab === 'strategy' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <section className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
                  <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-teal-500" />
                    盘口价值比雷达
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-xs text-gray-500 border-b border-gray-200">
                          <th className="text-left py-3 px-2 font-semibold">区间</th>
                          <th className="text-right py-3 px-2 font-semibold">市场价</th>
                          <th className="text-right py-3 px-2 font-semibold">真实概率</th>
                          <th className="text-right py-3 px-2 font-semibold">Alpha</th>
                          <th className="text-center py-3 px-2 font-semibold">信号</th>
                          <th className="text-right py-3 px-2 font-semibold">最低时速</th>
                          <th className="text-right py-3 px-2 font-semibold">最高时速</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.intervals
                          .sort((a, b) => b.alpha - a.alpha)
                          .map((interval) => (
                            <tr
                              key={interval.id}
                              className={`border-b border-gray-100 ${interval.alpha > 1.05 ? 'bg-teal-50/50' : interval.alpha < 0.8 ? 'bg-rose-50/50' : ''}`}
                            >
                              <td className="py-3 px-2 font-semibold text-gray-800">
                                [{interval.lowerBound}-{interval.upperBound}]
                              </td>
                              <td className="py-3 px-2 text-right text-gray-600">
                                {formatMarketPrice(interval.marketPrice)}
                              </td>
                              <td className="py-3 px-2 text-right text-teal-600 font-medium">
                                {formatPercent(interval.trueProbability)}
                              </td>
                              <td className={`py-3 px-2 text-right font-bold ${getSignalColor(interval.alpha)}`}>
                                {interval.alpha.toFixed(2)}
                              </td>
                              <td className="py-3 px-2 text-center">
                                <span className={`px-2 py-1 rounded-lg text-xs font-semibold border ${getSignalBg(interval.alpha)}`}>
                                  {interval.signal === 'buy' && '买入'}
                                  {interval.signal === 'sell' && '卖出'}
                                  {interval.signal === 'hold' && '观望'}
                                </span>
                              </td>
                              <td className="py-3 px-2 text-right text-gray-400 text-xs">
                                {interval.minVelocity === Infinity ? '∞' : formatVelocity(interval.minVelocity)}
                              </td>
                              <td className="py-3 px-2 text-right text-gray-400 text-xs">
                                {interval.maxVelocity === Infinity ? '∞' : formatVelocity(interval.maxVelocity)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {analysis.strategy.alerts.length > 0 && (
                  <section className="bg-white rounded-2xl p-5 border border-rose-200 shadow-sm">
                    <h2 className="text-base font-semibold text-rose-600 mb-4 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      实时警报
                    </h2>
                    <div className="space-y-2">
                      {analysis.strategy.alerts.map((alert, i) => (
                        <div key={i} className="bg-rose-50 rounded-xl p-3 text-sm text-gray-700 border-l-4 border-rose-400">
                          {alert}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="bg-white rounded-2xl p-5 border border-purple-200 shadow-sm">
                  <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-purple-500" />
                    目标区间时速倒推雷达
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {analysis.reverseEngineering.map((item) => (
                      <div
                        key={item.id}
                        className={`p-3 rounded-xl border ${
                          item.status === 'busted'
                            ? 'bg-gray-100 border-gray-300'
                            : item.status === 'passed'
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-purple-50 border-purple-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-base">
                              {item.status === 'busted' ? '❌' : item.status === 'passed' ? '⚠️' : '🎯'}
                            </span>
                            <span className="font-semibold text-gray-800">
                              [{item.lowerBound}-{item.upperBound}]
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 text-xs">
                          {item.status === 'busted' ? (
                            <span className="text-gray-500 font-medium">已击穿</span>
                          ) : item.status === 'passed' ? (
                            <span className="text-amber-600 font-medium">已突破下限</span>
                          ) : (
                            <>
                              <div className="text-purple-600 font-medium">
                                还需 {item.tweetsNeededMin} ~ {item.tweetsNeededMax} 条
                              </div>
                              <div className="text-gray-500 mt-1">
                                均速：{formatVelocity(item.minVelocity)} ~ {formatVelocity(item.maxVelocity)}/h
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="space-y-6">
                <section className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
                  <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-teal-500" />
                    冷血执行官指令
                  </h2>
                  {analysis.strategy.orders.length > 0 ? (
                    <div className="space-y-2">
                      {analysis.strategy.orders.map((order, i) => (
                        <div key={i} className="bg-gray-50 rounded-xl p-3 text-sm font-mono text-gray-700 border border-gray-200">
                          {order}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">暂无操作指令</p>
                  )}
                </section>

                <section className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
                  <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-teal-500" />
                    策略建议
                  </h2>
                  <div className="space-y-2">
                    {analysis.strategy.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-teal-500 mt-0.5">•</span>
                        <span className="text-gray-600">{rec}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
                  <h2 className="text-base font-semibold text-gray-800 mb-4">速度分析</h2>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-500">全局均速</span>
                      <span className="text-sm font-semibold text-teal-600">{formatVelocity(analysis.globalVelocity)}/h</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-500">微观时速</span>
                      <span className="text-sm font-semibold text-emerald-600">{formatVelocity(analysis.microVelocity)}/h</span>
                    </div>
                    <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-700">综合时速</span>
                      <span className="text-lg font-bold text-teal-600">{formatVelocity(analysis.compositeVelocity)}/h</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <div className="flex justify-between items-center text-xs text-gray-400">
                        <span>权重分配</span>
                        <span>全局 {formatWeight(analysis.velocityWeights.globalWeight)} / 微观 {formatWeight(analysis.velocityWeights.microWeight)}</span>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tweet' && (
          <div className="max-w-3xl mx-auto">
            <section className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                  <Copy className="w-5 h-5 text-teal-500" />
                  推文一键生成
                </h2>
                <button
                  onClick={copyToClipboard}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    copied
                      ? 'bg-teal-500 text-white'
                      : 'bg-teal-500 text-white hover:bg-teal-600'
                  }`}
                >
                  {copied ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      已复制!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      复制推文
                    </>
                  )}
                </button>
              </div>
              <div className="bg-gradient-to-r from-gray-50 to-stone-100 rounded-xl p-4 min-h-[300px]">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
                  {tweetContent}
                </pre>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                以上内容已根据当前实时数据自动生成，可直接复制到 Twitter/X 发布
              </p>
            </section>

            <section className="mt-6 bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">数据摘要</h3>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500">当前推文</p>
                  <p className="text-lg font-bold text-gray-800">{baseParams.currentTweetCount}</p>
                </div>
                <div className="bg-teal-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500">预期落点</p>
                  <p className="text-lg font-bold text-teal-600">{Math.round(analysis.expectedCenter)}</p>
                </div>
                <div className="bg-cyan-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500">剩余时间</p>
                  <p className="text-lg font-bold text-cyan-600">
                    {analysis.remainingHoursDecimal >= 24
                      ? `${(analysis.remainingHoursDecimal / 24).toFixed(1)}天`
                      : `${analysis.remainingHoursDecimal.toFixed(1)}h`}
                  </p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500">综合时速</p>
                  <p className="text-lg font-bold text-emerald-600">{formatVelocity(analysis.compositeVelocity)}/h</p>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
