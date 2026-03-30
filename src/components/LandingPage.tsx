import { useState, useEffect } from 'react';
import { 
  Zap, 
  BarChart3, 
  Grid3X3, 
  Bell,
  Shield,
  CheckCircle,
  Star,
  Users,
  Gift,
  ExternalLink,
  Clock,
  ChevronDown,
  TrendingUp
} from 'lucide-react';
import { HeatmapPreview } from './HeatmapPreview';

const REFERRAL = '?via=serene77mc-g6kj';

export function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [showFaq, setShowFaq] = useState<number | null>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const features = [
    {
      icon: Grid3X3,
      title: '发推生物钟热力图',
      desc: '实时展示马斯克发推时间分布，精准抓取"深度睡眠区"与"爆肝输出带"',
      color: 'from-yellow-400 to-orange-500'
    },
    {
      icon: BarChart3,
      title: '盘口价值比扫描仪',
      desc: 'Polymarket 赔率实时追踪，自动计算各区间真实胜率，一眼看穿散户溢价与错杀金矿',
      color: 'from-purple-400 to-indigo-500'
    },
    {
      icon: TrendingUp,
      title: '动态 Sigma 引擎',
      desc: '告别死板估算，基于历史数据动态计算"发疯系数"，随时间流逝智能调整预测',
      color: 'from-cyan-400 to-blue-500'
    },
    {
      icon: Bell,
      title: '实时预警通知',
      desc: '每当马斯克发推，立即推送至你的 Telegram，第一时间掌握市场异动',
      color: 'from-emerald-400 to-teal-500'
    },
    {
      icon: Shield,
      title: '智能研报生成',
      desc: '一键生成带有数据支撑的分析推文，支持 Twitter/Telegram 快速分享',
      color: 'from-rose-400 to-pink-500'
    },
    {
      icon: Zap,
      title: '目标时速倒推',
      desc: '精确计算到达目标区间所需的"生死时速"，制定最优交易策略',
      color: 'from-amber-400 to-yellow-500'
    }
  ];

  const faqs = [
    {
      q: '这个工具适合什么人？',
      a: 'Polymarket 预测市场交易员、加密货币投资者、关注马斯克动态的专业玩家。'
    },
    {
      q: '$1 体验 3 天包含什么？',
      a: '解锁全部高级功能，包括热力图、概率分析、实时预警等。'
    },
    {
      q: '订阅后能退款吗？',
      a: 'Polymarket 预测市场瞬息万变，付费后不支持退款，请谨慎决策。'
    },
    {
      q: '涨价后我的价格会变吗？',
      a: '不会！一旦订阅成功，你的月费终身锁定，即使后续涨价也不影响你。'
    },
    {
      q: '如何成为 Tier 2/Tier 3？',
      a: '当 Tier 1 的 30 个名额售完后，系统自动切换到 Tier 2（$35.99/月），依此类推。越早订阅越便宜。'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white">
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-gray-950/95 backdrop-blur-md border-b border-gray-800' : ''
      }`}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
              <Zap className="w-5 h-5 text-gray-900" />
            </div>
            <span className="text-lg font-bold">Musk Quant Radar</span>
          </div>
          <a
            href={`https://musk-tweet-quant-rtmv.vercel.app${REFERRAL}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 font-semibold rounded-full hover:from-yellow-300 hover:to-orange-400 transition-all"
          >
            免费试用
          </a>
        </div>
      </header>

      <section className="pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-full text-yellow-400 text-sm mb-8">
            <Star className="w-4 h-4" />
            <span>极速 FOMO 定价 · 仅限前 30 名早鸟</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
            Musk Quant Radar
          </h1>
          
          <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
            实时追踪 · 精准分析 · 智能预警
            <br />
            让每一次发推都成为你的赚钱机会
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://buy.polar.sh/polar_cl_eS0DOBQMeKcjyNtWqGeBANg1uWdCuVPEzDE9n1xpkC3"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 font-bold text-lg rounded-xl hover:from-yellow-300 hover:to-orange-400 transition-all shadow-lg shadow-orange-500/25"
            >
              <Clock className="w-5 h-5" />
              $1 体验 3 天
            </a>
            <a
              href={`https://polymarket.com/event/elon-musk-of-tweets${REFERRAL}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-8 py-4 bg-gray-800 border border-gray-700 text-white font-semibold text-lg rounded-xl hover:bg-gray-700 transition-all"
            >
              <ExternalLink className="w-5 h-5" />
              查看 Polymarket 市场
            </a>
          </div>

          <div className="mt-12 flex items-center justify-center gap-8 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span>内测 12 名交易员已加入</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>7x24 小时自动运行</span>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-gradient-to-b from-transparent via-gray-900/50 to-transparent">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">🛠️ 核心功能</h2>
          <p className="text-gray-400 text-center mb-12">你花钱买到的 Alpha</p>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div key={i} className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition-all">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4`}>
                  <f.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">📊 工具预览</h2>
          <p className="text-gray-400 text-center mb-12">界面截图展示</p>
          
          <div className="mb-8">
            <HeatmapPreview isSubscribed={false} />
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="bg-gray-800 px-4 py-3 flex items-center gap-2 border-b border-gray-700">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="ml-4 text-sm text-gray-400">市场概览</span>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-gray-800 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">当前总数</p>
                    <p className="text-xl font-bold text-white">247</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">今日新增</p>
                    <p className="text-xl font-bold text-cyan-400">18</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">日均时速</p>
                    <p className="text-xl font-bold text-yellow-400">42</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">剩余时间</p>
                    <p className="text-xl font-bold text-purple-400">5天</p>
                  </div>
                </div>
                <div className="bg-purple-900/30 border border-purple-500/20 rounded-xl p-3">
                  <p className="text-sm text-gray-300">预测中心落点</p>
                  <p className="text-lg font-bold text-cyan-400">~285 条</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="bg-gray-800 px-4 py-3 flex items-center gap-2 border-b border-gray-700">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="ml-4 text-sm text-gray-400">概率分析</span>
              </div>
              <div className="p-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-700">
                      <th className="text-left py-2">区间</th>
                      <th className="text-right">市场%</th>
                      <th className="text-right">真实%</th>
                      <th className="text-right">Alpha</th>
                      <th className="text-center">信号</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-800 bg-emerald-500/10">
                      <td className="py-2 text-yellow-400">[270-290]</td>
                      <td className="text-right text-gray-400">18.5%</td>
                      <td className="text-right text-cyan-400">22.3%</td>
                      <td className="text-right text-emerald-400 font-bold">1.21</td>
                      <td className="text-center"><span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs">买入</span></td>
                    </tr>
                    <tr className="border-b border-gray-800">
                      <td className="py-2">[250-269]</td>
                      <td className="text-right text-gray-400">15.2%</td>
                      <td className="text-right text-cyan-400">14.8%</td>
                      <td className="text-right text-amber-400 font-bold">0.97</td>
                      <td className="text-center"><span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs">观望</span></td>
                    </tr>
                    <tr className="border-b border-gray-800">
                      <td className="py-2">[290-310]</td>
                      <td className="text-right text-gray-400">12.8%</td>
                      <td className="text-right text-cyan-400">11.2%</td>
                      <td className="text-right text-rose-400 font-bold">0.88</td>
                      <td className="text-center"><span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 rounded text-xs">卖出</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">💎 订阅与定价</h2>
            <p className="text-gray-400">极速 FOMO 机制 · 每满 30 人涨价 20%</p>
          </div>

          <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-3xl p-8 mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="text-sm text-yellow-400 font-semibold">🔥 当前阶段</span>
                <h3 className="text-2xl font-bold mt-1">Tier 1 早鸟</h3>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-yellow-400">$29.99</div>
                <div className="text-sm text-gray-500">/ 月</div>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
              <p className="text-amber-400 font-semibold flex items-center gap-2">
                <Users className="w-5 h-5" />
                仅剩 <span className="text-2xl">18</span> 个早鸟席位
              </p>
              <p className="text-sm text-gray-400 mt-1">内部测试已锁定 12 席，Tier 1 最低价即将售罄</p>
            </div>

            <div className="space-y-3 mb-8">
              {['解锁全部高级功能', '实时 Telegram 预警通知', '专属内部 Alpha 交流群', '终身价格锁定'].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-gray-300">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <a
              href="https://buy.polar.sh/polar_cl_Wr69bVRI6VXyaediphMwMxWl2PSbVljXCy11E1kEZSq"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 font-bold text-lg rounded-xl text-center hover:from-yellow-300 hover:to-orange-400 transition-all"
            >
              立即订阅 · $29.99/月
            </a>
          </div>

          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4 text-center">📈 订阅费用升级规则</h3>
            <div className="space-y-4">
              <div className="grid md:grid-cols-4 gap-4">
                {[
                  { tier: 'Tier 1', range: '1-30 名', price: '$29.99', condition: '基础价格', status: 'current' },
                  { tier: 'Tier 2', range: '31-60 名', price: '$35.99', condition: '+20%', status: 'locked' },
                  { tier: 'Tier 3', range: '61-90 名', price: '$43.19', condition: '+44%', status: 'locked' },
                  { tier: 'Tier 4', range: '91-120 名', price: '$51.83', condition: '+73%', status: 'locked' },
                ].map((t, i) => (
                  <div key={i} className={`p-4 rounded-xl border text-center ${
                    t.status === 'current' 
                      ? 'bg-yellow-500/10 border-yellow-500/40' 
                      : 'bg-gray-800/50 border-gray-700'
                  }`}>
                    <p className={`text-sm font-bold ${t.status === 'current' ? 'text-yellow-400' : 'text-gray-400'}`}>
                      {t.tier}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{t.range}</p>
                    <p className={`text-lg font-bold mt-2 ${t.status === 'current' ? 'text-yellow-400' : 'text-gray-300'}`}>
                      {t.price}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{t.condition}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-400 text-center">
                <span className="text-emerald-400">规则：</span>每满 30 名订阅用户，下一阶段订阅费自动上涨 20%。
                一旦订阅成功，你的月费终身锁定。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-gradient-to-b from-transparent via-purple-950/20 to-transparent">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-purple-900/30 to-indigo-900/30 border border-purple-500/20 rounded-3xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <Gift className="w-8 h-8 text-purple-400" />
              <h2 className="text-2xl font-bold">🤝 裂变邀请机制</h2>
            </div>

            <div className="bg-gray-900/50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-emerald-400 mb-3">邀请人奖励</h3>
              <p className="text-gray-300">
                每成功邀请 1 位新用户正式订阅，
                系统将返还你当月订阅费的 <span className="text-emerald-400 font-bold text-xl">20%</span>
              </p>
              <div className="mt-4 p-3 bg-gray-800/50 rounded-lg">
                <p className="text-sm text-gray-400">
                  <span className="text-yellow-400">示例：</span>你订阅 $29.99/月，邀请的朋友也订阅 $29.99/月，
                  你当月可获得 <span className="text-emerald-400 font-bold">$6</span> 返还
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">❓ 常见问题</h2>
          
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowFaq(showFaq === i ? null : i)}
                  className="w-full p-5 flex items-center justify-between text-left"
                >
                  <span className="font-semibold">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {showFaq === i && (
                  <div className="px-5 pb-5 text-gray-400 text-sm">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">🚀 准备好抢 Alpha 了吗？</h2>
          <p className="text-gray-400 mb-8">
            Tier 1 仅剩 18 席，越早加入越划算
          </p>
          <a
            href="https://buy.polar.sh/polar_cl_eS0DOBQMeKcjyNtWqGeBANg1uWdCuVPEzDE9n1xpkC3"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-10 py-5 bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 font-bold text-xl rounded-xl hover:from-yellow-300 hover:to-orange-400 transition-all shadow-lg shadow-orange-500/25"
          >
            <Clock className="w-6 h-6" />
            $1 体验 3 天 · 终身锁价 $29.99
          </a>
          <p className="text-xs text-gray-500 mt-4">
            不满意？3 天内随时退款
          </p>
        </div>
      </section>

      <footer className="py-8 px-4 border-t border-gray-800">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span>Musk Quant Radar</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <a href={`https://musk-tweet-quant-rtmv.vercel.app${REFERRAL}`} className="hover:text-white transition-colors">
              工具演示
            </a>
            <a href={`https://polymarket.com/event/elon-musk-of-tweets${REFERRAL}`} className="hover:text-white transition-colors">
              Polymarket
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
