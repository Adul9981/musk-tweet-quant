import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, BellOff, Send, CheckCircle, XCircle, Settings, Loader2 } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────
export interface TelegramConfig {
  workerUrl: string;   // Cloudflare Worker URL
  botToken: string;    // Telegram Bot Token
  chatId: string;      // Telegram Chat ID
  enabled: boolean;
}

export interface AlertInput {
  mu: number;                  // predicted center
  remainingDays: number;
  currentTweetCount: number;
  todayTotal: number;
  apiPace: number;             // tweets/day average
  analysisData: Array<{
    range: string;
    price: number;
    realProb: number;
    isCenter?: boolean;
    parsed: { min: number; max: number } | null;
  }>;
}

interface SentRecord {
  key: string;
  sentAt: number;
}

// ── Constants ──────────────────────────────────────────────────────────
const CONFIG_KEY  = 'telegram_config_v1';
const SENT_KEY    = 'telegram_sent_v1';
const COOLDOWN_MS = 6 * 60 * 60 * 1000;  // 同一条预警 6 小时内不重复发

const DEFAULT_CONFIG: TelegramConfig = {
  workerUrl: '', botToken: '', chatId: '', enabled: false,
};

// ── Alert engine ────────────────────────────────────────────────────────
function buildAlerts(input: AlertInput): Array<{ key: string; message: string; emoji: string; label: string }> {
  const alerts: Array<{ key: string; message: string; emoji: string; label: string }> = [];
  const { mu, remainingDays, currentTweetCount, todayTotal, apiPace, analysisData } = input;

  const center = analysisData.find(r => r.isCenter);
  const centerMax = center?.parsed?.max ?? 0;
  const centerMin = center?.parsed?.min ?? 0;
  const daysLabel = remainingDays < 1
    ? `${Math.round(remainingDays * 24)} 小时`
    : `${remainingDays.toFixed(1)} 天`;

  // 1. 操作阶段变更
  const phases: Array<{ key: string; range: [number, number]; label: string; action: string }> = [
    { key: 'phase_entry1',    range: [2.5, 3.0], label: '第一次建仓窗口开启',   action: '可分散布局中心+两翼，使用总资金 25%' },
    { key: 'phase_entry2',    range: [1.5, 2.5], label: '加仓窗口',            action: '落点趋稳，集中加码中心区间，部署总资金 40%' },
    { key: 'phase_wing1',     range: [1.0, 1.5], label: '翼仓开始减仓',        action: '今晚减持翼仓 40%，寻找超额机会' },
    { key: 'phase_wing2',     range: [0.5, 1.0], label: '翼仓继续减仓',        action: '再减 50%，专注等待中心区间结算' },
    { key: 'phase_final',     range: [0.0, 0.5], label: '临近结算 · 最终阶段', action: '翼仓全部清仓，中心 >65% 可止盈 20%' },
  ];
  for (const p of phases) {
    if (remainingDays >= p.range[0] && remainingDays < p.range[1]) {
      alerts.push({
        key: p.key,
        emoji: '⏰',
        label: p.label,
        message: [
          `⏰ <b>${p.label}</b>`,
          ``,
          `距到期还剩 <b>${daysLabel}</b>，预测落点 <b>~${Math.round(mu)} 条</b>`,
          center ? `当前落点区间：<b>${center.range}</b>（赔率 ${center.price.toFixed(0)}%）` : '',
          ``,
          `📌 ${p.action}`,
        ].filter(Boolean).join('\n'),
      });
      break;
    }
  }

  // 2. 落点接近区间边界
  if (centerMax > 0 && center) {
    const distUp   = centerMax - mu;
    const distDown = mu - centerMin;
    const dist     = Math.min(distUp, distDown);
    if (dist <= 10 && dist >= 0) {
      const side = distUp < distDown ? '上' : '下';
      const borderVal = distUp < distDown ? centerMax : centerMin;
      alerts.push({
        key: `boundary_${center.range}_${Math.floor(mu / 5)}`,
        emoji: '🚨',
        label: '落点接近区间边界',
        message: [
          `🚨 <b>落点接近区间${side}边界</b>`,
          ``,
          `预测落点 <b>~${Math.round(mu)} 条</b>，距 ${side}边界 <b>${Math.round(dist)} 条</b>（边界值：${borderVal}）`,
          `落点若偏移可能跨入相邻区间，建议评估是否在两侧区间分仓。`,
          ``,
          `⏱ 距到期 ${daysLabel}`,
        ].join('\n'),
      });
    }
  }

  // 3. 今日发推速率异常
  if (apiPace > 0 && todayTotal > 0) {
    const todayHoursPassed = Math.max(1, 24 - (remainingDays % 1) * 24);
    const todayProjPerDay  = (todayTotal / todayHoursPassed) * 24;
    const ratio = todayProjPerDay / apiPace;
    const dateKey = new Date().toISOString().slice(0, 10);

    if (ratio < 0.45) {
      alerts.push({
        key: `pace_slow_${dateKey}`,
        emoji: '📉',
        label: '马斯克今天发推异常少',
        message: [
          `📉 <b>马斯克今天突然安静了</b>`,
          ``,
          `今日已发 <b>${todayTotal} 条</b>，按当前节奏预估全天仅 <b>${Math.round(todayProjPerDay)} 条</b>`,
          `本期日均 <b>${Math.round(apiPace)} 条/天</b>，今天不及均值的一半`,
          ``,
          `预测落点可能下调，关注中心区间是否需要调整。`,
        ].join('\n'),
      });
    } else if (ratio > 1.9) {
      alerts.push({
        key: `pace_fast_${dateKey}`,
        emoji: '📈',
        label: '马斯克今天发推异常多',
        message: [
          `📈 <b>马斯克今天猛发了一波</b>`,
          ``,
          `今日已发 <b>${todayTotal} 条</b>，按当前节奏预估全天约 <b>${Math.round(todayProjPerDay)} 条</b>`,
          `本期日均 <b>${Math.round(apiPace)} 条/天</b>，今天超出均值近两倍`,
          ``,
          `预测落点可能上调，检查当前落点区间是否仍然准确。`,
        ].join('\n'),
      });
    }
  }

  // 4. EV 超额机会
  const evCandidates = analysisData
    .filter(r => !r.isCenter && r.realProb > 0 && r.price > 0 && r.price < 35 && r.realProb >= 5)
    .map(r => ({ ...r, ev: r.realProb / r.price }))
    .filter(r => r.ev >= 1.4)
    .sort((a, b) => b.ev - a.ev);

  if (evCandidates.length > 0) {
    const best = evCandidates[0];
    const evKey = `ev_${best.range}_${Math.floor(best.price)}`;
    alerts.push({
      key: evKey,
      emoji: '⭐',
      label: `EV+ 超额机会：${best.range}`,
      message: [
        `⭐ <b>发现超额机会</b>`,
        ``,
        `区间 <b>${best.range}</b>`,
        `市场赔率 <b>${best.price.toFixed(1)}%</b>  vs  模型估值 <b>${best.realProb.toFixed(1)}%</b>`,
        `EV 指数 <b>${best.ev.toFixed(2)}</b>（>1.4 代表明显低估）`,
        `中奖赔率 <b>${(100 / best.price).toFixed(1)}x</b>`,
        ``,
        `💡 建议用中心仓位稳定收益覆盖风险，小仓博弈超额赔率。`,
      ].join('\n'),
    });
  }

  // 5. 区间价格大幅变动
  const priceAlerts = analysisData.filter(r => {
    if (r.price <= 0) return false;
    if (r.isCenter && r.price >= 75) return true;   // 中心涨到75%+
    if (r.isCenter && r.price >= 65) return true;   // 中心涨到65%+
    return false;
  });
  for (const r of priceAlerts) {
    const isHigh = r.price >= 75;
    alerts.push({
      key: `price_tp_${r.range}_${isHigh ? 'high' : 'mid'}`,
      emoji: '💰',
      label: `中心区间${isHigh ? '高价' : '轻度'}止盈信号`,
      message: [
        `💰 <b>中心区间止盈信号</b>`,
        ``,
        `<b>${r.range}</b> 当前价格 <b>${r.price.toFixed(0)}%</b>`,
        isHigh
          ? `价格已达 75%+，建议减仓 30% 锁定收益，主仓继续持有。`
          : `价格达到 65%，可轻度止盈 20%，主仓继续持有等待结算。`,
        ``,
        `⏱ 距到期 ${daysLabel}`,
      ].join('\n'),
    });
  }

  // 6. 当前发推数已超过中心区间上限（落点可能跑偏）
  if (centerMax > 0 && currentTweetCount > centerMax && remainingDays < 3) {
    alerts.push({
      key: `overshot_${Math.floor(currentTweetCount / 20)}`,
      emoji: '⚠️',
      label: '当前发推数已超出落点区间',
      message: [
        `⚠️ <b>注意：当前发推数已超出落点区间上限</b>`,
        ``,
        `当前已发 <b>${currentTweetCount} 条</b>，超过落点区间上限 <b>${centerMax} 条</b>`,
        `预测落点可能需要上调，检查模型是否已更新。`,
        ``,
        `⏱ 距到期 ${daysLabel}`,
      ].join('\n'),
    });
  }

  return alerts;
}

// ── Telegram sender ─────────────────────────────────────────────────────
async function sendTelegram(config: TelegramConfig, message: string): Promise<boolean> {
  try {
    const res = await fetch(config.workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botToken: config.botToken,
        chatId:   config.chatId,
        message,
      }),
    });
    const data = await res.json() as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────
export function useTelegramAlerts(input: AlertInput | null) {
  const [config, setConfigState] = useState<TelegramConfig>(() => {
    try {
      const s = localStorage.getItem(CONFIG_KEY);
      return s ? { ...DEFAULT_CONFIG, ...JSON.parse(s) } : DEFAULT_CONFIG;
    } catch { return DEFAULT_CONFIG; }
  });

  const saveConfig = useCallback((c: TelegramConfig) => {
    setConfigState(c);
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); } catch { /* ignore */ }
  }, []);

  const getSentRecords = (): SentRecord[] => {
    try { return JSON.parse(localStorage.getItem(SENT_KEY) || '[]'); }
    catch { return []; }
  };

  const markSent = (key: string) => {
    const records = getSentRecords().filter(r => Date.now() - r.sentAt < COOLDOWN_MS * 2);
    records.push({ key, sentAt: Date.now() });
    try { localStorage.setItem(SENT_KEY, JSON.stringify(records)); } catch { /* ignore */ }
  };

  const wasSentRecently = (key: string): boolean => {
    const records = getSentRecords();
    return records.some(r => r.key === key && Date.now() - r.sentAt < COOLDOWN_MS);
  };

  // Run alert engine every 4 minutes
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    if (!config.enabled || !config.workerUrl || !config.botToken || !config.chatId) return;

    const run = async () => {
      if (!inputRef.current) return;
      const alerts = buildAlerts(inputRef.current);
      for (const alert of alerts) {
        if (!wasSentRecently(alert.key)) {
          const ok = await sendTelegram(config, alert.message);
          if (ok) markSent(alert.key);
        }
      }
    };

    run(); // run immediately on mount/config change
    const id = setInterval(run, 4 * 60 * 1000);
    return () => clearInterval(id);
  }, [config]);

  return { config, saveConfig };
}

// ── Settings UI component ────────────────────────────────────────────────
interface Props {
  config: TelegramConfig;
  onSave: (c: TelegramConfig) => void;
  alertInput: AlertInput | null;
}

export function TelegramAlerts({ config, onSave, alertInput }: Props) {
  const [draft, setDraft]     = useState<TelegramConfig>(config);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);
  const [showGuide, setShowGuide] = useState(!config.workerUrl);

  const handleTest = async () => {
    if (!draft.workerUrl || !draft.botToken || !draft.chatId) return;
    setTesting(true);
    setTestResult(null);
    const ok = await sendTelegram(draft,
      `✅ <b>马斯克推文预测市场</b> 预警连接成功！\n\n你将收到以下类型的提醒：\n⏰ 操作时机（建仓/减仓/结算）\n🚨 落点接近区间边界\n📉📈 发推速率异常\n⭐ 超额机会（EV+）\n💰 中心区间止盈信号`
    );
    setTestResult(ok ? 'ok' : 'fail');
    setTesting(false);
  };

  const handleSave = () => {
    onSave(draft);
    setTestResult(null);
  };

  const isReady = draft.workerUrl && draft.botToken && draft.chatId;

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-[#162538] to-[#0f1a28] overflow-hidden shadow-xl">
        <div className={`h-1 bg-gradient-to-r ${config.enabled ? 'from-emerald-500 to-teal-500' : 'from-slate-600 to-slate-500'}`} />
        <div className="p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${config.enabled ? 'from-emerald-500 to-teal-500' : 'from-slate-600 to-slate-500'} flex items-center justify-center shadow-lg`}>
                {config.enabled ? <Bell className="w-4 h-4 text-white" /> : <BellOff className="w-4 h-4 text-white" />}
              </div>
              Telegram 预警
            </h2>
            <div className={`flex items-center gap-2 text-sm font-semibold ${config.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
              <div className={`w-2 h-2 rounded-full ${config.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              {config.enabled ? '已开启' : '未开启'}
            </div>
          </div>
          <p className="text-xs text-slate-400 pl-10">
            通过 Telegram Bot 推送交易时机、速率异常、超额机会等预警到你的手机
          </p>
        </div>
      </div>

      {/* Setup Guide */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-[#162538] to-[#0f1a28] overflow-hidden">
        <button
          onClick={() => setShowGuide(v => !v)}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Settings className="w-4 h-4 text-sky-400" />
            配置步骤（第一次使用请展开）
          </span>
          <span className="text-slate-500 text-xs">{showGuide ? '收起' : '展开'}</span>
        </button>

        {showGuide && (
          <div className="px-5 pb-5 space-y-4 border-t border-slate-800">
            {[
              {
                step: '1',
                title: '部署 Cloudflare Worker',
                color: 'from-sky-500 to-blue-500',
                items: [
                  '打开 dash.cloudflare.com → 注册/登录账号',
                  '左侧菜单 → Workers & Pages → Create → Create Worker',
                  '把项目里 cloudflare-worker/worker.js 的代码粘贴进去',
                  '点击 Deploy，复制页面上方的 Worker URL（https://xxx.workers.dev）',
                ],
              },
              {
                step: '2',
                title: '创建 Telegram Bot',
                color: 'from-violet-500 to-purple-500',
                items: [
                  '打开 Telegram，搜索 @BotFather',
                  '发送 /newbot，按提示输入机器人名字和用户名',
                  '创建成功后 BotFather 会给你一个 Token（格式：123456:ABC...），复制保存',
                ],
              },
              {
                step: '3',
                title: '获取你的 Chat ID',
                color: 'from-emerald-500 to-teal-500',
                items: [
                  '在 Telegram 搜索你刚创建的 Bot，给它发一条任意消息',
                  `浏览器打开：https://api.telegram.org/bot<你的Token>/getUpdates`,
                  '在返回的 JSON 里找 "chat":{"id": 这串数字就是你的 Chat ID}',
                ],
              },
            ].map(s => (
              <div key={s.step} className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${s.color} flex items-center justify-center text-xs font-bold text-white shrink-0`}>
                    {s.step}
                  </div>
                  <span className="text-sm font-bold text-white">{s.title}</span>
                </div>
                <ul className="space-y-1 pl-8">
                  {s.items.map((item, i) => (
                    <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                      <span className="text-slate-600 shrink-0 mt-0.5">·</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Config form */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-[#162538] to-[#0f1a28] overflow-hidden p-6 space-y-4">
        <h3 className="text-sm font-bold text-white">填入配置</h3>

        <div>
          <label className="block text-xs text-slate-400 mb-1.5 font-medium">Cloudflare Worker URL</label>
          <input
            type="url"
            value={draft.workerUrl}
            onChange={e => setDraft(d => ({ ...d, workerUrl: e.target.value.trim() }))}
            placeholder="https://your-worker.your-subdomain.workers.dev"
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-sky-500 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1.5 font-medium">Telegram Bot Token</label>
          <input
            type="password"
            value={draft.botToken}
            onChange={e => setDraft(d => ({ ...d, botToken: e.target.value.trim() }))}
            placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-sky-500 transition-colors font-mono"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1.5 font-medium">你的 Chat ID</label>
          <input
            type="text"
            value={draft.chatId}
            onChange={e => setDraft(d => ({ ...d, chatId: e.target.value.trim() }))}
            placeholder="123456789"
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-sky-500 transition-colors font-mono"
          />
        </div>

        {/* Enable toggle */}
        <div className="flex items-center justify-between p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
          <div>
            <p className="text-sm font-semibold text-white">开启预警推送</p>
            <p className="text-xs text-slate-400 mt-0.5">每 4 分钟检查一次条件，触发时推送到 Telegram</p>
          </div>
          <button
            onClick={() => setDraft(d => ({ ...d, enabled: !d.enabled }))}
            className={`relative w-12 h-6 rounded-full transition-colors ${draft.enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${draft.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={!isReady}
            className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            保存配置
          </button>
          <button
            onClick={handleTest}
            disabled={!isReady || testing}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-sm font-medium rounded-lg transition-colors border border-slate-600"
          >
            {testing
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />测试中...</>
              : <><Send className="w-3.5 h-3.5" />发送测试消息</>
            }
          </button>
          {testResult === 'ok'   && <span className="flex items-center gap-1 text-emerald-400 text-sm"><CheckCircle className="w-4 h-4" />发送成功</span>}
          {testResult === 'fail' && <span className="flex items-center gap-1 text-rose-400 text-sm"><XCircle className="w-4 h-4" />发送失败，检查配置</span>}
        </div>
      </div>

      {/* Alert types preview */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-[#162538] to-[#0f1a28] overflow-hidden p-6">
        <h3 className="text-sm font-bold text-white mb-4">会推送哪些提醒</h3>
        <div className="space-y-2">
          {[
            { emoji: '⏰', label: '操作时机',    desc: '建仓窗口开启、翼仓减仓、临近结算——关键节点不错过',   always: true },
            { emoji: '🚨', label: '落点边界预警', desc: '预测落点距区间边界 ≤ 10 条时提醒，评估是否分仓' },
            { emoji: '📉📈', label: '速率异常',  desc: '马斯克今天发推异常少或异常多，可能影响落点预测' },
            { emoji: '⭐', label: 'EV+ 超额机会', desc: '某区间价格低于模型估值 40%+，值得小仓博弈' },
            { emoji: '💰', label: '中心止盈信号', desc: '中心区间价格涨至 65% / 75% 时提醒止盈' },
            { emoji: '⚠️', label: '落点跑偏警告', desc: '当前已发推文数超过落点区间上限，模型可能需要更新' },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-3 p-3 bg-slate-800/40 rounded-xl">
              <span className="text-lg shrink-0">{item.emoji}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-200">{item.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
              </div>
              {item.always && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-semibold shrink-0">核心</span>}
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-4">同一条预警 6 小时内不重复发送</p>
      </div>
    </div>
  );
}
