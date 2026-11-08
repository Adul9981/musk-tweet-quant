import assert from 'node:assert/strict';

process.env.STATS_GIST_ID = 'test-gist';
process.env.GITHUB_TOKEN = 'test-token';
process.env.ANALYTICS_ADMIN_TOKEN = 'test-admin-token';
process.env.ANALYTICS_IP_SALT = 'test-private-salt';

const state = {};
const gist = () => ({
  files: {
    'stats.json': {
      content: JSON.stringify(state),
      truncated: false,
    },
  },
});

globalThis.fetch = async (url, options = {}) => {
  if (options.method === 'PATCH') {
    const body = JSON.parse(options.body);
    Object.assign(state, JSON.parse(body.files['stats.json'].content));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  assert.match(String(url), /api\.github\.com\/gists\/test-gist/);
  return new Response(JSON.stringify(gist()), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

const { handleAnalyticsTrack, handleAnalyticsStats, handleAnalyticsHealth } =
  await import('../lib/analytics-store.js');

function response() {
  const headers = {};
  return {
    statusCode: 200,
    body: undefined,
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    end(value) {
      this.body = value ? JSON.parse(value) : undefined;
    },
    headers,
  };
}

async function track(event, sessionId = 'session_12345', visitorId = 'visitor_12345') {
  const result = response();
  await handleAnalyticsTrack({
    method: 'POST',
    body: {
      visitorId,
      sessionId,
      event,
      linkId: event === 'outbound_click' ? 'polymarket_bet' : '',
      path: '/',
      durationMs: 65000,
      maxScrollPct: 72,
      referrer: 'https://www.google.com/search?q=musk',
      language: 'zh-CN',
      timezone: 'Asia/Shanghai',
    },
    headers: {
      'user-agent': 'Mozilla/5.0 Safari/537.36',
      'x-forwarded-for': '203.0.113.42',
    },
  }, result);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { ok: true });
}

async function stats(days = 1, token = 'test-admin-token') {
  const result = response();
  await handleAnalyticsStats({
    method: 'GET',
    url: `/api/stats?days=${days}`,
    headers: { authorization: `Bearer ${token}` },
  }, result);
  return result;
}

await track('page_view');
await track('heartbeat');
await track('outbound_click');

let result = await stats(1);
assert.equal(result.statusCode, 200);
assert.equal(result.body.overview.uniqueVisitors, 1);
assert.equal(result.body.overview.sessions, 1);
assert.equal(result.body.overview.pageViews, 1);
assert.equal(result.body.overview.activeNow5m, 1);
assert.equal(result.body.outbound[0].link_id, 'polymarket_bet');
assert.equal(result.body.outbound[0].clicks, 1);
assert.equal(state.sites.musk.analyticsV2.sessions.session_12345.language, 'zh-CN');
assert.equal(state.sites.musk.analyticsV2.sessions.session_12345.timezone, 'Asia/Shanghai');
assert.equal(state.sites.musk.analyticsV2.sessions.session_12345.ipHash.length, 24);
assert.notEqual(
  state.sites.musk.analyticsV2.sessions.session_12345.ipHash,
  '203.0.113.42',
);

const sessionDays = state.sites.musk.analyticsV2.sessionDays;
const today = Object.keys(sessionDays)[0];
const [year, month, day] = today.split('-').map(Number);
const previous = new Date(Date.UTC(year, month - 1, day - 1, 12))
  .toISOString()
  .slice(0, 10);
sessionDays[previous] = {
  session_12345: {
    visitorId: 'visitor_12345',
    firstSeen: `${previous}T10:00:00Z`,
    lastSeen: `${previous}T10:05:00Z`,
    pageViews: 1,
  },
};
result = await stats(7);
assert.equal(result.body.overview.sessions, 1, 'cross-day session must be distinct-counted');

await track('page_view', 'session_67890', 'visitor_12345');
result = await stats(7);
assert.equal(result.body.overview.uniqueVisitors, 1);
assert.equal(result.body.overview.sessions, 2);

result = await stats(1, 'wrong-token');
assert.equal(result.statusCode, 401);

const health = response();
handleAnalyticsHealth({ method: 'GET' }, health);
assert.equal(health.statusCode, 200);
assert.equal(health.body.storageConfigured, true);
assert.equal(health.body.adminConfigured, true);

console.log('Analytics check passed: events, session dedupe, auth, and field storage.');
