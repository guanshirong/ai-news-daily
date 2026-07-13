# 🤖 AI 新闻日报

> 每天早上 8:03 自动搜索 AI 新闻 → DeepSeek 验证 → 发布到网站。完全云端运行，无需电脑开机。

**网址**: `https://guanshirong.github.io/ai-news-daily/`（部署后生效）

---

## 🚀 一键部署

### 第1步：获取 DeepSeek API Key

1. 打开 [platform.deepseek.com](https://platform.deepseek.com/)
2. 注册账号（国内手机号即可）
3. 点击 **API Keys** → **创建 API Key** → 复制保存

> 💰 费用极低：每次日报消耗约 ¥0.01-0.03，每月不到 ¥1

### 第2步：推送代码

```bash
cd "d:/Personal/Desktop/AI推送"

# 关联你的仓库
git remote add origin https://github.com/guanshirong/ai-news-daily.git
git push -u origin master:main
```

### 第3步：设置 Secrets

1. 打开 https://github.com/guanshirong/ai-news-daily/settings/secrets/actions
2. 点击 **New repository secret**
3. Name: `DEEPSEEK_API_KEY`
4. Value: 粘贴你的 DeepSeek API Key
5. 点击 **Add secret**

### 第4步：启用 GitHub Pages

1. 仓库 → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main`，文件夹: `/docs`
4. 点击 **Save**
5. 等待 1-2 分钟，页面顶部会显示你的网址

### 第5步：手动测试

1. 仓库 → **Actions** → **🤖 AI 新闻日报** → **Run workflow**
2. 等待约 2 分钟
3. 打开你的 Pages 网址查看！

---

## 📁 项目结构

```
├── .github/workflows/daily.yml   # GitHub Actions 定时任务
├── scripts/generate.js           # 核心：RSS抓取 + DeepSeek分析
├── docs/                         # 网站根目录
│   ├── index.html                # 主页面（暗色主题）
│   ├── style.css                 # 样式
│   └── data/reports.js           # 日报数据（自动生成）
├── package.json
└── README.md
```

---

## 💰 费用估算

| 项目 | 费用 |
|------|------|
| GitHub Actions | 免费（公开仓库 2000分钟/月） |
| DeepSeek API | 约 ¥0.01/次，每月 **不到 ¥1** |
| GitHub Pages | 免费 |
| **总计** | **约 ¥1/月** |

---

## 🔧 本地运行

```bash
npm install
DEEPSEEK_API_KEY=你的key npm run generate
npm run dev  # 本地预览网站
```
