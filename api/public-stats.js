import { handleAnalyticsPublicStats } from '../lib/analytics-store.js';

export default function handler(req, res) {
  return handleAnalyticsPublicStats(req, res);
}
