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
  chatId: string;      // 私聊 Chat ID
  groupChatId: string; // 群组 Chat ID（可选）
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
  workerUrl: '', botToken: '', chatId: '1899924436', groupChatId: '',
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

  // ── 价值比预计算（核心框架：VR = 模型概率 / 市场价格）────────
  // VR > 1.0 → 正期望（市场低估）；VR < 1.0 → 负期望（市场高估）
  const withVR = analysisData
    .filter(r => r.price > 0 && r.realProb > 0)
    .map(r => ({ ...r, vr: r.realProb / r.price }))
    .sort((a, b) => b.vr - a.vr);

  const center         = withVR.find(r => r.isCenter);
  const centerVR       = center ? center.vr : 0;
  const centerMax      = center?.parsed?.max ?? 0;
  const centerMin      = center?.parsed?.min ?? 0;
  // 中心区间高估：价格>35¢ 且 VR<1.0（RULES §1.1.2）
  const centerOverpriced = !!center && center.price > 35 && centerVR < 1.0;

  // 主仓候选：model_prob≥10% 中VR最高的区间
  const mainCandidate  = withVR.filter(r => r.realProb >= 10)[0];
  // 保护仓：中心落点下方1档（+0.3档系统偏高对冲，RULES §4.1）
  const sortedByMin    = [...analysisData].sort((a, b) => (a.parsed?.min ?? 0) - (b.parsed?.min ?? 0));
  const centerIdx      = sortedByMin.findIndex(r => r.isCenter);
  const protectRaw     = centerIdx > 0 ? sortedByMin[centerIdx - 1] : null;
  const protectCandidate = protectRaw
    ? { ...protectRaw, vr: protectRaw.price > 0 ? protectRaw.realProb / protectRaw.price : 0 }
    : null;
  // 高赔率仓：price≤5¢ && VR≥2.0（RULES §4.2）
  const lotteryCandidate = withVR.find(r =>
    r.price <= 5 && r.vr >= 2.0
    && r.range !== mainCandidate?.range
    && r.range !== protectCandidate?.range
  );

  const vrLabel = (vr: number) => {
    if (vr >= 2.5) return '⭐高赔率低估';
    if (vr >= 1.5) return '✅明显低估';
    if (vr >= 1.2) return '✅低估';
    if (vr >= 1.0) return '🟡合理';
    if (vr >= 0.8) return '🟠略高估';
    return '❌高估';
  };

  const daysLabel = remainingDays < 1
    ? `${Math.round(remainingDays * 24)} 小时`
    : `${remainingDays.toFixed(1)} 天`;

  // 格式化三层入场结构（RULES §4.1）
  const fmtEntryStructure = (): string => {
    if (!mainCandidate) return '（暂无有效入场点）';
    const lines: string[] = [];
    lines.push(`🟦 主仓 50-70% → ${mainCandidate.range}  ${mainCandidate.price.toFixed(1)}¢  VR${mainCandidate.vr.toFixed(2)}x  ${vrLabel(mainCandidate.vr)}`);
    if (protectCandidate) {
      lines.push(`🟨 保护仓 20-30% → ${protectCandidate.range}  ${protectCandidate.price.toFixed(1)}¢  VR${protectCandidate.vr.toFixed(2)}x  (+0.3档偏高对冲)`);
    } else {
      lines.push('🟨 保护仓 — 中心已在最低档，无下方区间');
    }
    if (lotteryCandidate) {
      lines.push(`⭐ 高赔率仓 ≤5% → ${lotteryCandidate.range}  ${lotteryCandidate.price.toFixed(1)}¢  VR${lotteryCandidate.vr.toFixed(2)}x`);
    }
    const overallVR = mainCandidate.vr;
    lines.push(
      overallVR >= 1.2 ? '总体：✅ 有入场价值，可执行建仓'
      : overallVR >= 1.0 ? '总体：🟡 勉强可入，等更好时机'
      : '总体：❌ 无正期望入场点，等待价格回调'
    );
    return lines.join('\n');
  };

  // ── 1. 操作阶段变更（整合价值比判断）──────────────────────────
  type Phase = { key: string; range: [number, number]; title: string };
  const phases: Phase[] = [
    { key: 'phase_entry1', range: [2.5, 3.0], title: '⏰ 建仓窗口开启（早期）' },
    { key: 'phase_entry2', range: [1.5, 2.5], title: '⏰ 主力建仓窗口' },
    { key: 'phase_hold1',  range: [1.0, 1.5], title: '⏰ 持仓评估阶段' },
    { key: 'phase_hold2',  range: [0.5, 1.0], title: '⏰ 止盈评估阶段' },
    { key: 'phase_final',  range: [0.0, 0.5], title: '⏰ 最终阶段 · 临近结算' },
  ];
  for (const p of phases) {
    if (remainingDays >= p.range[0] && remainingDays < p.range[1]) {
      let body = '';
      if (p.key === 'phase_entry1') {
        // 早期：µ不确定性大（±50条），轻仓试探
        const noEntry = !mainCandidate || mainCandidate.vr < 1.0;
        body = noEntry
          ? `µ不确定性大（±50条），且当前无正期望入场点（最优VR=${mainCandidate?.vr.toFixed(2) ?? '?'}x）\n建议观望，等价格回调或µ更新后再决策`
          : `µ不确定性大（±50条），只宜轻仓≤25%试探\n${centerOverpriced ? `⚠️ 中心区间 ${center!.range} 定价偏高（${center!.price.toFixed(0)}¢，VR${centerVR.toFixed(2)}x）\n主仓看两侧区间，不买中心\n\n` : ''}最高VR区间：${mainCandidate!.range}  ${mainCandidate!.price.toFixed(1)}¢  VR${mainCandidate!.vr.toFixed(2)}x  ${vrLabel(mainCandidate!.vr)}\n\n建议：轻仓试探，等 1.5-2天 µ稳定后再加主仓`;
      } else if (p.key === 'phase_entry2') {
        // 主力建仓：最佳窗口，输出完整三层结构
        const noEntry = !mainCandidate || mainCandidate.vr < 1.0;
        body = noEntry
          ? `主力建仓窗口开启，但当前最优区间价值比偏低（VR=${mainCandidate?.vr.toFixed(2) ?? '?'}x）\n⚠️ 不要为了「入场而入场」，等价格回调后再操作\n\n距到期 ${daysLabel}`
          : `µ精度提升（±20条），最佳入场时机\n${centerOverpriced ? `⚠️ 中心区间 ${center!.range} 已高估（${center!.price.toFixed(0)}¢  VR${centerVR.toFixed(2)}x），主仓移至价值比更高区间\n\n` : '\n'}${fmtEntryStructure()}\n\n距到期 ${daysLabel}`;
      } else if (p.key === 'phase_hold1') {
        body = `µ精度较高（±12条），持仓评估期\n\n检查持仓：\n• 持仓区间 VR 是否仍 ≥1.0？µ是否仍在区间内？\n• 有更高VR相邻区间？→ 评估换仓（死区BJ 17:30执行）\n• µ偏移 >1.5σ（约25-30条）时才考虑换仓\n\n距到期 ${daysLabel}`;
      } else if (p.key === 'phase_hold2') {
        const centerInfo = center ? `\n中心区间 ${center.range} 当前 ${center.price.toFixed(0)}¢` : '';
        body = `µ非常稳定，止盈评估期${centerInfo}\n\n• >75¢ → 卖出50%锁利，剩余博到期$1\n• >85¢ → 大部分止盈\n• 亏损仓位且VR<0.8 → 死区出场，不拖延\n\n距到期 ${daysLabel}`;
      } else if (p.key === 'phase_final') {
        const centerInfo = center ? `\n落点 ${center.range} 当前 ${center.price.toFixed(0)}¢` : '';
        body = `µ高度确定（±8条），最后操作窗口${centerInfo}\n\n• 亏损仓位：现在出，不再等（死亡陷阱：「再等等看」）\n• 盈利仓位：持有到期 或 已止盈50%→不动\n• >85¢：可全部止盈\n\n距到期 ${daysLabel}`;
      }
      alerts.push({ key: p.key, priority: 'high', title: p.title, message: `${p.title}\n\n${body}` });
      break;
    }
  }

  // ── 2. 中心区间定价偏高（核心新增告警，RULES §1.1.2、§10.2）──
  if (centerOverpriced && center) {
    const top3 = withVR.filter(r => r.range !== center.range && r.realProb >= 3).slice(0, 3);
    const altLines = top3.map(r => `  ${r.range}  ${r.price.toFixed(1)}¢  VR${r.vr.toFixed(2)}x  ${vrLabel(r.vr)}`).join('\n');
    alerts.push({
      key: `center_overpriced_${center.range}_${Math.floor(center.price)}`,
      priority: 'urgent',
      title: '⚠️ 中心区间定价偏高，负EV！',
      message: `预测最可能区间已被高估（预测正确≠下注正确）\n\n中心 ${center.range}：价格 ${center.price.toFixed(0)}¢，模型概率 ${center.realProb.toFixed(0)}%\n价值比 ${centerVR.toFixed(2)}x ❌ 买入是负EV操作\n\n更划算的区间：\n${altLines || '（暂无正期望区间）'}\n\n建议：主仓放弃中心区间，移至价值比最高的相邻区间`,
    });
  }

  // ── 3. 落点接近区间边界（RULES §3.4 边界分仓规则）──────────
  if (centerMax > 0 && center) {
    const distUp   = centerMax - mu;
    const distDown = mu - centerMin;
    const dist     = Math.min(distUp, distDown);
    if (dist <= 10 && dist >= 0) {
      const side       = distUp < distDown ? '上' : '下';
      const adjRange   = distUp < distDown
        ? withVR.find(r => (r.parsed?.min ?? 0) >= centerMax)
        : withVR.find(r => (r.parsed?.max ?? 0) <= centerMin);
      const adjNote    = adjRange
        ? `\n相邻${side}方：${adjRange.range}  ${adjRange.price.toFixed(1)}¢  VR${adjRange.vr.toFixed(2)}x  ${vrLabel(adjRange.vr)}`
        : '';
      alerts.push({
        key: `boundary_${center.range}_${Math.floor(mu / 5)}`,
        priority: 'urgent',
        title: `🚨 落点接近区间${side}边界`,
        message: `落点接近区间${side}边界\n\n预测落点 ~${Math.round(mu)} 条，距${side}边界仅 ${Math.round(dist)} 条${adjNote}\n\n建议：在${side}方相邻区间补建保护仓（RULES §3.4）\nµ误差约±10条，边界两侧都有实质概率\n\n距到期 ${daysLabel}`,
      });
    }
  }

  // ── 4. 发推速率异常 ─────────────────────────────────────────
  if (apiPace > 0 && todayTotal > 0) {
    const todayHours = Math.max(1, 24 - (remainingDays % 1) * 24);
    const todayProj  = (todayTotal / todayHours) * 24;
    const ratio      = todayProj / apiPace;
    const dateKey    = new Date().toISOString().slice(0, 10);
    if (ratio < 0.45) {
      alerts.push({
        key: `pace_slow_${dateKey}`, priority: 'default',
        title: '📉 马斯克今天发推异常少',
        message: `马斯克今天突然安静了\n\n今日已发 ${todayTotal} 条，预估全天 ${Math.round(todayProj)} 条\n本期日均 ${Math.round(apiPace)} 条/天，今天不到一半\n\n⚠️ µ可能虚高约14条（RULES §2.3）\n单日沉默不要立刻换仓，等今日死区（BJ 17:30）重新评估µ后再决策`,
      });
    } else if (ratio > 1.9) {
      alerts.push({
        key: `pace_fast_${dateKey}`, priority: 'default',
        title: '📈 马斯克今天发推异常多',
        message: `马斯克今天猛发了一波\n\n今日已发 ${todayTotal} 条，预估全天 ${Math.round(todayProj)} 条\n本期日均 ${Math.round(apiPace)} 条/天，今天近两倍\n\n⚠️ 价格正在上涨，不追仓（RULES §6.1）\n有仓位：BJ 14:00 是全天止盈最佳时机，+30%可考虑减仓 30-50%`,
      });
    }
  }

  // ── 5. 价值比机会（替代旧版EV+告警）────────────────────────
  // 找到VR最高且模型有实质概率的区间，输出三层结构建议
  const topVR = withVR.filter(r => r.vr >= 1.2 && r.realProb >= 3);
  if (topVR.length > 0 && mainCandidate && mainCandidate.vr >= 1.2) {
    const needAlert = mainCandidate.vr >= 1.5           // 有高价值区间
      || (centerOverpriced && mainCandidate.vr >= 1.2); // 或者中心高估时有替代
    if (needAlert) {
      const vrLines = topVR.slice(0, 4)
        .map(r => `  ${r.isCenter ? '★' : ' '} ${r.range}  ${r.price.toFixed(1)}¢  VR${r.vr.toFixed(2)}x  ${vrLabel(r.vr)}`)
        .join('\n');
      alerts.push({
        key: `vr_opp_${mainCandidate.range}_${Math.floor(mainCandidate.price)}`,
        priority: mainCandidate.vr >= 1.5 ? 'high' : 'default',
        title: `💡 入场结构建议（价值比分析）`,
        message: `各区间价值比排名：\n${vrLines}\n\n推荐入场结构：\n${fmtEntryStructure()}\n\n提醒：预测正确≠下注正确\n只有VR≥1.0的区间才有正期望（RULES §1.1.1）`,
      });
    }
  }

  // ── 6. 止盈信号 ─────────────────────────────────────────────
  if (center && remainingDays < 1.5) {
    if (center.price >= 75) {
      alerts.push({
        key: `tp_high_${center.range}`, priority: 'high',
        title: `💰 止盈信号（高位）`,
        message: `落点区间已进入高位止盈区间（RULES §5.3）\n\n${center.range} 当前价格 ${center.price.toFixed(0)}¢\n建议：卖出 50% 锁利，剩余博到期 $1\n>85¢ 时可大部分止盈\n\n距到期 ${daysLabel}`,
      });
    } else if (center.price >= 65) {
      alerts.push({
        key: `tp_mid_${center.range}`, priority: 'default',
        title: `💰 可轻度止盈`,
        message: `落点区间进入可轻度止盈区间\n\n${center.range} 当前价格 ${center.price.toFixed(0)}¢\n可减仓 20-30% 锁定部分收益，主仓继续持有等结算\n\n距到期 ${daysLabel}`,
      });
    }
  }

  // ── 7. 落点跑偏 ─────────────────────────────────────────────
  if (centerMax > 0 && currentTweetCount > centerMax && remainingDays < 3) {
    const newCenter = withVR.find(r =>
      (r.parsed?.min ?? 0) <= currentTweetCount && currentTweetCount <= (r.parsed?.max ?? 0)
    );
    const newCenterNote = newCenter
      ? `新落点可能是：${newCenter.range}（${newCenter.price.toFixed(1)}¢  VR${newCenter.vr.toFixed(2)}x  ${vrLabel(newCenter.vr)}）`
      : '落点可能需要上调，等模型更新';
    alerts.push({
      key: `overshot_${Math.floor(currentTweetCount / 20)}`, priority: 'urgent',
      title: `⚠️ 当前发推数已超出落点区间`,
      message: `当前发推数已超出落点区间上限\n\n已发 ${currentTweetCount} 条，超过上限 ${centerMax} 条\n${newCenterNote}\n\n建议：检查模型是否已更新，有仓位评估是否换仓\n距到期 ${daysLabel}`,
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

async function sendToOneChatId(
  config: AlertConfig, chatId: string, message: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    let res: Response;
    if (config.workerUrl) {
      // 用户自定义 Cloudflare Worker（优先级最高）
      res = await fetch(config.workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: config.botToken, chatId, message }),
      });
    } else {
      // 生产环境走 Vercel 代理（解决国内浏览器直连 api.telegram.org 被墙的问题）
      // 本地开发回退到直连（需要梯子）
      const isProduction = !['localhost', '127.0.0.1'].includes(window.location.hostname);
      if (isProduction) {
        res = await fetch('/api/telegram-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken: config.botToken, chatId, message }),
        });
      } else {
        res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        });
      }
    }
    const data = await res.json() as { ok?: boolean; description?: string };
    return data.ok === true ? { ok: true } : { ok: false, error: data.description ?? JSON.stringify(data) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function sendTelegram(config: AlertConfig, message: string): Promise<{ ok: boolean; error?: string }> {
  if (!config.botToken || !config.chatId) return { ok: false, error: 'Bot Token 或 Chat ID 未填' };

  // 收集所有目标 Chat ID（私聊 + 群组，去重过滤空值）
  const targets = [...new Set([config.chatId, config.groupChatId].filter(Boolean))];
  const results = await Promise.all(targets.map(id => sendToOneChatId(config, id, message)));

  // 只要有一个成功就算成功；全部失败才返回失败
  const anyOk = results.some(r => r.ok);
  const errors = results.filter(r => !r.ok).map(r => r.error).join(' | ');
  return anyOk ? { ok: true } : { ok: false, error: errors };
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
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-semibold">简单</span>
            </div>
            <p className="text-xs text-slate-400">无需注册，装个 App 就能用，1 分钟搞定</p>
          </button>

          {/* Telegram */}
          <button
            onClick={() => setDraft(d => ({ ...d, mode: 'telegram' }))}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              draft.mode === 'telegram'
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className={`w-5 h-5 ${draft.mode === 'telegram' ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span className={`font-bold text-sm ${draft.mode === 'telegram' ? 'text-emerald-300' : 'text-slate-300'}`}>
                Telegram Bot
              </span>
              <span className="text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded font-semibold">高级</span>
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
                       className="text-xs text-emerald-400 underline">iOS 下载</a>
                    <a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noreferrer"
                       className="text-xs text-emerald-400 underline">Android 下载</a>
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
          <p className="text-xs text-slate-300 p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
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
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-emerald-500 transition-colors font-mono"
            />
          </div>

          {/* Private Chat ID */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">
              私聊 Chat ID <span className="text-rose-400">*必填</span>
              <span className="ml-2 text-slate-500">（发给你自己）</span>
            </label>
            <input
              type="text"
              value={draft.chatId}
              onChange={e => setDraft(d => ({ ...d, chatId: e.target.value.trim() }))}
              placeholder="1899924436"
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-emerald-500 transition-colors font-mono"
            />
          </div>

          {/* Group Chat ID */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">
              群组 Chat ID <span className="text-slate-500 font-normal">（可选，同时发到群里）</span>
            </label>
            <input
              type="text"
              value={draft.groupChatId}
              onChange={e => setDraft(d => ({ ...d, groupChatId: e.target.value.trim() }))}
              placeholder="负数，如 -1001234567890（发消息到群后从 getUpdates 获取）"
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-emerald-500 transition-colors font-mono placeholder:text-slate-600"
            />
            {draft.groupChatId && (
              <p className="mt-1 text-xs text-emerald-400">✓ 预警将同时发到私聊 + 群组</p>
            )}
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
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-emerald-500 transition-colors font-mono"
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
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors">
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
            { e: '⏰', l: '操作阶段提醒',    d: '建仓/持仓/止盈各阶段提醒，含价值比判断和三层入场结构建议' },
            { e: '⚠️', l: '中心区间高估警告', d: '中心区间价格 >35¢ 且价值比<1.0 时告警，避免负EV操作' },
            { e: '🚨', l: '落点边界预警',    d: '预测落点距区间边界 ≤10 条，提醒补建相邻保护仓' },
            { e: '📉📈', l: '速率异常',      d: '今日节奏异常少（µ可能虚高）或异常多（不追仓，评估止盈）' },
            { e: '💡', l: '价值比机会',      d: '有区间VR≥1.5或中心高估时，输出完整三层入场结构建议' },
            { e: '💰', l: '止盈信号',        d: '落点区间价格涨至 65%/75% 时提醒分批止盈' },
            { e: '⚠️', l: '落点跑偏',        d: '当前发推数超出落点区间上限，提示新落点和价值比' },
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
