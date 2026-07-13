/**
 * AI 新闻日报生成器
 * 每天运行：抓取 RSS → Claude 筛选验证 → 生成结构化日报 → 更新网站
 *
 * 用法: node scripts/generate.js
 * 环境变量: ANTHROPIC_API_KEY (必需)
 */

import Anthropic from "@anthropic-ai/sdk";
import RssParser from "rss-parser";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DATA_DIR = join(REPO_ROOT, "docs", "data");
const DATA_FILE = join(DATA_DIR, "reports.js");
const INDEX_FILE = join(REPO_ROOT, "docs", "index.html");

// ============================================================
// 配置
// ============================================================

/** RSS 新闻源列表 */
const RSS_FEEDS = [
  { name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/" },
  { name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/" },
  { name: "ScienceDaily AI", url: "https://www.sciencedaily.com/rss/computers_math/artificial_intelligence.xml" },
  { name: "The Verge AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { name: "ZDNet AI", url: "https://www.zdnet.com/topic/artificial-intelligence/rss.xml" },
];

/** Claude 模型选择 */
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

/** 搜索目标：前天（UTC+8） */
function getTargetDate() {
  const now = new Date();
  const target = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  return target.toISOString().split("T")[0]; // YYYY-MM-DD
}

/** 今天的日期（用于记录生成日期） */
function getToday() {
  return new Date().toISOString().split("T")[0];
}

// ============================================================
// 工具函数
// ============================================================

/** 标准化日期字符串 */
function normalizeDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split("T")[0];
  } catch {
    return null;
  }
}

/** 计算与目标日期的天数差 */
function daysFrom(dateStr, target) {
  const d = normalizeDate(dateStr);
  if (!d) return Infinity;
  return Math.abs(new Date(d).getTime() - new Date(target).getTime());
}

// ============================================================
// 步骤1: 抓取 RSS 新闻
// ============================================================

async function fetchAllFeeds() {
  const parser = new RssParser({
    timeout: 15000,
    headers: {
      "User-Agent": "AI-News-Daily-Bot/1.0",
    },
  });

  const allItems = [];

  for (const feed of RSS_FEEDS) {
    try {
      console.log(`  📡 抓取: ${feed.name}...`);
      const result = await parser.parseURL(feed.url);
      const items = (result.items || []).map((item) => ({
        title: item.title?.trim() || "",
        link: item.link || "",
        pubDate: item.pubDate || item.isoDate || "",
        source: feed.name,
        snippet: (item.contentSnippet || item.content || "")
          .replace(/<[^>]*>/g, "")
          .slice(0, 300)
          .trim(),
      }));
      console.log(`     ✅ 获得 ${items.length} 条`);
      allItems.push(...items);
    } catch (err) {
      console.log(`     ⚠️ 失败: ${err.message}`);
    }
  }

  return allItems;
}

// ============================================================
// 步骤2: 用 Claude 筛选、验证、总结
// ============================================================

async function summarizeWithClaude(items, targetDate) {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // 预处理：按日期筛选，保留最近3天的
  const recentItems = items.filter((item) => daysFrom(item.pubDate, targetDate) <= 3);

  // 去重（按标题相似度简单处理 — 完全相同标题去重）
  const seen = new Set();
  const uniqueItems = recentItems.filter((item) => {
    const key = item.title.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`  📊 预处理后剩余 ${uniqueItems.length} 条候选新闻`);

  if (uniqueItems.length === 0) {
    console.log("  ⚠️ 无候选新闻，生成空报告");
    return null;
  }

  // 构建 Claude 的输入
  const newsList = uniqueItems
    .map(
      (item, i) =>
        `[${i + 1}] ${item.title}\n   来源: ${item.source} | 日期: ${item.pubDate}\n   链接: ${item.link}\n   摘要: ${item.snippet}`
    )
    .join("\n\n");

  const systemPrompt = `你是一位资深AI行业分析师。你的任务是根据提供的新闻列表，生成一份中文AI新闻日报。

要求：
1. **筛选**：只保留目标日期（${targetDate}）前后真正重要的AI新闻。忽略无关内容。
2. **验证**：对每条入选新闻评估来源可信度（1-5星）。知名媒体/官方来源=高可信度，匿名/个人博客=低可信度。
3. **去重**：同一事件被多个来源报道的，合并为一条，列出所有来源。
4. **总结**：每条新闻用简短中文概括（2-3句话），抓住核心信息。
5. **信号**：提炼当日AI领域的2-3个关键趋势信号。

请严格按照以下JSON格式返回（不要包含任何其他文字）：

{
  "summary": "一句话概括今日AI新闻全局（中文，20字以内）",
  "headlines": [
    {
      "title": "新闻标题（中文翻译）",
      "summary": "2-3句话中文概括核心内容",
      "importance": "high | medium | low",
      "sources": ["原始来源名称", ...],
      "sourceUrls": ["原始链接", ...],
      "credibility": 5,
      "category": "模型发布 | 商业动态 | 政策监管 | 学术突破 | 产业应用 | 资本市场"
    }
  ],
  "signals": ["趋势信号1", "趋势信号2", "趋势信号3"]
}

重要规则：
- 整个响应必须是一个合法的JSON对象，不要有任何前缀或后缀
- headlines 数组包含 5-10 条最重要的新闻
- 每条新闻的 credibility 是1-5的整数
- 如果有同一事件被多个来源报道，合并为一条
- 忽略与AI无关的新闻
- 如果没有足够的高质量新闻，宁可少报也不凑数`;

  console.log(`  🤖 调用 Claude (${MODEL}) 进行分析...`);

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `以下是 ${targetDate} 前后AI领域的新闻列表。请筛选、验证并生成结构化日报：\n\n${newsList}`,
      },
    ],
  });

  // 解析 Claude 的响应
  const text = msg.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  // 尝试提取 JSON（处理可能的 markdown 代码块包裹）
  let jsonStr = text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const report = JSON.parse(jsonStr);
    console.log(`  ✅ Claude 分析完成，生成 ${report.headlines?.length || 0} 条新闻`);
    return report;
  } catch (err) {
    console.error(`  ❌ JSON 解析失败: ${err.message}`);
    console.error(`  原始响应前500字符: ${text.slice(0, 500)}`);
    return null;
  }
}

// ============================================================
// 步骤3: 更新网站数据
// ============================================================

function updateWebsite(report, targetDate) {
  const today = getToday();
  const now = new Date().toISOString();

  // 构建报告对象
  const entry = {
    date: today,
    generated: now,
    queryDate: targetDate,
    summary: report?.summary || `暂无 ${targetDate} 的重要AI新闻`,
    headlines: report?.headlines || [],
    signals: report?.signals || [],
    sourceCount: report?.headlines?.reduce((sum, h) => sum + (h.sources?.length || 0), 0) || 0,
  };

  // 确保数据目录存在
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  // 读取现有数据
  let reports = [];
  if (existsSync(DATA_FILE)) {
    try {
      const content = readFileSync(DATA_FILE, "utf-8");
      const match = content.match(/const REPORTS = (\[[\s\S]*?\]);/);
      if (match) {
        reports = JSON.parse(match[1]);
      }
    } catch (err) {
      console.log(`  ⚠️ 读取现有数据失败，将创建新文件: ${err.message}`);
    }
  }

  // 检查是否已有同一天的报告（避免重复）
  const existingIdx = reports.findIndex((r) => r.queryDate === targetDate);
  if (existingIdx >= 0) {
    console.log(`  ℹ️ ${targetDate} 的报告已存在，更新中...`);
    reports[existingIdx] = entry;
  } else {
    reports.unshift(entry);
  }

  // 保持最多90天的报告
  const trimmed = reports.slice(0, 90);

  // 写入 data.js
  const jsContent = `// 🤖 自动生成 — 请勿手动编辑
// 最后更新: ${now}
// 每天 8:00 AM (北京时间) GitHub Actions 自动运行
const REPORTS = ${JSON.stringify(trimmed, null, 2)};
`;
  writeFileSync(DATA_FILE, jsContent, "utf-8");
  console.log(`  📝 已更新 docs/data/reports.js (${trimmed.length} 条报告)`);

  // 更新 index.html 的时间戳（确保浏览器能看到新内容）
  if (existsSync(INDEX_FILE)) {
    let html = readFileSync(INDEX_FILE, "utf-8");
    html = html.replace(
      /<meta name="last-updated" content="[^"]*">/,
      `<meta name="last-updated" content="${now}">`
    );
    writeFileSync(INDEX_FILE, html, "utf-8");
    console.log(`  🔄 已更新 index.html 时间戳`);
  }
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  const targetDate = getTargetDate();
  const today = getToday();

  console.log("=".repeat(60));
  console.log("  🤖 AI 新闻日报生成器");
  console.log("=".repeat(60));
  console.log(`  查询日期: ${targetDate}（前天）`);
  console.log(`  生成日期: ${today}`);
  console.log(`  新闻源数: ${RSS_FEEDS.length}`);
  console.log("=".repeat(60));

  // 检查 API Key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ 错误: 未设置 ANTHROPIC_API_KEY 环境变量");
    process.exit(1);
  }

  // 步骤1: 抓取 RSS
  console.log("\n📡 步骤 1/3: 抓取 RSS 新闻源...");
  const items = await fetchAllFeeds();
  console.log(`  📦 总计抓取 ${items.length} 条新闻\n`);

  // 步骤2: Claude 分析
  console.log("🧠 步骤 2/3: Claude 分析与验证...");
  const report = await summarizeWithClaude(items, targetDate);

  if (!report) {
    console.log("\n⚠️ Claude 分析失败，生成空报告");
  }

  // 步骤3: 更新网站
  console.log("\n📝 步骤 3/3: 更新网站数据...");
  updateWebsite(report, targetDate);

  console.log("\n" + "=".repeat(60));
  console.log("  ✅ 日报生成完成！");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("❌ 致命错误:", err);
  process.exit(1);
});
