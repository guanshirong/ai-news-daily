/**
 * AI 新闻日报 — 自动更新开关 API
 *
 * Vercel Serverless Function，作为前端和 GitHub API 之间的中继。
 * 部署到 Vercel 后，前端通过这个 API 间接操作 GitHub。
 *
 * 端点:
 *   GET  /api/toggle  读取当前开关状态
 *   POST /api/toggle  翻转开关状态
 *
 * 环境变量 (Vercel 项目设置):
 *   GITHUB_TOKEN  GitHub Personal Access Token (repo 权限)
 *   GITHUB_REPO   仓库名 (默认: guanshirong/ai-news-daily)
 */

const REPO = process.env.GITHUB_REPO || "guanshirong/ai-news-daily";
const API_BASE = `https://api.github.com/repos/${REPO}/contents/docs/config.json`;

/** 构建 GitHub API 请求头 */
function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "User-Agent": "ai-news-toggle-api/1.0",
    Accept: "application/vnd.github.v3+json",
  };
}

/** CORS 头 */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default async function handler(req, res) {
  // CORS 预检
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  // 设置 CORS
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    // ============================================================
    // GET — 读取当前开关状态
    // ============================================================
    if (req.method === "GET") {
      const resp = await fetch(API_BASE, { headers: ghHeaders() });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`GitHub API 读取失败 (${resp.status}): ${text.slice(0, 200)}`);
      }

      const file = await resp.json();
      const config = JSON.parse(Buffer.from(file.content, "base64").toString("utf-8"));

      return res.json({
        active: config.active ?? true,
        lastToggled: config.lastToggled || null,
      });
    }

    // ============================================================
    // POST — 翻转开关状态
    // ============================================================
    if (req.method === "POST") {
      // 1. 读取当前 config.json
      const getResp = await fetch(API_BASE, { headers: ghHeaders() });
      if (!getResp.ok) {
        const text = await getResp.text();
        throw new Error(`读取配置失败 (${getResp.status}): ${text.slice(0, 200)}`);
      }

      const file = await getResp.json();
      const config = JSON.parse(Buffer.from(file.content, "base64").toString("utf-8"));

      // 2. 翻转
      config.active = !config.active;
      config.lastToggled = new Date().toISOString().split("T")[0];

      // 3. 安全清理
      delete config.github_token;

      // 4. Base64 编码并写回
      const contentStr = JSON.stringify(config, null, 2) + "\n";
      const base64 = Buffer.from(contentStr, "utf-8").toString("base64");

      const putResp = await fetch(API_BASE, {
        method: "PUT",
        headers: { ...ghHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `${config.active ? "✅ 开启" : "⏸️ 关闭"}自动更新`,
          content: base64,
          sha: file.sha,
        }),
      });

      if (!putResp.ok) {
        const errBody = await putResp.text();
        throw new Error(`GitHub API 写入失败 (${putResp.status}): ${errBody.slice(0, 200)}`);
      }

      return res.json({
        active: config.active,
        lastToggled: config.lastToggled,
      });
    }

    // 未知方法
    return res.status(404).json({ error: "Not Found" });

  } catch (err) {
    console.error("API error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
