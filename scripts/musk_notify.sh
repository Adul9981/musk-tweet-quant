#!/bin/bash
# 马斯克推文市场 · 定时提醒脚本（系统级 cron，不依赖 Claude Code / VPN 稳定性）
# 每次触发：① 运行分析引擎 ② 生成报告文件 ③ 弹 macOS 通知（含关键结论）

ENGINE="/Users/coveym/Documents/天气监控预测软件/马斯克推文预测市场/scripts/musk_engine.py"
DIR="/Users/coveym/Documents/天气监控预测软件/马斯克推文预测市场/scripts"
REPORT="$DIR/LATEST_ALERT.txt"   # 始终覆盖，保存最新一次分析
LOG="$DIR/musk_alert.log"         # 累积历史日志

BJ_TIME=$(TZ='Asia/Shanghai' date '+%Y-%m-%d %H:%M')
TYPE="${1:-check}"

# ── 根据时间点设置标题 ──────────────────────────────────────
case "$TYPE" in
  prebuild)
    TITLE="🎯 马斯克推文市场 · 建仓窗口"
    HINT="深夜爆发前60分钟，现在是全天最佳建仓时机"
    ;;
  deadzone)
    TITLE="💤 马斯克推文市场 · 死区剪仓评估"
    HINT="全天最低活跃期，冷静评估持仓，有亏损仓位现在出"
    ;;
  morning)
    TITLE="🏙️ 马斯克推文市场 · 晨间建仓窗口"
    HINT="CDT 8am 上午活跃开始，评估是否建立主仓"
    ;;
esac

# ── 运行引擎，捕获完整输出 ──────────────────────────────────
SCAN_OUTPUT=$(python3 "$ENGINE" scan 2>&1)
SCAN_EXIT=$?

# ── 提取关键结论（用于通知正文）───────────────────────────────
# 从输出中提取：中心落点区间、价值比、操作建议
CENTER_LINE=$(echo "$SCAN_OUTPUT" | grep "★" | head -1)
MU_LINE=$(echo "$SCAN_OUTPUT"     | grep "自适应µ" | head -1 | sed 's/.*✨ 自适应µ/自适应µ/')
VR=$(echo "$CENTER_LINE" | grep -o "价值比 [0-9.]*x" | head -1)

if [ $SCAN_EXIT -eq 0 ] && [ -n "$CENTER_LINE" ]; then
  # 提取区间和价值比数字
  RANGE=$(echo "$CENTER_LINE" | awk '{print $2}')
  VR_NUM=$(echo "$VR" | grep -o "[0-9.]*")

  # 提取入场结构总体评估
  ENTRY_EVAL=$(echo "$SCAN_OUTPUT" | grep "总体评估" | head -1 | sed 's/.*总体评估：//')

  # 生成操作建议
  if [ $(echo "$VR_NUM >= 1.2" | bc -l 2>/dev/null || echo 0) -eq 1 ]; then
    ACTION="→ 可建仓 ${RANGE}（主仓VR${VR_NUM}x）| ${ENTRY_EVAL}"
  elif [ $(echo "$VR_NUM >= 1.0" | bc -l 2>/dev/null || echo 0) -eq 1 ]; then
    ACTION="→ 勉强可入 ${RANGE}（VR${VR_NUM}x，等更好时机）"
  else
    ACTION="→ 暂不操作（VR${VR_NUM}x偏高，看两侧区间）"
  fi
  NOTIFY_MSG="${HINT} | ${MU_LINE} | ${ACTION}"
else
  NOTIFY_MSG="${HINT}（数据获取失败，请手动检查）"
  ACTION="数据获取失败"
fi

# ── 写入最新报告文件（始终覆盖）─────────────────────────────
cat > "$REPORT" <<REPORT_EOF
========================================
 马斯克推文市场 · 自动分析报告
 时间：$BJ_TIME（北京时间）
 类型：$TITLE
========================================

$HINT

----------------------------------------
$SCAN_OUTPUT
----------------------------------------

💡 结论：$ACTION

========================================
REPORT_EOF

# ── 追加历史日志 ────────────────────────────────────────────
echo "[$BJ_TIME] [$TYPE] $ACTION" >> "$LOG"

# ── 发送 macOS 通知（双击可在 Finder 打开报告）───────────────
osascript <<OSASCRIPT
display notification "$NOTIFY_MSG" with title "$TITLE" subtitle "点击查看完整报告" sound name "Ping"
OSASCRIPT

# ── 用 macOS 通知中心打开报告（可选：自动打开文本编辑器）────────
# open "$REPORT"   # 取消注释则自动弹出报告文件
