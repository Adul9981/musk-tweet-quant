import { handleAnalyticsHealth } from '../lib/analytics-store.js';

export default function handler(req, res) {
  return handleAnalyticsHealth(req, res);
}
