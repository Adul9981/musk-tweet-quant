#!/usr/bin/env python3
"""
Polymarket Split 自动化脚本 - 直接链上操作
用于狙击新出现的 Polymarket 预测市场

使用方式:
1. 确保钱包有 USDC.e 余额
2. 运行: python polymarket_split.py
"""

import json
import time
from web3 import Web3
from eth_account import Account
import requests

# ============================================
# 配置区域
# ============================================

PRIVATE_KEY = "0xc1297445b39d42ea68819dcd55a610d652c06bf1ce81ac09807a8f51d770a527"
POLYGON_RPC_URL = "https://polygon-mainnet.g.alchemy.com/v2/tDnx48Q2A63FcyC0j3npm"

# 每个区间投入的 USDC 数量
SPLIT_AMOUNT_PER_RANGE = 2

# 最大投入总量
MAX_TOTAL_USDC = 60

# Polymarket CTF 合约
CTF_CONTRACT = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"

# USDC 合约 (Polygon Native USDC)
USDC_CONTRACT = "0x3c499c542cEF5E3811e1192ce70d8cC23d4c0E5b"

# Gamma API
GAMMA_API = "https://gamma-api.polymarket.com"

# 监控关键词
TARGET_KEYWORDS = ["elon", "musk", "tweet"]

# ============================================
# ABI
# ============================================

USDC_ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "spender", "type": "address"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"},
        ],
        "name": "approve",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "address", "name": "owner", "type": "address"},
            {"internalType": "address", "name": "spender", "type": "address"},
        ],
        "name": "allowance",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
]

CTF_ABI = [
    {
        "inputs": [
            {
                "internalType": "contract IERC20",
                "name": "_collateralToken",
                "type": "address",
            },
            {
                "internalType": "bytes32",
                "name": "_parentCollectionId",
                "type": "bytes32",
            },
            {"internalType": "bytes32", "name": "_conditionId", "type": "bytes32"},
            {"internalType": "uint256[]", "name": "_partition", "type": "uint256[]"},
            {"internalType": "uint256", "name": "_amount", "type": "uint256"},
        ],
        "name": "splitPosition",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    }
]

# ============================================
# 核心功能
# ============================================


def connect_web3():
    """连接 Polygon 网络"""
    w3 = Web3(Web3.HTTPProvider(POLYGON_RPC_URL))
    if not w3.is_connected():
        print("❌ 无法连接到 Polygon 网络")
        return None
    print(f"✅ 已连接到 Polygon 网络 (区块: {w3.eth.block_number})")
    return w3


def get_account():
    """获取钱包账户"""
    try:
        account = Account.from_key(PRIVATE_KEY)
        print(f"✅ 钱包地址: {account.address}")
        return account
    except Exception as e:
        print(f"❌ 私钥错误: {e}")
        return None


def check_balance(w3, address):
    """检查 USDC 余额"""
    usdc = w3.eth.contract(
        address=Web3.to_checksum_address(USDC_CONTRACT), abi=USDC_ABI
    )
    balance = usdc.functions.balanceOf(address).call()
    matic_balance = w3.eth.get_balance(address)
    print(f"   USDC.e 余额: {balance / 1e6:.2f}")
    print(f"   MATIC 余额: {w3.from_wei(matic_balance, 'ether'):.4f}")
    return balance / 1e6


def approve_usdc(w3, account, amount):
    """授权 CTF 合约使用 USDC"""
    usdc = w3.eth.contract(
        address=Web3.to_checksum_address(USDC_CONTRACT), abi=USDC_ABI
    )
    ctf_address = Web3.to_checksum_address(CTF_CONTRACT)

    current_allowance = usdc.functions.allowance(account.address, ctf_address).call()

    amount_wei = int(amount * 1e6)

    if current_allowance >= amount_wei:
        print(f"✅ USDC 已授权 (额度: {current_allowance / 1e6:.2f})")
        return True

    print(f"📝 授权 USDC.e ({amount} USDC) 给 CTF 合约...")

    nonce = w3.eth.get_transaction_count(account.address)
    gas_price = w3.eth.gas_price

    tx = usdc.functions.approve(ctf_address, amount_wei).build_transaction(
        {"from": account.address, "nonce": nonce, "gas": 100000, "gasPrice": gas_price}
    )

    signed_tx = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
    print(f"   TX: {tx_hash.hex()}")

    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    if receipt.status == 1:
        print(f"✅ 授权成功")
        return True
    else:
        print(f"❌ 授权失败")
        return False


def fetch_markets():
    """获取活跃的马斯克推文市场"""
    print("\n🔍 搜索活跃市场...")

    try:
        url = f"{GAMMA_API}/markets"
        params = {"closed": "false", "active": "true", "limit": 50}
        response = requests.get(url, params=params, timeout=10)
        markets = response.json()

        target_markets = []
        for m in markets:
            title = m.get("question", "").lower()
            slug = m.get("slug", "")
            if any(kw in title for kw in TARGET_KEYWORDS) or "tweet" in title:
                if not m.get("closed", True):
                    target_markets.append(m)

        if target_markets:
            print(f"✅ 找到 {len(target_markets)} 个活跃市场:")
            for i, m in enumerate(target_markets, 1):
                print(f"\n   {i}. {m.get('question', 'N/A')[:60]}")
                print(f"      slug: {m.get('slug', 'N/A')}")
                vol = float(m.get("volume", 0))
                print(
                    f"      交易量: ${vol / 1e6:.2f}M"
                    if vol > 1e6
                    else f"      交易量: ${vol / 1e3:.2f}K"
                )
        else:
            print("❌ 未找到活跃市场")

        return target_markets

    except Exception as e:
        print(f"❌ 获取市场失败: {e}")
        return []


def get_market_details(slug):
    """获取市场详情"""
    try:
        url = f"{GAMMA_API}/markets/{slug}"
        response = requests.get(url, timeout=10)
        return response.json()
    except:
        return None


def split_market(w3, account, market, amount_per_range=2):
    """执行 Split 操作"""
    market_slug = market.get("slug", "unknown")
    question = market.get("question", "N/A")

    # 获取 condition ID
    condition_id = market.get("conditionId")
    if not condition_id:
        print(f"❌ 市场 {market_slug} 没有 conditionId")
        return False

    outcome_count = market.get("outcomeSlotCount", 2)
    print(f"\n🎯 Split 市场: {question[:50]}...")
    print(f"   Condition ID: {condition_id}")
    print(f"   结果数量: {outcome_count}")

    # 确定 partition
    if outcome_count == 2:
        # 二进制市场: [Yes, No]
        partition = [1, 2]
    else:
        # 多选项市场
        partition = [2**i for i in range(outcome_count)]

    total_amount = amount_per_range * len(partition)
    total_amount_wei = int(total_amount * 1e6)

    print(f"   区间数量: {len(partition)}")
    print(f"   总投入: {total_amount} USDC.e")

    # 检查余额
    usdc = w3.eth.contract(
        address=Web3.to_checksum_address(USDC_CONTRACT), abi=USDC_ABI
    )
    balance = usdc.functions.balanceOf(account.address).call()

    if balance < total_amount_wei:
        print(f"❌ USDC.e 余额不足! 需要 {total_amount}, 实际 {balance / 1e6:.2f}")
        return False

    # 授权
    if not approve_usdc(w3, account, total_amount):
        return False

    # 执行 Split
    print(f"\n📝 执行 Split...")

    ctf = w3.eth.contract(address=Web3.to_checksum_address(CTF_CONTRACT), abi=CTF_ABI)

    parent_collection = "0x" + "0" * 64

    nonce = w3.eth.get_transaction_count(account.address)
    gas_price = w3.eth.gas_price

    try:
        tx = ctf.functions.splitPosition(
            Web3.to_checksum_address(USDC_CONTRACT),
            parent_collection,
            condition_id,
            partition,
            total_amount_wei,
        ).build_transaction(
            {
                "from": account.address,
                "nonce": nonce,
                "gas": 500000,
                "gasPrice": gas_price,
            }
        )

        signed_tx = account.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        print(f"   TX: {tx_hash.hex()}")

        print(f"⏳ 等待确认...")
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

        if receipt.status == 1:
            print(f"✅ Split 成功!")
            print(f"   获得 {total_amount} 套代币 (每区间 {amount_per_range} 个)")
            return True
        else:
            print(f"❌ Split 失败!")
            return False

    except Exception as e:
        print(f"❌ Split 错误: {str(e)[:100]}")
        return False


def main():
    print("\n" + "=" * 50)
    print("🎯 Polymarket Split 狙击机器人")
    print("=" * 50 + "\n")

    # 连接
    w3 = connect_web3()
    if not w3:
        return

    # 账户
    account = get_account()
    if not account:
        return

    # 余额
    balance = check_balance(w3, account.address)

    if balance < 10:
        print(f"\n⚠️  USDC.e 余额较低 ({balance:.2f})")

    # 获取市场
    markets = fetch_markets()

    if not markets:
        print("\n没有找到活跃市场，退出")
        return

    # 选择市场
    print("\n" + "-" * 50)
    print("选择要 Split 的市场:")
    for i, m in enumerate(markets, 1):
        print(f"  {i}. {m.get('question', 'N/A')[:50]}...")
    print(f"  0. 全部尝试")
    print("-" * 50)

    try:
        choice = input("\n请选择 (数字): ").strip()
        if not choice:
            return

        choice_idx = int(choice)

        if choice_idx == 0:
            # 尝试所有市场
            for market in markets:
                print(f"\n{'=' * 50}")
                split_market(w3, account, market, SPLIT_AMOUNT_PER_RANGE)
                time.sleep(2)
        else:
            market = markets[choice_idx - 1]
            split_market(w3, account, market, SPLIT_AMOUNT_PER_RANGE)

    except KeyboardInterrupt:
        print("\n\n👋 退出")
    except Exception as e:
        print(f"\n❌ 错误: {e}")


if __name__ == "__main__":
    main()
