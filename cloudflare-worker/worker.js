/**
 * Telegram Proxy Worker for Musk Tweet Prediction Market
 *
 * 部署步骤：
 * 1. 登录 dash.cloudflare.com → Workers & Pages → Create Worker
 * 2. 把这段代码粘贴进去，点 Deploy
 * 3. 复制 Worker URL，填入 App 的 Telegram 设置中
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'Invalid JSON' }, 400);
    }

    const { botToken, chatId, message } = body;
    if (!botToken || !chatId || !message) {
      return json({ ok: false, error: 'Missing botToken / chatId / message' }, 400);
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      const result = await res.json();
      return json(result, res.ok ? 200 : 400);
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
