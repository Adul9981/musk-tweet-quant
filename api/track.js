import { handleAnalyticsTrack } from '../lib/analytics-store.js';

export default function handler(req, res) {
  return handleAnalyticsTrack(req, res);
}
