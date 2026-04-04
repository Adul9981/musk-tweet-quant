# Polymarket Split 狙击机器人配置
# 请复制此文件为 config.py 并填写你的信息

# ============================================
# 必填配置
# ============================================

# 你的钱包私钥 (以 0x 开头)
# 危险! 不要泄露给他人!
PRIVATE_KEY = "0x..."

# Polygon RPC URL (推荐使用 Alchemy)
# 免费注册: https://www.alchemy.com/
POLYGON_RPC_URL = "https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY"

# ============================================
# 可选配置
# ============================================

# 每个区间投入的 USDC 数量 (默认 2)
SPLIT_AMOUNT_PER_RANGE = 2

# 最大投入总量 (默认 60)
MAX_TOTAL_USDC = 60

# 监控关键词 (小写)
TARGET_KEYWORDS = ["elon", "musk", "tweet"]
