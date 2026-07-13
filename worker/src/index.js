/**
 * AI 新闻日报 — 自动更新开关中继
 *
 * Cloudflare Worker，作为前端和 GitHub API 之间的中继层。
 * - 前端在国内调 Worker → Worker 在国外调 GitHub API
 * - GitHub Token 只存在 Worker 环境变量，不暴露前端
 *
 * 端点:
 *   GET  /        读取当前开关状态
 *   POST /toggle  翻转开关状态
 *
 * 环境变量 (wrangler secret put):
 *   GITHUB_TOKEN  GitHub Personal Access Token (repo 权限)
 *
 * 部署: wrangler deploy
 */

export default {
  async fetch(request, env) {
    // ============================================================
    // CORS 预检
    // ============================================================
    const corsHeaders = {
      "Access-Control-Allow-Origin": env.CORS_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ============================================================
    // GitHub API 配置
    // ============================================================
    const REPO = env.GITHUB_REPO || "guanshirong/ai-news-daily";
    const apiUrl = `https://api.github.com/repos/${REPO}/contents/docs/config.json`;

    const ghHeaders = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "ai-news-toggle-worker/1.0",
      Accept: "application/vnd.github.v3+json",
    };

    try {
      // ==========================================================
      // GET / — 读取当前开关状态
      // ==========================================================
      if (request.method === "GET") {
        const resp = await fetch(apiUrl, { headers: ghHeaders });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`GitHub API 读取失败 (${resp.status}): ${text.slice(0, 200)}`);
        }

        const file = await resp.json();
        const config = JSON.parse(atob(file.content));

        return json(200, {
          active: config.active ?? true,
          lastToggled: config.lastToggled || null,
        }, corsHeaders);
      }

      // ==========================================================
      // POST /toggle — 翻转开关状态
      // ==========================================================
      if (request.method === "POST") {
        // 1. 读取当前 config.json
        const getResp = await fetch(apiUrl, { headers: ghHeaders });
        if (!getResp.ok) {
          const text = await getResp.text();
          throw new Error(`读取配置失败 (${getResp.status}): ${text.slice(0, 200)}`);
        }

        const file = await getResp.json();
        const config = JSON.parse(atob(file.content));

        // 2. 翻转状态
        config.active = !config.active;
        config.lastToggled = new Date().toISOString().split("T")[0];

        // 3. 安全清理：绝不让 token 残留写回
        delete config.github_token;

        // 4. Base64 编码并写回
        const contentStr = JSON.stringify(config, null, 2) + "\n";
        const base64 = btoa(unescape(encodeURIComponent(contentStr)));

        const putResp = await fetch(apiUrl, {
          method: "PUT",
          headers: { ...ghHeaders, "Content-Type": "application/json" },
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

        return json(200, {
          active: config.active,
          lastToggled: config.lastToggled,
        }, corsHeaders);
      }

      // 未知路径
      return json(404, { error: "Not Found" }, corsHeaders);

    } catch (err) {
      console.error("Worker error:", err.message);
      return json(500, { error: err.message }, corsHeaders);
    }
  },
};

/**
 * 构建 JSON 响应
 */
function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}
