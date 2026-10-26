/**
 * /api/verify-member — legacy compatibility endpoint.
 *
 * The product has been permanently switched to open access. This endpoint
 * remains only so cached clients receive a successful response instead of an
 * error; no account, membership list, or expiration check is performed.
 */
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method === 'GET') {
    return res.status(200).json({
      member: true,
      freePeriod: true,
      publicMode: true,
      plan: 'free',
      expires: null,
    });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  return res.status(200).json({
    member: true,
    freePeriod: true,
    publicMode: true,
    plan: 'free',
    expires: null,
  });
}
