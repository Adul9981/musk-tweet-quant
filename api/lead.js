/**
 * /api/lead — retired subscription intake endpoint.
 *
 * The product is fully free and does not collect subscription leads. Keep the
 * route as an explicit tombstone so cached clients cannot submit contact data.
 */
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  return res.status(410).json({
    disabled: true,
    accessMode: 'free',
    message: '该工具已完全免费开放，无需订阅或留资。',
  });
}
