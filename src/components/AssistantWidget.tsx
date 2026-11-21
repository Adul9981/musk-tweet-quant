import { useRef, useState } from 'react';
import { Bot, ExternalLink, MessageCircle, Send, Sparkles, X } from 'lucide-react';

type Topic =
  | 'overview'
  | 'mechanics'
  | 'scoring'
  | 'model'
  | 'center'
  | 'entry'
  | 'execution'
  | 'alerts'
  | 'membership'
  | 'identity'
  | 'risk'
  | 'telegram'
  | 'unknown';

interface FaqItem {
  topic: Topic;
  label: string;
  keywords: string[];
  answer: string;
  cta?: boolean;
}

interface Message {
  id: number;
  role: 'assistant' | 'user';
  text: string;
  cta?: boolean;
}

const FAQS: FaqItem[] = [
  {
    topic: 'overview',
    label: '这个工具能做什么？',
    keywords: ['工具', '功能', '能做', '怎么用', '是什么', '帮助'],
    answer:
      '它把马斯克推文数量、Polymarket 区间价格、落点预测和价格形态放在一起，帮你回答三个问题：\n\n1. 当前推文节奏会把落点带到哪里？\n2. 哪些区间的价格与模型概率不匹配？\n3. 现在适合观察、等确认，还是需要重新评估仓位？\n\n它是研究工具，不保证收益。',
  },
  {
    topic: 'center',
    label: '中心落点是什么意思？',
    keywords: ['中心', '落点', '预测', '区间', 'µ', 'mu', '概率'],
    answer:
      '中心落点是模型根据当前累计推文数、剩余时间和近期节奏估算出的最可能落点。\n\n不要只盯一个中心区间：近13期回测里，T-1 的单一区间精确命中约38%，但中心上下各一档的覆盖约85%。因此更合理的是看“中心 + 下方保护 + 上方覆盖”。',
  },
  {
    topic: 'mechanics',
    label: '预测市场的价格怎么看？',
    keywords: ['预测市场', 'yes', 'no', '价格', '赔率', '盘口', '概率', '结算'],
    answer:
      'Polymarket 的二元市场通常用 YES/NO 价格表达市场隐含概率。\n\n• YES 价格 20¢，可粗略理解为市场认为约20%概率发生，不是“20元”或保证收益；\n• 若事件发生，YES 结算为 $1；不发生则归零；\n• NO 价格通常约为 100¢ 减去 YES 价格；\n• 最后成交价不等于真实概率，还需要看买卖价差、盘口深度和最新信息。\n\n判断区间时，不能只看便宜，还要把模型概率与市场价格比较。',
  },
  {
    topic: 'scoring',
    label: '马斯克推文数量怎么计？',
    keywords: ['计数', '推文', '转发', '回复', '引用', '怎么算', '统计规则', 'utc', '时区'],
    answer:
      '本项目采用的计数口径为：普通发帖计入；isReply=false 的推文计入；转推和引用计入；时间按 UTC 周窗口切分。\n\n最终仍以 Polymarket 市场的官方结算规则和结算结果为准。弹幕、评论或媒体转述不能替代官方规则。页面里的累计数、xtracker 和最终结算源不一致时，应标注数据分歧并核对官方源。',
  },
  {
    topic: 'model',
    label: '落点模型是怎么算的？',
    keywords: ['模型', '算法', '怎么算', '泊松', 'poisson', '误差', '均值', 'mu', 'µ', '预测方法'],
    answer:
      '当前落点模型综合累计推文、已过时间、当前速率和近期24小时节奏。区间概率用泊松分布估算，并随剩余时间不断更新。\n\n常见误差：\n• 单日爆发或异常沉默；\n• 剩余时间越长，误差越大；\n• 公开计数源短暂延迟；\n• 换周/换期时数据源没有对齐。\n\n所以模型给的是概率分布，不是确定答案。T-3 的误差明显大于 T-1，越接近结算，±1档覆盖通常越高。',
  },
  {
    topic: 'entry',
    label: '什么时候适合关注或入场？',
    keywords: ['什么时候', '入场', '建仓', '买入', '三天', '两天', '一天', 't-3', 'T-3', '提前'],
    answer:
      '历史回测给出的节奏是：\n\n• T-3：开始观察，可评估轻仓，±1档覆盖约54%\n• T-2：重点跟踪，覆盖率约69%\n• T-1：信息最充分，覆盖率约85%\n\n因此不是越早越好，也不是等到最后追价格。系统会在 T-3 提醒你检查中心与相邻区间；之后落点变化会再次提醒。所有买卖仍需你人工确认。',
  },
  {
    topic: 'execution',
    label: '收到提醒后该怎么判断？',
    keywords: ['收到提醒', '怎么办', '怎么判断', '执行', '判断条件', '关注区间', '保护仓', '仓位'],
    answer:
      '收到提醒后按四步检查：\n\n1. 期次是否一致：提醒中的截止时间和你看到的市场必须相同；\n2. 落点是否更新：中心区间有没有变化；\n3. 价格是否有价值：VR ≥1.0，最好 ≥1.2，同时看盘口深度和价差；\n4. 风险是否可承受：优先看中心±1档，而不是只押中心一档，并预设最大亏损。\n\n提醒只说明“值得关注”，不等于立即买入。中心价过高、流动性太差或临近结算时，应该降低操作甚至放弃。',
  },
  {
    topic: 'alerts',
    label: '强提醒是怎么工作的？',
    keywords: ['提醒', '预警', '通知', '强提醒', 'telegram', 'tg', '价格变化', '反弹'],
    answer:
      '服务器每分钟检查当前市场，目前包含四类提醒：\n\n• T-3 入场观察\n• 中心落点变化\n• 低价区间进入关注区\n• 低价后反弹确认\n\n提醒会给出区间、价格、VR、落点和剩余时间。它只负责提醒，不会自动下单。',
    cta: true,
  },
  {
    topic: 'membership',
    label: '会员之后能获得什么价值？',
    keywords: ['会员', '付费', '订阅', '价格', '权益', '价值', '区别', '转化'],
    answer:
      '当前网站仍然免费开放，会员方案处于筹备阶段。会员价值不会只是“多看几张图”，而是围绕执行闭环：\n\n• 更及时的私域强提醒与落点变化提醒\n• 每期结束后的自动复盘与命中验证\n• 中心、保护仓和相邻区间的结构化跟踪\n• 常见问题答疑与交易纪律检查\n• 后续的专题内容、频道和一对一咨询\n\n具体价格与权益以正式发布为准，也不会承诺收益。',
    cta: true,
  },
  {
    topic: 'identity',
    label: '这个工具怎样改变我的交易方式？',
    keywords: ['身份', '转变', '成长', '学习', '训练', '纪律', '体系', '方法'],
    answer:
      '目标不是让你多买几个区间，而是完成三次转变：\n\n1. 从盯单点价格 → 看中心与上下覆盖结构\n2. 从凭感觉追涨杀跌 → 按入场窗口、VR 和风险条件执行\n3. 从一次性交易 → 每期留痕、复盘并积累自己的判断记录\n\n工具负责提供结构和证据，你负责做最终决策。',
    cta: true,
  },
  {
    topic: 'risk',
    label: '有没有风险？会保证赚钱吗？',
    keywords: ['风险', '保证', '稳赚', '亏损', '赔钱', '胜率', '收益'],
    answer:
      '不会保证赚钱。模型存在误差，历史命中率不能代表未来结果；事件末段流动性、单日爆发、消息面和盘口变化都可能让价格快速反转。\n\n本工具只提供数据、提醒和复盘框架，不构成投资建议。任何仓位都应先设定最大亏损和退出条件。',
  },
  {
    topic: 'telegram',
    label: '怎么咨询或订阅频道？',
    keywords: ['咨询', '联系', '客服', '频道', '订阅频道', 'telegram', 'tg'],
    answer:
      '可以通过下面的入口联系：\n\n• 个人咨询：@serene7mc\n• 订阅频道：@polymarket_ad\n\n频道用于市场观察和更新，个人咨询更适合工具问题、会员方案和合作。',
    cta: true,
  },
];

const QUICK_QUESTIONS = [
  '会员之后能获得什么价值？',
  '预测市场的价格怎么看？',
  '马斯克推文数量怎么计？',
  '落点模型是怎么算的？',
  '收到提醒后该怎么判断？',
  '什么时候适合关注或入场？',
  '中心落点是什么意思？',
  '强提醒是怎么工作的？',
];

function trackAssistant(action: 'open' | 'question' | 'fallback' | 'cta', topic: Topic) {
  try {
    const visitorId = localStorage.getItem('musk_visitor_id');
    const sessionId = sessionStorage.getItem('musk_session_id');
    if (!visitorId || !sessionId) return;
    const body = JSON.stringify({
      visitorId,
      sessionId,
      event: 'assistant_event',
      assistantAction: action,
      assistantTopic: topic,
      path: window.location.pathname,
      durationMs: 0,
      maxScrollPct: 0,
      referrer: document.referrer,
      language: navigator.language || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* Analytics must not block the assistant. */
  }
}

function matchTopic(text: string): FaqItem {
  const normalized = text.toLowerCase().replace(/\s+/g, '');
  let best = FAQS[FAQS.length - 1];
  let bestScore = 0;
  for (const item of FAQS) {
    const score = item.keywords.reduce(
      (total, keyword) => total + Number(normalized.includes(keyword.toLowerCase())),
      0,
    );
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : {
    topic: 'unknown',
    label: '暂未匹配',
    keywords: [],
    answer:
      '这个问题还没有匹配到固定答案。你可以换一种问法，或直接联系 @serene7mc。\n\n我现在最擅长回答：中心落点、入场窗口、强提醒、会员价值和风险边界。',
    cta: true,
  };
}

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: 'assistant',
      text:
        '你好，我是 Musk Quant 使用助手。\n\n我可以解释中心落点、入场窗口、强提醒和会员价值。这里只做答疑与信息展示，不会自动交易。',
    },
  ]);
  const nextId = useRef(2);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) trackAssistant('open', 'overview');
  };

  const ask = (question: string) => {
    const text = question.trim();
    if (!text) return;
    const faq = matchTopic(text);
    const isFallback = faq.topic === 'unknown';
    trackAssistant(isFallback ? 'fallback' : 'question', faq.topic);
    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: 'user', text },
      {
        id: nextId.current++,
        role: 'assistant',
        text: faq.answer,
        cta: Boolean(faq.cta),
      },
    ]);
    setInput('');
  };

  return (
    <>
      {open && (
        <section className="fixed bottom-20 right-4 sm:right-6 z-[90] w-[calc(100%-2rem)] max-w-[390px] rounded-3xl border border-[#e5e5ea] bg-white shadow-[0_18px_60px_rgba(0,0,0,.18)] overflow-hidden">
          <header className="flex items-center gap-3 px-4 py-3 border-b border-[#e5e5ea] bg-white/95 backdrop-blur">
            <div className="w-9 h-9 rounded-xl bg-[#e8f6f3] flex items-center justify-center">
              <Bot className="w-4.5 h-4.5 text-[#0e9486]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#1d1d1f]">Musk Quant 助手</p>
              <p className="text-[10px] text-[#86868b]">常见问题 · 会员价值 · 工具答疑</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="ml-auto p-1.5 rounded-full text-[#86868b] hover:bg-[#f2f2f4]"
              aria-label="关闭问答助手"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          <div className="h-[390px] overflow-y-auto px-4 py-4 space-y-3 bg-[#f7f8fa]">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line ${
                    message.role === 'user'
                      ? 'bg-[#0e9486] text-white rounded-br-md'
                      : 'bg-white text-[#3a3a3c] border border-[#e5e5ea] rounded-bl-md'
                  }`}
                >
                  {message.text}
                  {message.cta && message.role === 'assistant' && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href="https://t.me/serene7mc"
                        target="_blank"
                        rel="noopener noreferrer"
                        data-track-link="telegram_consult"
                        onClick={() => trackAssistant('cta', 'membership')}
                        className="inline-flex items-center gap-1 rounded-full bg-[#0e9486] text-white px-3 py-1.5 font-semibold"
                      >
                        个人咨询 <ExternalLink className="w-3 h-3" />
                      </a>
                      <a
                        href="https://t.me/polymarket_ad/"
                        target="_blank"
                        rel="noopener noreferrer"
                        data-track-link="telegram_channel"
                        onClick={() => trackAssistant('cta', 'telegram')}
                        className="inline-flex items-center gap-1 rounded-full bg-white border border-[#d8d8dd] text-[#3a3a3c] px-3 py-1.5 font-semibold"
                      >
                        订阅频道 <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="px-3 pt-3 pb-2 bg-white border-t border-[#e5e5ea]">
            <div className="flex gap-1.5 overflow-x-auto pb-2">
              {QUICK_QUESTIONS.map((question) => (
                <button
                  key={question}
                  onClick={() => ask(question)}
                  className="shrink-0 rounded-full border border-[#d8d8dd] bg-white px-2.5 py-1.5 text-[10px] text-[#6e6e73] hover:border-[#8bd0c5] hover:text-[#0e9486]"
                >
                  {question}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && ask(input)}
                placeholder="问：落点变了怎么办？"
                className="min-w-0 flex-1 rounded-xl border border-[#d8d8dd] bg-[#f7f8fa] px-3 py-2 text-xs text-[#1d1d1f] focus:outline-none focus:border-[#0e9486]"
              />
              <button
                onClick={() => ask(input)}
                className="w-9 h-9 rounded-xl bg-[#0e9486] text-white flex items-center justify-center"
                aria-label="发送问题"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="mt-2 text-[9px] text-[#a1a1a6] text-center">只提供信息与研究参考，不构成投资建议</p>
          </div>
        </section>
      )}

      <button
        onClick={toggle}
        className="fixed bottom-5 right-4 sm:right-6 z-[89] flex items-center gap-2 rounded-full bg-[#1d1d1f] text-white pl-3 pr-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,.2)] hover:bg-[#0e9486] transition-colors"
        aria-label={open ? '收起问答助手' : '打开问答助手'}
      >
        {open ? <X className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
        <span className="text-xs font-semibold">{open ? '收起' : '有问题？'}</span>
        {!open && <Sparkles className="w-3 h-3 text-[#7ddfd1]" />}
      </button>
    </>
  );
}
