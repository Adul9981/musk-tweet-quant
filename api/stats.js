import {
  handleAnalyticsPublicStats,
  handleAnalyticsStats,
} from '../lib/analytics-store.js';

export default function handler(req, res) {
  const publicMode = new URL(req.url || '/api/stats', 'https://musk.local')
    .searchParams.get('public') === '1';
  if (publicMode) return handleAnalyticsPublicStats(req, res);
  return handleAnalyticsStats(req, res);
}
