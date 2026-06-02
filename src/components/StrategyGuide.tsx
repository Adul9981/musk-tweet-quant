import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, AlertTriangle, TrendingUp, TrendingDown, Shield, Clock, Zap, Star } from 'lucide-react';

export function StrategyGuide() {
  const [openSection, setOpenSection] = useState<string | null>('buy');
  const toggle = (id: string) => setOpenSection(prev => prev === id ? null : id);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-[#162538] to-[#0f1a28] overflow-hidden shadow-xl">
        <div className="h-1 bg-gradient-to-r from-emerald-500 via-emerald-500 to-teal-500" />
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">马斯克推文市场 · 操作手册</h1>
              <p className="text-xs text-slate-500 mt-0.5">简化版 · 只讲操作，不讲数学</p>
            </div>
          </div>
          <div className="p-4 bg-emerald-950/60 rounded-xl border border-emerald-500/20">
            <p className="text-sm text-slate-300 leading-relaxed">
              <span className="text-emerald-300 font-bold">核心思路：</span>
              中心落点区间带来<span className="text-emerald-300 font-semibold">稳定基础收益</span>，
              最佳盈亏比区间带来<span className="text-yellow-300 font-semibold">超额收益</span>，
              翼仓做保险按时减仓——
              <span className="text-amber-300 font-semibold">规则写死，不靠临场判断。</span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Section 1: 什么时候买 ── */}
      <Section id="buy" title="什么时候买、买多少" icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} open={openSection === 'buy'} onToggle={() => toggle('buy')} accent="from-emerald-500 to-teal-500">
        <div className="space-y-4">
          <p className="text-xs text-slate-400">以总资金 $5000 为例，可按比例换算。每期市场为期7天，以北京时间24:00结束。</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/60">
                  <th className="text-left py-2.5 px-3 text-xs font-bold text-slate-400 uppercase tracking-wide">时机</th>
                  <th className="text-left py-2.5 px-3 text-xs font-bold text-slate-400 uppercase tracking-wide">买什么</th>
                  <th className="text-right py-2.5 px-3 text-xs font-bold text-slate-400 uppercase tracking-wide">金额</th>
                  <th className="text-left py-2.5 px-3 text-xs font-bold text-slate-400 uppercase tracking-wide">目的</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-800/60 hover:bg-slate-800/20 transition-colors">
                  <td className="py-3 px-3">
                    <p className="font-bold text-emerald-300">倒数第三天上午</p>
                    <p className="text-xs text-slate-400 mt-0.5">（距到期 2.5–3天）</p>
                  </td>
                  <td className="py-3 px-3 text-slate-300">中心区间 60% + 上翼 28% + 下翼 12%</td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">$1250</td>
                  <td className="py-3 px-3 text-slate-400 text-xs">分散建仓，不押单一区间</td>
                </tr>
                <tr className="border-b border-slate-800/60 hover:bg-slate-800/20 transition-colors">
                  <td className="py-3 px-3">
                    <p className="font-bold text-emerald-300">倒数第二天</p>
                    <p className="text-xs text-slate-400 mt-0.5">（距到期 1.5–2.5天）</p>
                  </td>
                  <td className="py-3 px-3 text-slate-300">集中加仓中心区间（主力仓）</td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">$2000</td>
                  <td className="py-3 px-3 text-slate-400 text-xs">落点更确定，重仓押注</td>
                </tr>
                <tr className="border-b border-slate-800/60 hover:bg-slate-800/20 transition-colors bg-yellow-500/5">
                  <td className="py-3 px-3">
                    <p className="font-bold text-yellow-300 flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5" />最后一天上午
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">（距到期 1–1.5天）</p>
                  </td>
                  <td className="py-3 px-3 text-slate-300">
                    <p>卖翼仓 40% 同时——</p>
                    <p className="text-yellow-300 text-xs mt-0.5">寻找最佳盈亏比区间，少量押注</p>
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-yellow-400">$200–300</td>
                  <td className="py-3 px-3 text-slate-400 text-xs">用中心稳定收益的一部分博超额</td>
                </tr>
                <tr className="border-b border-slate-800/60 hover:bg-slate-800/20 transition-colors bg-teal-500/5">
                  <td className="py-3 px-3 font-bold text-teal-300">任意时间（机会单）</td>
                  <td className="py-3 px-3 text-slate-300">中心附近区间价格跌到 8% 以下时少量买入</td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-teal-400">$50–100</td>
                  <td className="py-3 px-3 text-slate-400 text-xs">低价保险，扩大安全边界</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-medium text-slate-500">预留不动</td>
                  <td className="py-3 px-3 text-slate-600">—</td>
                  <td className="py-3 px-3 text-right font-mono text-slate-500">$750</td>
                  <td className="py-3 px-3 text-slate-600 text-xs">异常情况下的机动资金</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 超额收益策略说明 */}
          <div className="p-4 bg-yellow-950/40 rounded-xl border border-yellow-500/25">
            <p className="text-xs font-bold text-yellow-300 mb-2 flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5" />
              超额收益策略（最后一天上午）
            </p>
            <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
              <p>在工具「实时操作建议」区域，会自动找出当前<span className="text-yellow-300 font-semibold">市价远低于模型概率</span>的区间（EV指数 &gt; 1.25），即「价格被低估的区间」。</p>
              <p>策略：此时中心仓位已有浮动盈利，可以用浮盈的 <span className="text-yellow-300 font-semibold">10–15%</span> 买入最佳盈亏比区间，实现「中心保底 + 翼仓超额」双层结构。</p>
              <p className="text-slate-500">注意：这是小仓位博弈，不是主力仓。若无明显价值区间（EV指数 &lt; 1.25），跳过即可。</p>
            </div>
          </div>

          <div className="p-3 bg-rose-950/40 rounded-xl border border-rose-500/20 text-xs">
            <p className="font-bold text-rose-300 mb-1.5">⚠️ 不建议这样做</p>
            <ul className="space-y-1 text-slate-400">
              <li>· 距到期超过3天就重仓入场（预测不准，容易买错区间）</li>
              <li>· 同一期内无限补仓（加仓应有明确计划，不是凭感觉）</li>
              <li>· 把全部资金都押在超额收益机会上（它是辅助，不是主策略）</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* ── Section 2: 什么时候卖 ── */}
      <Section id="sell" title="什么时候卖（固定规则，不靠感情）" icon={<TrendingDown className="w-4 h-4 text-amber-400" />} open={openSection === 'sell'} onToggle={() => toggle('sell')} accent="from-amber-500 to-orange-500">
        <div className="space-y-4">
          <p className="text-xs text-slate-400">把卖出时间写成规则，不用在关键时刻临时决定，心理压力会小很多。</p>

          <div>
            <p className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">翼仓减仓计划（上翼 + 下翼）</p>
            <div className="space-y-2">
              {[
                { time: '最后一天上午（距到期1–1.5天）', action: '各卖出 40%', note: '同时评估是否有超额收益机会', color: 'border-l-amber-400', bg: 'bg-amber-950/30' },
                { time: '最后一天晚上（距到期0.5–1天）', action: '再卖剩余 50%', note: '此时翼仓只剩最初的30%仓位', color: 'border-l-orange-400', bg: 'bg-orange-950/30' },
                { time: '到期前12小时',                   action: '翼仓全部清仓', note: '不留任何翼仓持仓，专注等待中心结算', color: 'border-l-rose-400', bg: 'bg-rose-950/30' },
              ].map((step, i) => (
                <div key={i} className={`pl-4 border-l-2 ${step.color} py-2.5 px-3 rounded-r-xl ${step.bg}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-200">{step.time}</span>
                    <span className="text-sm font-bold text-amber-400">{step.action}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{step.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">中心仓位止盈（价格触发）</p>
            <div className="space-y-2">
              {[
                { trigger: '中心区间涨到 65–74%', action: '卖出 20%，锁定部分收益', note: '卖完还剩80%，中奖潜力仍然很大', color: 'border-teal-500/30 bg-teal-950/30' },
                { trigger: '中心区间涨到 75% 以上', action: '再卖 30%，共减仓50%', note: '到这个价位赔率极低，减仓是理性的', color: 'border-emerald-500/30 bg-emerald-950/40' },
              ].map((step, i) => (
                <div key={i} className={`p-3 rounded-xl border ${step.color}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-emerald-300">{step.trigger}</span>
                    <span className="text-sm font-bold text-emerald-400">{step.action}</span>
                  </div>
                  <p className="text-xs text-slate-500">{step.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/40 text-xs">
            <p className="font-bold text-slate-200 mb-1">卖出后它反而涨了，怎么办？</p>
            <p className="text-slate-400 leading-relaxed">卖出翼仓之后翼仓涨了——这不是错误，这是正确的风险管理。预测市场的利润来自<span className="text-emerald-300">多次操作的平均收益</span>，不是某一次押对。翼仓归零的次数远多于中奖的次数。</p>
          </div>
        </div>
      </Section>

      {/* ── Section 3: 异常情况 ── */}
      <Section id="exception" title="出现异常情况怎么办" icon={<Zap className="w-4 h-4 text-yellow-400" />} open={openSection === 'exception'} onToggle={() => toggle('exception')} accent="from-yellow-500 to-amber-500">
        <div className="space-y-3">
          {[
            {
              title: '马斯克今天发推速度突然很快（速率偏高预警）',
              action: '延迟卖出上翼，观察是否持续。若持续2小时以上，考虑少量补买上翼。',
              color: 'border-amber-500/40 bg-amber-950/30',
            },
            {
              title: '马斯克今天发推速度突然很慢（速率偏低预警）',
              action: '延迟卖出下翼，观察是否持续。若持续2小时以上，考虑补买下翼低价保险。',
              color: 'border-emerald-500/40 bg-blue-950/30',
            },
            {
              title: '预测落点（µ）在一天内移动超过一个区间（20条）',
              action: '先不加仓，等落点稳定2小时以上，再重新确认中心区间后执行计划。',
              color: 'border-teal-500/40 bg-teal-950/30',
            },
            {
              title: '中心区间价格跌到入场价的40%以下，且模型概率也很低',
              action: '考虑止损，把剩余资金转移到当前中心区间。不要死守。',
              color: 'border-rose-500/40 bg-rose-950/30',
            },
          ].map((item, i) => (
            <div key={i} className={`p-3.5 rounded-xl border ${item.color}`}>
              <p className="text-sm font-bold text-slate-200 mb-1.5 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                {item.title}
              </p>
              <p className="text-xs text-slate-400 pl-6 leading-relaxed">→ {item.action}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Section 4: 心理备忘 ── */}
      <Section id="mindset" title="心理备忘" icon={<Shield className="w-4 h-4 text-emerald-400" />} open={openSection === 'mindset'} onToggle={() => toggle('mindset')} accent="from-emerald-500 to-teal-500">
        <div className="space-y-3">
          {[
            {
              q: '卖了翼仓，结果它中奖了，怎么办？',
              a: '你没有做错。翼仓赔率是5–8倍，但中奖概率只有15–20%。长期来看，按计划卖出比死守期望值更高。这次是偶然，不代表策略错了。',
            },
            {
              q: '中心区间加了很多，突然很慌怎么办？',
              a: '先看模型的预测落点（µ）是否还在中心区间内。如果是，说明策略没变化，你只是在正常价格波动中焦虑。如果µ已经移走了一个区间，才需要调整。',
            },
            {
              q: '要不要一直盯着价格看？',
              a: '距到期3天以上：每6小时看一次即可。距到期1–3天：每2–3小时看一次。最后一天：需要随时关注，执行翼仓减仓和超额机会评估。到期前12小时：翼仓必须清仓。',
            },
            {
              q: '为什么利润总是来自没有重仓的区间？',
              a: '因为你重仓的区间是模型认为最可能的区间，它的赔率往往已经被市场定价得比较高了。翼仓和最佳盈亏比区间赔率低、潜在回报高——这是预测市场的结构特征，超额收益策略就是利用这个特征。',
            },
          ].map((item, i) => (
            <div key={i} className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <p className="text-sm font-bold text-emerald-300 mb-2">Q: {item.q}</p>
              <p className="text-xs text-slate-400 leading-relaxed">A: {item.a}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Summary card ── */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-[#162538] to-[#0f1a28] overflow-hidden shadow-xl">
        <div className="h-0.5 bg-gradient-to-r from-emerald-500 via-emerald-500 via-amber-500 to-rose-500" />
        <div className="p-5">
          <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            一张纸总结（以北京时间24:00到期为基准）
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center text-xs">
            {[
              { label: '倒数第三天上午', sublabel: '距到期2.5–3天', value: '第一次建仓',  color: 'text-emerald-300',    bg: 'bg-emerald-950/60 border-emerald-500/30', dot: 'bg-emerald-500' },
              { label: '倒数第二天',     sublabel: '距到期1.5–2.5天', value: '主力加仓中心', color: 'text-emerald-300', bg: 'bg-emerald-950/60 border-emerald-500/30', dot: 'bg-emerald-500' },
              { label: '最后一天上午',   sublabel: '距到期1–1.5天',  value: '翼减+超额',  color: 'text-yellow-300',  bg: 'bg-yellow-950/50 border-yellow-500/30', dot: 'bg-yellow-500' },
              { label: '最后一天晚上',   sublabel: '距到期0.5–1天',  value: '翼仓继续减',  color: 'text-amber-300',   bg: 'bg-amber-950/50 border-amber-500/30', dot: 'bg-amber-500' },
              { label: '到期前12小时',   sublabel: '最终阶段',        value: '翼仓清仓',    color: 'text-rose-300',    bg: 'bg-rose-950/50 border-rose-500/30', dot: 'bg-rose-500' },
            ].map((step, i) => (
              <div key={i} className={`p-3 rounded-xl border ${step.bg}`}>
                <div className={`w-2 h-2 rounded-full ${step.dot} mx-auto mb-2`} />
                <p className="text-slate-400 text-xs leading-tight">{step.label}</p>
                <p className="text-slate-500 text-xs mb-1">{step.sublabel}</p>
                <p className={`font-bold text-xs ${step.color}`}>{step.value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 text-center mt-4">
            中心区间是稳定收益来源 · 超额机会是锦上添花 · 翼仓按时减仓，不靠临场判断
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Collapsible section ────────────────────────────────────────────────────────
function Section({ id, title, icon, open, onToggle, children, accent }: {
  id: string; title: string; icon: React.ReactNode; accent: string;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  void id;
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-[#162538] to-[#0f1a28] overflow-hidden shadow-lg">
      {open && <div className={`h-0.5 bg-gradient-to-r ${accent}`} />}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-800/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${accent} flex items-center justify-center`}>
            {icon}
          </div>
          <span className="text-sm font-bold text-slate-200">{title}</span>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-slate-500" />
          : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-slate-800/60 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}
