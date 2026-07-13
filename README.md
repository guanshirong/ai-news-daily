# 🤖 AI 新闻日报

> 每天早上 8:03 自动搜索 AI 新闻 → Claude 验证 → 发布到网站。完全云端运行，无需电脑开机。

**网址**: `https://你的用户名.github.io/ai-news-daily/`（部署后获得）

---

## 🚀 一键部署

### 第1步：创建 GitHub 仓库

1. 在 [GitHub](https://github.com/new) 新建仓库，命名为 `ai-news-daily`
2. **不要**勾选 "Initialize this repository with a README"

### 第2步：推送代码

```bash
cd "d:/Personal/Desktop/AI推送"

# 初始化
git init
git add .
git commit -m "🎉 初始化 AI 新闻日报"

# 关联你的仓库（替换为你的用户名）
git remote add origin https://github.com/你的用户名/ai-news-daily.git
git push -u origin main
```

### 第3步：设置 Secrets

1. 打开仓库 → **Settings** → **Secrets and variables** → **Actions**
2. 点击 **New repository secret**
3. Name: `ANTHROPIC_API_KEY`
4. Value: 你的 Claude API Key（在 [console.anthropic.com](https://console.anthropic.com) 获取）
5. 点击 **Add secret**

### 第4步：启用 GitHub Pages

1. 仓库 → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main`，文件夹: `/docs`
4. 点击 **Save**
5. 等待 1-2 分钟，页面顶部会显示你的网址

### 第5步：手动测试

1. 仓库 → **Actions** → **🤖 AI 新闻日报** → **Run workflow**
2. 等待约 2 分钟执行完毕
3. 打开你的 Pages 网址查看效果！

---

## 📁 项目结构

```
├── .github/workflows/daily.yml   # GitHub Actions 定时任务
├── scripts/generate.js           # 核心：RSS抓取 + Claude分析
├── docs/                         # 网站根目录
│   ├── index.html                # 主页面
│   ├── style.css                 # 样式
│   └── data/reports.js           # 日报数据（自动生成）
├── package.json
└── README.md
```

---

## ⚙️ 配置

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `ANTHROPIC_API_KEY` | Claude API 密钥（**必需**） | - |
| `CLAUDE_MODEL` | 使用的模型 | `claude-sonnet-4-20250514` |

修改 RSS 源：编辑 `scripts/generate.js` 中的 `RSS_FEEDS` 数组。

修改推送时间：编辑 `.github/workflows/daily.yml` 中的 `cron` 表达式。

---

## 💰 费用估算

- **GitHub Actions**: 公开仓库免费（2000分钟/月，本任务每月消耗约 30 分钟）
- **Claude API**: 每次约 $0.01-0.05（取决于新闻量和模型选择）
- **总计**: 每月约 **$0.3-1.5**

---

## 🔧 本地运行

```bash
# 安装依赖
npm install

# 生成日报
ANTHROPIC_API_KEY=你的key npm run generate

# 本地预览网站
npm run dev
```
