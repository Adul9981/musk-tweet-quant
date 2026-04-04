# Polymarket Split 狙击机器人配置

# ============================================
# 必填配置
# ============================================

# 你的钱包私钥 (以 0x 开头)
PRIVATE_KEY = "0xc1297445b39d42ea68819dcd55a610d652c06bf1ce81ac09807a8f51d770a527"

# Polygon RPC URL (Alchemy)
POLYGON_RPC_URL = "https://polygon-mainnet.g.alchemy.com/v2/tDnx48Q2A63FcyC0j3npm"

# ============================================
# 可选配置
# ============================================

# 每个区间投入的 USDC 数量 (默认 2)
SPLIT_AMOUNT_PER_RANGE = 2

# 最大投入总量 (默认 60)
MAX_TOTAL_USDC = 60

# 监控关键词 (小写)
TARGET_KEYWORDS = ["elon", "musk", "tweet"]
