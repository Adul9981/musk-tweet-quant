#!/usr/bin/env python3
"""
Polymarket Split 自动化脚本
用于狙击新出现的 Polymarket 预测市场

使用方式:
1. 配置钱包私钥和 RPC URL
2. 运行: python polymarket_sniper.py
"""

import json
import time
import os
from datetime import datetime
from web3 import Web3
from eth_account import Account
import requests

# ============================================
# 配置区域 - 请根据你的实际情况修改
# ============================================

# 你的钱包私钥 (不要泄露给他人!)
PRIVATE_KEY = "YOUR_PRIVATE_KEY_HERE"

# Polygon RPC 节点 (可以使用免费的 Alchemy/Infura)
POLYGON_RPC_URL = "https://polygon-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY"
# 或使用公共 RPC:
# POLYGON_RPC_URL = "https://polygon-rpc.com"

# 每个区间投入的 USDC 数量
SPLIT_AMOUNT_PER_RANGE = 2  # 每个区间 2 USDC

# 最多投入的 USDC 总数
MAX_TOTAL_USDC = 60

# Polymarket CTF 合约地址
CTF_CONTRACT = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"

# USDC.e 合约地址
USDC_CONTRACT = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"

# 监控的市场关键词
TARGET_KEYWORDS = ["elon", "musk", "tweet"]

# ============================================
# 合约 ABI (简化版)
# ============================================

CTF_ABI = [
    {
        "inputs": [
            {"internalType": "contract IERC20", "name": "_collateralToken", "type": "address"},
            {"internalType": "bytes32", "name": "_parentCollectionId", "type": "bytes32"},
            {"internalType": "bytes32", "name": "_conditionId", "type": "bytes32"},
            {"internalType": "uint256[]", "name": "_partition", "type": "uint256[]"},
            {"internalType": "uint256", "name": "_amount", "type": "uint256"}
        ],
        "name": "splitPosition",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "contract IERC20", "name": "token", "type": "address"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"}
        ],
        "name": "approve",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]

USDC_ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "spender", "type": "address"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"}
        ],
        "name": "approve",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
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
        print("请检查 RPC URL 是否正确")
        return None
    print(f"✅ 已连接到 Polygon 网络")
    print(f"   最新区块: {w3.eth.block_number}")
    return w3

def get_account():
    """获取钱包账户"""
    if PRIVATE_KEY == "YOUR_PRIVATE_KEY_HERE":
        print("❌ 请先配置你的私钥!")
        print("编辑脚本文件, 修改 PRIVATE_KEY 变量")
        return None
    
    try:
        account = Account.from_key(PRIVATE_KEY)
        print(f"✅ 钱包地址: {account.address}")
        return account
    except Exception as e:
        print(f"❌ 私钥格式错误: {e}")
        return None

def check_balance(w3, address):
    """检查 USDC 余额"""
    usdc = w3.eth.contract(address=Web3.to_checksum_address(USDC_CONTRACT), abi=USDC_ABI)
    balance = usdc.functions.balanceOf(address).call()
    balance_usdc = balance / 1e6
    print(f"   USDC.e 余额: {balance_usdc:.2f}")
    return balance_usdc

def approve_usdc(w3, account):
    """授权 CTF 合约使用 USDC"""
    usdc = w3.eth.contract(address=Web3.to_checksum_address(USDC_CONTRACT), abi=USDC_ABI)
    ctf_address = Web3.to_checksum_address(CTF_CONTRACT)
    
    current_allowance = usdc.functions.allowance(account.address, ctf_address).call()
    
    if current_allowance > 0:
        print(f"✅ USDC 已授权 (剩余额度: {current_allowance / 1e6:.2f})")
        return True
    
    print(f"📝 授权 USDC.e 给 CTF 合约...")
    nonce = w3.eth.get_transaction_count(account.address)
    
    tx = usdc.functions.approve(
        ctf_address,
        2**256 - 1  # 授权最大值
    ).build_transaction({
        'from': account.address,
        'nonce': nonce,
        'gas': 100000,
        'gasPrice': w3.eth.gas_price
    })
    
    signed_tx = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
    w3.eth.wait_for_transaction_receipt(tx_hash)
    print(f"✅ 授权完成, TX: {tx_hash.hex()}")
    return True

def fetch_markets():
    """获取活跃的 Polymarket 市场"""
    print("\n🔍 搜索马斯克推文相关市场...")
    
    try:
        # 从 Gamma API 获取市场列表
        url = "https://gamma-api.polymarket.com/markets"
        params = {
            "closed": "false",
            "limit": 50
        }
        response = requests.get(url, params=params, timeout=10)
        markets = response.json()
        
        # 筛选马斯克相关市场
        target_markets = []
        for m in markets:
            title = m.get("question", "").lower()
            if any(kw in title for kw in TARGET_KEYWORDS):
                target_markets.append(m)
        
        if target_markets:
            print(f"✅ 找到 {len(target_markets)} 个目标市场:")
            for i, m in enumerate(target_markets, 1):
                print(f"   {i}. {m.get('question', 'N/A')}")
                print(f"      slug: {m.get('slug', 'N/A')}")
                print(f"      交易量: ${float(m.get('volume', 0)) / 1e6:.2f}M")
                print()
        else:
            print("❌ 未找到目标市场")
        
        return target_markets
        
    except Exception as e:
        print(f"❌ 获取市场失败: {e}")
        return []

def get_market_details(slug):
    """获取市场的详细信息"""
    try:
        url = f"https://gamma-api.polymarket.com/markets/{slug}"
        response = requests.get(url, timeout=10)
        return response.json()
    except Exception as e:
        print(f"❌ 获取市场详情失败: {e}")
        return None

def split_market(w3, account, market, amount_per_range=2):
    """执行 Split 操作"""
    market_slug = market.get("slug", "unknown")
    condition_id = market.get("conditionId")
    
    if not condition_id:
        print(f"❌ 市场 {market_slug} 没有 conditionId")
        return False
    
    print(f"\n🎯 准备 Split 市场: {market.get('question', market_slug)}")
    print(f"   Condition ID: {condition_id}")
    print(f"   每个区间投入: {amount_per_range} USDC.e")
    
    ctf = w3.eth.contract(
        address=Web3.to_checksum_address(CTF_CONTRACT),
        abi=CTF_ABI
    )
    
    # 计算需要多少个区间
    # 二进制市场 partition = [1, 2]
    # 多选项市场需要更复杂的处理
    
    # 先检查是否是二进制市场
    outcome_slot_count = market.get("outcomeSlotCount", 2)
    print(f"   结果数量: {outcome_slot_count}")
    
    if outcome_slot_count == 2:
        # 二进制市场
        partition = [1, 2]  # [Yes, No]
    else:
        # 多选项市场 - 需要获取所有可能的 partition
        # 这里简化处理, 实际需要根据市场结构确定
        print(f"⚠️  多选项市场需要更复杂的处理")
        partition = list(range(1, outcome_slot_count + 1))
    
    total_amount = amount_per_range * len(partition)
    print(f"   总投入: {total_amount} USDC.e")
    
    if total_amount > MAX_TOTAL_USDC:
        print(f"❌ 超出预算 ({MAX_TOTAL_USDC} USDC)")
        return False
    
    # 检查余额
    usdc = w3.eth.contract(address=Web3.to_checksum_address(USDC_CONTRACT), abi=USDC_ABI)
    balance = usdc.functions.balanceOf(account.address).call()
    
    if balance < total_amount * 1e6:
        print(f"❌ USDC.e 余额不足! 需要 {total_amount}, 实际 {balance / 1e6:.2f}")
        return False
    
    # 授权
    approve_usdc(w3, account)
    
    # 构建交易
    nonce = w3.eth.get_transaction_count(account.address)
    
    parent_collection = "0x" + "0" * 64  # 永远是 0
    
    tx = ctf.functions.splitPosition(
        Web3.to_checksum_address(USDC_CONTRACT),
        parent_collection,
        condition_id,
        partition,
        int(total_amount * 1e6)  # 转换为 wei (USDC 6位精度)
    ).build_transaction({
        'from': account.address,
        'nonce': nonce,
        'gas': 500000,
        'gasPrice': w3.eth.gas_price
    })
    
    print(f"📝 签名交易...")
    signed_tx = account.sign_transaction(tx)
    
    print(f"📤 发送交易...")
    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
    print(f"   TX Hash: {tx_hash.hex()}")
    
    print(f"⏳ 等待确认...")
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    
    if receipt.status == 1:
        print(f"✅ Split 成功!")
        print(f"   区块: {receipt.blockNumber}")
        return True
    else:
        print(f"❌ Split 失败!")
        return False

def monitor_and_split(w3, account, check_interval=60):
    """监控并自动 Split 新市场"""
    processed_markets = set()
    
    print("\n" + "="*50)
    print("🚀 开始监控 Polymarket 市场")
    print(f"   检查间隔: {check_interval} 秒")
    print("="*50 + "\n")
    
    while True:
        try:
            markets = fetch_markets()
            
            for market in markets:
                slug = market.get("slug")
                if slug in processed_markets:
                    continue
                
                # 检查是否是活跃市场
                if market.get("closed"):
                    continue
                
                print(f"\n🆕 发现新市场: {slug}")
                
                # 询问用户是否执行 Split
                question = market.get("question", "N/A")
                print(f"   问题: {question}")
                
                user_input = input(f"\n是否执行 Split? (y/n/q): ").strip().lower()
                
                if user_input == 'y':
                    success = split_market(w3, account, market, SPLIT_AMOUNT_PER_RANGE)
                    if success:
                        processed_markets.add(slug)
                elif user_input == 'q':
                    print("\n👋 退出程序")
                    return
                else:
                    processed_markets.add(slug)
            
        except KeyboardInterrupt:
            print("\n\n👋 用户中断, 退出程序")
            return
        except Exception as e:
            print(f"\n❌ 发生错误: {e}")
            print("   5 秒后重试...")
            time.sleep(5)
        
        print(f"\n⏰ {datetime.now().strftime('%H:%M:%S')} - 等待 {check_interval} 秒...")
        time.sleep(check_interval)

# ============================================
# 主程序
# ============================================

def main():
    print("\n" + "="*50)
    print("🎯 Polymarket Split 狙击机器人")
    print("="*50 + "\n")
    
    # 连接网络
    w3 = connect_web3()
    if not w3:
        return
    
    # 获取账户
    account = get_account()
    if not account:
        return
    
    # 检查余额
    balance = check_balance(w3, account.address)
    if balance < 10:
        print(f"⚠️  USDC.e 余额较低 ({balance:.2f}), 建议至少 60 USDC")
        response = input("是否继续? (y/n): ").strip().lower()
        if response != 'y':
            return
    
    # 监控模式
    print("\n" + "-"*50)
    print("选择模式:")
    print("1. 监控模式 - 持续监控新市场并提示")
    print("2. 单次检查 - 检查一次后退出")
    print("-"*50)
    
    mode = input("请选择 (1/2): ").strip()
    
    if mode == "1":
        monitor_and_split(w3, account)
    else:
        markets = fetch_markets()
        if markets:
            print(f"\n找到 {len(markets)} 个市场")
            for i, m in enumerate(markets, 1):
                print(f"\n{i}. {m.get('question', 'N/A')}")
                user_input = input("是否 Split? (y/n): ").strip().lower()
                if user_input == 'y':
                    split_market(w3, account, m, SPLIT_AMOUNT_PER_RANGE)

if __name__ == "__main__":
    main()
