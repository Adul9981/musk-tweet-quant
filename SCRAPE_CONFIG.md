# Polymarket 数据抓取配置

## 概述

这个脚本会每5分钟自动从 Polymarket 抓取马斯克推文预测市场的区间赔率数据。

## 需要配置的项

### 1. 创建 GitHub Gist

1. 登录 GitHub
2. 点击右上角头像 → "Your gists"
3. 点击 "Create gist"
4. 创建一个空的 gist，文件名设置为 `polymarket-data.json`
5. 复制 Gist URL，例如：`https://gist.github.com/coveym/abc123...`
6. 记住 Gist ID（URL 最后的部分）

### 2. 配置 GitHub Secrets

1. 打开你的 GitHub 仓库
2. 点击 "Settings" → "Secrets and variables" → "Actions"
3. 点击 "New repository secret"
4. 添加：
   - Name: `GIST_URL`
   - Value: 你的 Gist URL（完整 URL）

### 3. 更新 Python 脚本

编辑 `scripts/scrape_polymarket.py` 中的 `MARKET_SLUGS` 列表，添加当前活跃的市场 slug。

## 测试本地运行

```bash
pip install requests
python scripts/scrape_polymarket.py
```

## 查看数据

数据会保存在 Gist 中，可以通过以下 URL 访问：
```
https://gist.githubusercontent.com/{username}/{gist_id}/raw/polymarket-data.json
```

## 手动触发

如果你想立即运行，可以：
1. 打开 GitHub 仓库的 Actions 页面
2. 选择 "Scrape Polymarket Data"
3. 点击 "Run workflow"
