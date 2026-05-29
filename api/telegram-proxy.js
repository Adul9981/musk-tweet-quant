/**
 * Telegram API 代理（解决国内浏览器无法直连 api.telegram.org 的问题）
 * 浏览器 → Vercel（境外）→ Telegram API
 *
 * POST /api/telegram-proxy
 * Body: { botToken: string, chatId: string, message: string }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { botToken, chatId, message } = req.body || {};

  if (!botToken || !chatId || !message) {
    return res.status(400).json({ ok: false, error: '缺少必要参数: botToken / chatId / message' });
  }

  try {
    const tgRes = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    const data = await tgRes.json();

    if (data.ok) {
      return res.status(200).json({ ok: true });
    } else {
      return res.status(200).json({ ok: false, error: data.description ?? JSON.stringify(data) });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
