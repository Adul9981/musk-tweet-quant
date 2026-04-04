#!/bin/bash
# 启动 Polymarket Split 狙击机器人

echo "========================================"
echo "🎯 Polymarket Split 狙击机器人"
echo "========================================"
echo ""

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "❌ 需要安装 Python 3"
    echo "请访问 https://www.python.org/downloads/ 下载安装"
    exit 1
fi

# 进入脚本目录
cd "$(dirname "$0")"

# 检查配置文件
if [ ! -f "config.py" ]; then
    echo "⚠️  未找到 config.py"
    echo "正在复制配置模板..."
    cp config.example.py config.py
    echo ""
    echo "请编辑 config.py 填写你的私钥和 RPC URL"
    echo "然后重新运行此脚本"
    exit 1
fi

# 安装依赖
echo "📦 安装依赖..."
pip3 install -r requirements.txt

# 运行脚本
echo ""
echo "🚀 启动机器人..."
python3 polymarket_sniper.py
