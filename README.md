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
```

## 访问模式

- 免费开放，不收集订阅留资。
- `/api/verify-member` 仅为旧缓存页保留兼容响应，始终返回开放状态。
- `/api/lead` 已停用并返回 `410`，不会接收或转发联系方式。

## 设计规范

最高视觉原则为 SAP / Apple 风格，详见 `知识库/10_网站设计规范.md`。

---

*新项目基于 musk-tweet-quant 复制重建（2026-08-18）*
