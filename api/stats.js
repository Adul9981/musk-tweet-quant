import { handleAnalyticsStats } from '../lib/analytics-store.js';

export default function handler(req, res) {
  return handleAnalyticsStats(req, res);
}
