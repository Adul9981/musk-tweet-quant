/**
 * /api/track — 页面访问打点（浏览器调用，纯 GitHub 方案）
 *
 * 事件写入私有 Gist（STATS_GIST_ID / GITHUB_TOKEN），按 site=musk 独立统计，
 * 与会员名单 / 留资台账同一套基建，不依赖 VPS。
 * 说明：Gist 读改写在高并发下有极小概率丢一次计数（内部看板可接受）。
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  await bumpStats(
    String(body.page || "/").slice(0, 200),
    String(body.visitor || "").slice(0, 64)
  );
  return res.status(200).json({ ok: true });
}

async function bumpStats(page, visitor) {
  const gistId = process.env.STATS_GIST_ID;
  const token = process.env.GITHUB_TOKEN;
  if (!gistId || !token) return;
  const base = `https://api.github.com/gists/${gistId}`;
  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
  try {
    const r = await fetch(base, { headers, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return;
    const gist = await r.json();
    let d;
    try {
      d = JSON.parse(gist.files?.["stats.json"]?.content || "{}");
    } catch {
      d = {};
    }
    d.updated_at = new Date().toISOString().slice(0, 10);
    const sites = d.sites || (d.sites = {});
    const s = sites.musk || (sites.musk = { days: {}, all_visitors: [], total_views: 0 });
    const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    const day = s.days[today] || (s.days[today] = { views: 0, visitors: [] });
    day.views += 1;
    if (visitor && !day.visitors.includes(visitor)) day.visitors.push(visitor);
    if (visitor && !s.all_visitors.includes(visitor)) s.all_visitors.push(visitor);
    s.total_views += 1;
    await fetch(base, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        files: { "stats.json": { content: JSON.stringify(d, null, 2) + "\n" } },
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* 统计失败不影响页面 */
  }
}
