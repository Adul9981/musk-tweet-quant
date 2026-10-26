/**
 * /api/stats — 页面访问统计（今日/本周/累计访问，纯 GitHub 方案）
 *
 * 2026-10-26 起产品为完全免费开放模式，不再读取或返回会员数据。
 * 访问统计读取统计 Gist（STATS_GIST_ID / GITHUB_TOKEN），按 site=musk 独立。
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const out = { source: "musk", site: "musk", access_mode: "free" };

  // 访问统计（统计 Gist）
  const gistId = process.env.STATS_GIST_ID;
  const token = process.env.GITHUB_TOKEN;
  if (gistId && token) {
    try {
      const r = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const g = await r.json();
        const d = JSON.parse(g.files?.["stats.json"]?.content || "{}");
        const s = d?.sites?.musk || { days: {}, all_visitors: [], total_views: 0 };
        const days = Object.entries(s.days || {})
          .map(([date, v]) => ({ date, views: v.views, visitors: v.visitors.length }))
          .sort((a, b) => (a.date < b.date ? -1 : 1));
        const today = days.length ? days[days.length - 1].date : null;
        const week = days.slice(-7);
        const weekVisitors = new Set();
        let weekViews = 0;
        for (const w of week) {
          weekViews += w.views;
          const raw = s.days[w.date]?.visitors || [];
          raw.forEach((v) => weekVisitors.add(v));
        }
        const todayEntry = today ? days.find((x) => x.date === today) : null;
        out.date = new Date().toISOString().slice(0, 10);
        out.today_views = todayEntry ? todayEntry.views : 0;
        out.today_visitors = todayEntry ? todayEntry.visitors : 0;
        out.week_views = weekViews;
        out.week_visitors = weekVisitors.size;
        out.total_views = s.total_views || days.reduce((a, x) => a + x.views, 0);
        out.total_visitors = Array.isArray(s.all_visitors) ? s.all_visitors.length : 0;
        out.days = days.slice(-14);
        out.stats_status = "ok";
      } else {
        out.stats_status = `http_${r.status}`;
      }
    } catch (err) {
      out.stats_status = "error";
      out.stats_error = String(err?.message || err);
    }
  } else {
    out.stats_status = "not configured";
  }

  return res.status(200).json(out);
}
