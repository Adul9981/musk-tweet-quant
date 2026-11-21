# Musk Tweet Quant v2 · 马斯克推文预测量化

> 实时追踪马斯克推文，量化分析 Polymarket "马斯克周推文数"预测市场的区间定价、
> 发推节奏与入场信号。v2 为界面重构版：全站统一 **SAP / Apple 浅色风格**。
>
> **2026-10-26 起完全免费开放：无需注册、无需订阅，全部功能直接使用。**

## 功能

- **市场概览**：KPI（推文数 / 时速 / 剩余时间 / 当前窗口）、预测落点、区间定价（价格 / VR / 盈亏比）、入场信号卡、今日节奏 & 24h 发推热力图
- **概率分析**：盘口价值比、模型概率与 VR 对照
- **发推热力图**：按小时 / 按日的马斯克发推分布
- **形态对比**：走势形态预测 · 区间对比分析（六种历史形态模板 A–F，独立页 `public/morphology_compare.html` 嵌入接入）
- **工具区**：持仓管理 · 推文生成 · 策略指南 · 预警（Telegram）
- **落地页**：`landing-page/index.html`（Musk Quant Radar，同款浅色风格）
- **使用统计**：`/analytics.html`（公开只读聚合页，顶部导航可进入）

## 数据

- **实时 API 为主**：Polymarket Gamma/CLOB、xtracker、polystrike（见 `知识库/09_推文计数数据源清单.md`）
- **本地数据库兜底**：`data/`（从 GitHub Gist 导出：市场数据 / 价格历史 / 推文统计）
- **重建数据库**：`python3 scripts/rebuild_db.py`（联网从 Gist 拉取并校验）；`--offline` 只校验本地
- **密钥**：`.env` 保留原数据源 API Key（已加入 `.gitignore`，请勿提交到公开仓库）

## 开发

```bash
npm install
npm run dev       # 本地开发
npm run build     # 产物在 dist/
npm run preview   # 预览构建产物
npm run check:free # 检查构建产物中无付费墙 / 订阅入口
npm run check:analytics # 审计匿名事件、会话去重和管理员鉴权
```

## 访问模式

- 免费开放，不收集订阅留资。
- `/api/verify-member` 仅为旧缓存页保留兼容响应，始终返回开放状态。
- `/api/lead` 已停用并返回 `410`，不会接收或转发联系方式。

## 匿名使用统计

- `/api/track` 接收 `page_view`、`heartbeat`、`page_hide`、`outbound_click`。
- `/api/stats?days=1|7|30|90&public=1` 公开返回只读匿名聚合，页面每 60 秒刷新。
- `/api/stats?days=1|7|30|90`（不带 `public=1`）保留管理员 Bearer Token 保护。
- `/api/health` 只报告存储与公开统计状态，不返回访问数据。
- 数据保存在私有 Gist 的 `stats.json`，不保存原始 IP。
- Vercel 环境变量：`STATS_GIST_ID`、`GITHUB_TOKEN`、
  `ANALYTICS_ADMIN_TOKEN`（或沿用 `STATS_SECRET`）、`ANALYTICS_IP_SALT`。
- 页面与导流明细保留 180 天；访客与会话聚合保留 400 天。
- 统计页和站点页脚提供个人咨询 `@serene7mc` 与订阅频道 `@polymarket_ad` 入口。

## 低价关注与强提醒

服务器常驻服务 `musk-alert.service` 每分钟检查当前马斯克推文市场：

- T-3 入场观察：距到期 48–76 小时发送一次，列出中心区间和上下相邻区间，
  并附近13期回测：T-3/T-2/T-1 的 ±1 档覆盖率分别约 54%/69%/85%。
- 落点变化：中心区间改变，或 µ 单次变化 ≥20 条时提醒，2 小时冷却。
- 低价关注：YES ≤10¢、VR ≥1.0、距当前落点 ≤60 条或 VR ≥1.5。
- 反弹确认：近 30 分钟低点 ≤10¢，当前较低点反弹 ≥2¢，模型概率 ≥2%。
- 仅在距到期 6–72 小时运行；每个区间分别做 6 小时/3 小时提醒冷却。
- 提醒发送到已配置的 Telegram 私聊，并写入
  `/var/lib/musk-quant/watch-events.jsonl` 供后续复盘。
- 服务只提醒，不读取钱包、不签名、不下单。

服务管理：

```bash
systemctl status musk-alert.service
journalctl -u musk-alert.service -f
```

## 问答助手与转化统计

主页面右下角提供规则型“Musk Quant 助手”，覆盖：

- 工具功能与中心落点；
- T-3/T-2/T-1 入场观察；
- 强提醒和落点变化；
- 会员价值、交易身份转变与风险边界；
- 个人咨询和订阅频道入口。

助手不保存原始问题文本，只记录匿名动作、主题、未命中次数和咨询点击。完整统计仅在
受管理员保护的 `/api/stats` 返回，公开统计页不展示转化数据。

## 设计规范

最高视觉原则为 SAP / Apple 风格，详见 `知识库/10_网站设计规范.md`。

---

*新项目基于 musk-tweet-quant 复制重建（2026-08-18）*
