import { useState, useEffect, useRef } from 'react';
import { Bell, BellOff, Send, CheckCircle, XCircle, Loader2, Smartphone, MessageCircle } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────
export interface AlertConfig {
  mode: 'ntfy' | 'telegram';
  // ntfy (简单模式)
  ntfyTopic: string;
  ntfyServer: string;
  // telegram (高级模式)
  workerUrl: string;
  botToken: string;
  chatId: string;
  enabled: boolean;
}

export interface AlertInput {
  mu: number;
  remainingDays: number;
  currentTweetCount: number;
  todayTotal: number;
  apiPace: number;
  analysisData: Array<{
    range: string;
    price: number;
    realProb: number;
    isCenter?: boolean;
    parsed: { min: number; max: number } | null;
  }>;
}

interface SentRecord { key: string; sentAt: number; }

// ── Constants ──────────────────────────────────────────────────────────
const CONFIG_KEY  = 'alert_config_v2';
const SENT_KEY    = 'alert_sent_v1';
const COOLDOWN_MS = 6 * 60 * 60 * 1000;

const DEFAULT_CONFIG: AlertConfig = {
  mode: 'ntfy',
  ntfyTopic: '',
  ntfyServer: 'https://ntfy.sh',
  workerUrl: '', botToken: '', chatId: '1899924436',
  enabled: false,
};

// ── Strip HTML tags (for ntfy plain text) ──────────────────────────────
function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, '').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}

// ── Alert builder ──────────────────────────────────────────────────────
function buildAlerts(input: AlertInput) {
  const alerts: Array<{ key: string; title: string; message: string; priority: string }> = [];
  const { mu, remainingDays, currentTweetCount, todayTotal, apiPace, analysisData } = input;

  const center    = analysisData.find(r => r.isCenter);
  const centerMax = center?.parsed?.max ?? 0;
  const centerMin = center?.parsed?.min ?? 0;
  const daysLabel = remainingDays < 1
    ? `${Math.round(remainingDays * 24)} 小时`
    : `${remainingDays.toFixed(1)} 天`;

  // 1. 操作阶段变更
  const phases = [
    { key: 'phase_entry1',  range: [2.5, 3.0] as [number,number], title: '⏰ 第一次建仓窗口开启',   body: `距到期 ${daysLabel}，可分散布局中心+两翼，使用总资金 25%` },
    { key: 'phase_entry2',  range: [1.5, 2.5] as [number,number], title: '⏰ 加仓窗口',            body: `落点趋稳，集中加码中心区间，部署总资金 40%` },
    { key: 'phase_wing1',   range: [1.0, 1.5] as [number,number], title: '⏰ 翼仓开始减仓',        body: `今晚减持翼仓 40%，寻找超额收益机会` },
    { key: 'phase_wing2',   range: [0.5, 1.0] as [number,number], title: '⏰ 翼仓继续减仓',        body: `再减 50%，专注等待中心区间结算` },
    { key: 'phase_final',   range: [0.0, 0.5] as [number,number], title: '⏰ 临近结算！最终阶段',  body: `翼仓全部清仓，中心 >65% 可止盈 20%` },
  ];
  for (const p of phases) {
    if (remainingDays >= p.range[0] && remainingDays < p.range[1]) {
      alerts.push({
        key: p.key, priority: 'high', title: p.title,
        message: `${p.title}\n\n${p.body}\n\n预测落点 ~${Math.round(mu)} 条${center ? `，落点区间 ${center.range}（赔率 ${center.price.toFixed(0)}%）` : ''}\n距到期 ${daysLabel}`,
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
      alerts.push({
        key: `boundary_${center.range}_${Math.floor(mu / 5)}`,
        priority: 'urgent',
        title: `🚨 落点接近区间${side}边界`,
        message: `落点接近区间${side}边界\n\n预测落点 ~${Math.round(mu)} 条，距${side}边界仅 ${Math.round(dist)} 条\n建议评估是否在两侧区间分仓\n\n距到期 ${daysLabel}`,
      });
    }
  }

  // 3. 发推速率异常
  if (apiPace > 0 && todayTotal > 0) {
    const todayHours   = Math.max(1, 24 - (remainingDays % 1) * 24);
    const todayProj    = (todayTotal / todayHours) * 24;
    const ratio        = todayProj / apiPace;
    const dateKey      = new Date().toISOString().slice(0, 10);
    if (ratio < 0.45) {
      alerts.push({
        key: `pace_slow_${dateKey}`, priority: 'default',
        title: '📉 马斯克今天发推异常少',
        message: `马斯克今天突然安静了\n\n今日已发 ${todayTotal} 条，预估全天 ${Math.round(todayProj)} 条\n本期日均 ${Math.round(apiPace)} 条/天，今天不到一半\n\n预测落点可能下调，注意区间是否需要调整`,
      });
    } else if (ratio > 1.9) {
      alerts.push({
        key: `pace_fast_${dateKey}`, priority: 'default',
        title: '📈 马斯克今天发推异常多',
        message: `马斯克今天猛发了一波\n\n今日已发 ${todayTotal} 条，预估全天 ${Math.round(todayProj)} 条\n本期日均 ${Math.round(apiPace)} 条/天，今天近两倍\n\n预测落点可能上调，检查当前区间是否仍准确`,
      });
    }
  }

  // 4. EV 超额机会
  const best = analysisData
    .filter(r => !r.isCenter && r.realProb >= 5 && r.price > 0 && r.price < 35)
    .map(r => ({ ...r, ev: r.realProb / r.price }))
    .filter(r => r.ev >= 1.4)
    .sort((a, b) => b.ev - a.ev)[0];
  if (best) {
    alerts.push({
      key: `ev_${best.range}_${Math.floor(best.price)}`,
      priority: 'default',
      title: `⭐ EV+ 超额机会：${best.range}`,
      message: `发现超额机会\n\n区间 ${best.range}\n市场赔率 ${best.price.toFixed(1)}% vs 模型 ${best.realProb.toFixed(1)}%\nEV指数 ${best.ev.toFixed(2)}，中奖 ${(100/best.price).toFixed(1)}x\n\n建议用中心仓位收益的一部分小仓博弈`,
    });
  }

  // 5. 中心止盈信号
  if (center && remainingDays < 1.5) {
    if (center.price >= 75) {
      alerts.push({
        key: `tp_high_${center.range}`, priority: 'high',
        title: `💰 中心区间止盈信号（高位）`,
        message: `中心区间止盈信号\n\n${center.range} 当前价格 ${center.price.toFixed(0)}%\n建议减仓 30% 锁定收益，主仓继续持有\n\n距到期 ${daysLabel}`,
      });
    } else if (center.price >= 65) {
      alerts.push({
        key: `tp_mid_${center.range}`, priority: 'default',
        title: `💰 中心区间可轻度止盈`,
        message: `中心区间止盈信号\n\n${center.range} 当前价格 ${center.price.toFixed(0)}%\n可轻度减仓 20%，主仓继续持有等待结算\n\n距到期 ${daysLabel}`,
      });
    }
  }

  // 6. 落点跑偏
  if (centerMax > 0 && currentTweetCount > centerMax && remainingDays < 3) {
    alerts.push({
      key: `overshot_${Math.floor(currentTweetCount / 20)}`, priority: 'urgent',
      title: `⚠️ 当前发推数已超出落点区间`,
      message: `注意：当前发推数已超出落点区间上限\n\n当前已发 ${currentTweetCount} 条，超过上限 ${centerMax} 条\n落点区间可能需要上调，检查模型是否已更新\n\n距到期 ${daysLabel}`,
    });
  }

  return alerts;
}

// ── Senders ────────────────────────────────────────────────────────────
async function sendNtfy(config: AlertConfig, title: string, message: string): Promise<{ ok: boolean; error?: string }> {
  if (!config.ntfyTopic) return { ok: false, error: '频道名为空' };
  const server = config.ntfyServer || 'https://ntfy.sh';
  try {
    const res = await fetch(`${server}/${config.ntfyTopic}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Title': title,
        'Priority': 'default',
        'Tags': 'bell',
      },
      body: message,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 80)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function sendTelegram(config: AlertConfig, message: string): Promise<{ ok: boolean; error?: string }> {
  if (!config.botToken || !config.chatId) return { ok: false, error: 'Bot Token 或 Chat ID 未填' };
  try {
    // 优先走 Cloudflare Worker（若填了），否则直接调 Telegram API
    let res: Response;
    if (config.workerUrl) {
      res = await fetch(config.workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: config.botToken, chatId: config.chatId, message }),
      });
    } else {
      res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
    }
    const data = await res.json() as { ok?: boolean; description?: string };
    return data.ok === true ? { ok: true } : { ok: false, error: data.description ?? JSON.stringify(data) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function sendAlert(config: AlertConfig, title: string, message: string): Promise<{ ok: boolean; error?: string }> {
  if (config.mode === 'ntfy') return sendNtfy(config, title, stripHtml(message));
  return sendTelegram(config, message);
}

// ── Hook ─────────────────────────────────────────────────────────────────
export function useTelegramAlerts(input: AlertInput | null) {
  const [config, setConfigState] = useState<AlertConfig>(() => {
    try {
      const s = localStorage.getItem(CONFIG_KEY);
      return s ? { ...DEFAULT_CONFIG, ...JSON.parse(s) } : DEFAULT_CONFIG;
    } catch { return DEFAULT_CONFIG; }
  });

  const saveConfig = (c: AlertConfig) => {
    setConfigState(c);
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); } catch { /* ignore */ }
  };

  const getSent = (): SentRecord[] => {
    try { return JSON.parse(localStorage.getItem(SENT_KEY) || '[]'); } catch { return []; }
  };
  const markSent = (key: string) => {
    const recs = getSent().filter(r => Date.now() - r.sentAt < COOLDOWN_MS * 2);
    recs.push({ key, sentAt: Date.now() });
    try { localStorage.setItem(SENT_KEY, JSON.stringify(recs)); } catch { /* ignore */ }
  };
  const wasSent = (key: string) => getSent().some(r => r.key === key && Date.now() - r.sentAt < COOLDOWN_MS);

  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    const ready = config.enabled && (
      (config.mode === 'ntfy' && config.ntfyTopic) ||
      (config.mode === 'telegram' && config.botToken && config.chatId)
    );
    if (!ready) return;

    const run = async () => {
      if (!inputRef.current) return;
      for (const alert of buildAlerts(inputRef.current)) {
        if (!wasSent(alert.key)) {
          const result = await sendAlert(config, alert.title, alert.message);
          if (result.ok) markSent(alert.key);
        }
      }
    };

    run();
    const id = setInterval(run, 4 * 60 * 1000);
    return () => clearInterval(id);
  }, [config]);

  return { config, saveConfig };
}

// ── UI Component ─────────────────────────────────────────────────────────
interface Props {
  config: AlertConfig;
  onSave: (c: AlertConfig) => void;
  alertInput: AlertInput | null;
}

export function TelegramAlerts({ config, onSave, alertInput: _alertInput }: Props) {
  const [draft, setDraft]       = useState<AlertConfig>(config);
  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testError, setTestError]   = useState<string>('');

  const handleTest = async () => {
    setTesting(true); setTestResult(null); setTestError('');
    const result = await sendAlert(draft,
      '✅ 马斯克推文预测市场',
      '预警连接成功！\n\n你将收到：\n⏰ 操作时机提醒\n🚨 落点边界预警\n📉📈 速率异常\n⭐ EV+ 超额机会\n💰 中心区间止盈信号'
    );
    setTestResult(result.ok ? 'ok' : 'fail');
    if (!result.ok) setTestError(result.error ?? '未知错误');
    setTesting(false);
  };

  const handleSave = () => { onSave(draft); setTestResult(null); };

  const ntfyReady = draft.mode === 'ntfy' && !!draft.ntfyTopic;
  const tgReady   = draft.mode === 'telegram' && !!draft.botToken && !!draft.chatId; // workerUrl 可选
  const isReady   = ntfyReady || tgReady;

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-[#162538] to-[#0f1a28] overflow-hidden shadow-xl">
        <div className={`h-1 bg-gradient-to-r ${config.enabled ? 'from-emerald-500 to-teal-500' : 'from-slate-600 to-slate-500'}`} />
        <div className="p-6 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${config.enabled ? 'from-emerald-500 to-teal-500' : 'from-slate-600 to-slate-500'} flex items-center justify-center`}>
                {config.enabled ? <Bell className="w-4 h-4 text-white" /> : <BellOff className="w-4 h-4 text-white" />}
              </div>
              手机预警推送
            </h2>
            <p className="text-xs text-slate-400 mt-1 pl-10">关键节点、价格异常、超额机会——第一时间推送到手机</p>
          </div>
          <div className={`flex items-center gap-2 text-sm font-semibold ${config.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
            <div className={`w-2 h-2 rounded-full ${config.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            {config.enabled ? '预警运行中' : '未开启'}
          </div>
        </div>
      </div>

      {/* Mode selector */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-[#162538] to-[#0f1a28] p-6">
        <p className="text-sm font-bold text-white mb-4">选择推送方式</p>
        <div className="grid grid-cols-2 gap-3">
          {/* ntfy */}
          <button
            onClick={() => setDraft(d => ({ ...d, mode: 'ntfy' }))}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              draft.mode === 'ntfy'
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Smartphone className={`w-5 h-5 ${draft.mode === 'ntfy' ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span className={`font-bold text-sm ${draft.mode === 'ntfy' ? 'text-emerald-300' : 'text-slate-300'}`}>
                ntfy（推荐）
              </span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-semibold">简单</span>
            </div>
            <p className="text-xs text-slate-400">无需注册，装个 App 就能用，1 分钟搞定</p>
          </button>

          {/* Telegram */}
          <button
            onClick={() => setDraft(d => ({ ...d, mode: 'telegram' }))}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              draft.mode === 'telegram'
                ? 'border-sky-500 bg-sky-500/10'
                : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className={`w-5 h-5 ${draft.mode === 'telegram' ? 'text-sky-400' : 'text-slate-400'}`} />
              <span className={`font-bold text-sm ${draft.mode === 'telegram' ? 'text-sky-300' : 'text-slate-300'}`}>
                Telegram Bot
              </span>
              <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded font-semibold">高级</span>
            </div>
            <p className="text-xs text-slate-400">需要 Cloudflare Worker + Bot Token，配置较多</p>
          </button>
        </div>
      </div>

      {/* ntfy config */}
      {draft.mode === 'ntfy' && (
        <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-[#162538] to-[#0f1a28] p-6 space-y-5">

          {/* Steps */}
          <div className="space-y-3">
            {[
              {
                step: '1', color: 'from-emerald-500 to-teal-500',
                title: '手机安装 ntfy App',
                content: (
                  <div className="flex gap-3 mt-1">
                    <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noreferrer"
                       className="text-xs text-sky-400 underline">iOS 下载</a>
                    <a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noreferrer"
                       className="text-xs text-sky-400 underline">Android 下载</a>
                  </div>
                ),
              },
              {
                step: '2', color: 'from-emerald-500 to-teal-500',
                title: '取一个你的专属频道名（只有你知道就行）',
                content: (
                  <input
                    type="text"
                    value={draft.ntfyTopic}
                    onChange={e => setDraft(d => ({ ...d, ntfyTopic: e.target.value.trim() }))}
                    placeholder="例如：musk-alerts-adul88"
                    className="mt-2 w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                  />
                ),
              },
              {
                step: '3', color: 'from-emerald-500 to-teal-500',
                title: '手机 App 里点 + 订阅这个频道名',
                content: <p className="text-xs text-slate-400 mt-1">打开 ntfy App → 右上角 + → 输入你上面填的频道名 → Subscribe</p>,
              },
            ].map(s => (
              <div key={s.step} className="flex gap-3">
                <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${s.color} flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5`}>
                  {s.step}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{s.title}</p>
                  {s.content}
                </div>
              </div>
            ))}
          </div>

          {draft.ntfyTopic && (
            <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/25 text-xs text-emerald-300">
              订阅地址：<span className="font-mono font-bold">{draft.ntfyServer}/{draft.ntfyTopic}</span>
            </div>
          )}
        </div>
      )}

      {/* Telegram config */}
      {draft.mode === 'telegram' && (
        <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-[#162538] to-[#0f1a28] p-6 space-y-4">
          <p className="text-xs text-slate-300 p-3 bg-sky-500/10 rounded-xl border border-sky-500/20">
            💡 <b>不需要 Cloudflare</b>：只填 Bot Token + Chat ID 即可直接发送。Worker URL 可留空。
          </p>

          {/* Bot Token */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">
              Telegram Bot Token <span className="text-rose-400">*必填</span>
            </label>
            <input
              type="password"
              value={draft.botToken}
              onChange={e => setDraft(d => ({ ...d, botToken: e.target.value.trim() }))}
              placeholder="从 @BotFather 获取，格式：123456789:ABCdef..."
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-sky-500 transition-colors font-mono"
            />
          </div>

          {/* Chat ID */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">
              你的 Chat ID <span className="text-rose-400">*必填</span>
            </label>
            <input
              type="text"
              value={draft.chatId}
              onChange={e => setDraft(d => ({ ...d, chatId: e.target.value.trim() }))}
              placeholder="1899924436"
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-sky-500 transition-colors font-mono"
            />
          </div>

          {/* Worker URL (optional) */}
          <details className="group">
            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400 transition-colors select-none">
              ▸ Cloudflare Worker URL（可选，留空也能用）
            </summary>
            <div className="mt-2">
              <input
                type="url"
                value={draft.workerUrl}
                onChange={e => setDraft(d => ({ ...d, workerUrl: e.target.value.trim() }))}
                placeholder="https://xxx.workers.dev（不填也可以）"
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-sky-500 transition-colors font-mono"
              />
            </div>
          </details>
        </div>
      )}

      {/* Enable + Save + Test */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-[#162538] to-[#0f1a28] p-6 space-y-4">
        <div className="flex items-center justify-between p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
          <div>
            <p className="text-sm font-semibold text-white">开启预警推送</p>
            <p className="text-xs text-slate-400 mt-0.5">每 4 分钟自动检查，触发时推送到手机</p>
          </div>
          <button
            onClick={() => setDraft(d => ({ ...d, enabled: !d.enabled }))}
            className={`relative w-12 h-6 rounded-full transition-colors ${draft.enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${draft.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={!isReady}
            className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors">
            保存配置
          </button>
          <button onClick={handleTest} disabled={!isReady || testing}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-sm font-medium rounded-lg transition-colors border border-slate-600">
            {testing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />测试中...</> : <><Send className="w-3.5 h-3.5" />发送测试消息</>}
          </button>
          {testResult === 'ok'   && <span className="flex items-center gap-1 text-emerald-400 text-sm"><CheckCircle className="w-4 h-4" />发送成功！检查手机是否收到</span>}
          {testResult === 'fail' && (
            <span className="flex flex-col gap-1">
              <span className="flex items-center gap-1 text-rose-400 text-sm"><XCircle className="w-4 h-4" />发送失败</span>
              {testError && <span className="text-xs text-rose-300/80 font-mono break-all">{testError}</span>}
            </span>
          )}
        </div>
      </div>

      {/* Alert types */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-[#162538] to-[#0f1a28] p-6">
        <p className="text-sm font-bold text-white mb-3">会推送哪些提醒</p>
        <div className="space-y-2">
          {[
            { e: '⏰', l: '操作时机',      d: '建仓窗口开启、翼仓减仓、临近结算，关键节点不错过' },
            { e: '🚨', l: '落点边界预警',  d: '预测落点距区间边界 ≤10 条时提醒，评估是否分仓' },
            { e: '📉📈', l: '速率异常',   d: '马斯克今天发推异常少或多，可能影响落点预测' },
            { e: '⭐', l: 'EV+ 超额机会', d: '某区间价格低于模型估值 40%+，值得小仓博弈' },
            { e: '💰', l: '中心止盈信号', d: '中心区间价格涨至 65% / 75% 时提醒止盈' },
            { e: '⚠️', l: '落点跑偏',    d: '当前发推数超过落点区间上限，模型可能需要更新' },
          ].map(item => (
            <div key={item.l} className="flex items-start gap-3 p-3 bg-slate-800/40 rounded-xl">
              <span className="text-base shrink-0">{item.e}</span>
              <div>
                <p className="text-xs font-semibold text-slate-200">{item.l}</p>
                <p className="text-xs text-slate-400 mt-0.5">{item.d}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-3">同一条预警 6 小时内不重复发送</p>
      </div>

    </div>
  );
}
