import { createHmac, timingSafeEqual } from 'node:crypto';

const TIMEZONE = 'Asia/Shanghai';
const EVENT_TYPES = new Set([
  'page_view',
  'heartbeat',
  'page_hide',
  'outbound_click',
  'assistant_event',
]);
const ASSISTANT_ACTIONS = new Set(['open', 'question', 'fallback', 'cta']);
const ASSISTANT_TOPICS = new Set([
  'overview',
  'mechanics',
  'scoring',
  'model',
  'center',
  'entry',
  'execution',
  'alerts',
  'membership',
  'identity',
  'risk',
  'telegram',
  'unknown',
]);
const LINK_IDS = new Set([
  'polymarket_home',
  'polymarket_market',
  'polymarket_bet',
  'morphology_open',
  'telegram_alert',
  'telegram_consult',
  'telegram_channel',
  'analytics_page',
]);
const ALLOWED_PATHS = new Set([
  '/',
  '/index.html',
  '/morphology_compare.html',
  '/theme-picker.html',
  '/privacy.html',
  '/analytics.html',
]);
const ID_RE = /^[A-Za-z0-9_-]{8,100}$/;
const BOT_RE = /bot|crawler|spider|headless|uptime|monitor|curl|wget|python-requests|go-http-client|scrapy|facebookexternalhit|slackbot|bingpreview/i;
const DETAIL_RETENTION_DAYS = 180;
const AGGREGATE_RETENTION_DAYS = 400;
const RATE_LIMIT_PER_MINUTE = 180;
const rateBuckets = new Map();
const statsCache = new Map();

function utcIso(value = new Date()) {
  return value.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function localDay(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function dayList(days, end = new Date()) {
  const [year, month, date] = localDay(end).split('-').map(Number);
  return Array.from({ length: days }, (_, index) => {
    const offset = index - days + 1;
    const value = new Date(Date.UTC(year, month - 1, date + offset, 12));
    return localDay(value);
  });
}

function startOfLocalDayUtc(day) {
  return new Date(`${day}T00:00:00+08:00`);
}

function json(res, status, payload, cacheControl = 'no-store') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

function storageConfig() {
  return {
    gistId: process.env.STATS_GIST_ID,
    token: process.env.GITHUB_TOKEN,
  };
}

function adminToken() {
  return process.env.ANALYTICS_ADMIN_TOKEN || process.env.STATS_SECRET || '';
}

function authorized(req) {
  const expected = adminToken();
  if (!expected) return { ok: false, status: 503, error: 'analytics admin token is not configured' };
  const authorization = String(req.headers?.authorization || '');
  const provided = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : String(req.headers?.['x-analytics-token'] || '').trim();
  if (!provided) return { ok: false, status: 401, error: 'authentication required' };
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false, status: 401, error: 'invalid analytics token' };
  }
  return { ok: true };
}

function clientIp(req) {
  const headers = req.headers || {};
  const realIp = String(headers['x-real-ip'] || '').trim();
  if (realIp) return realIp;
  return String(headers['x-forwarded-for'] || '').split(',')[0].trim();
}

function ipHash(req) {
  const secret = process.env.ANALYTICS_IP_SALT || process.env.GITHUB_TOKEN || 'musk-analytics';
  return createHmac('sha256', secret).update(clientIp(req)).digest('hex').slice(0, 24);
}

function isBot(req) {
  const agent = String(req.headers?.['user-agent'] || '');
  return !agent || agent === '-' || BOT_RE.test(agent);
}

function rateLimited(hash) {
  const minute = Math.floor(Date.now() / 60000);
  const current = rateBuckets.get(hash);
  const count = current?.minute === minute ? current.count + 1 : 1;
  rateBuckets.set(hash, { minute, count });
  if (rateBuckets.size > 5000) rateBuckets.clear();
  return count > RATE_LIMIT_PER_MINUTE;
}

function normalizedPath(value) {
  const path = String(value || '/').split(/[?#]/, 1)[0];
  return ALLOWED_PATHS.has(path) ? path : '';
}

function normalizeLinkId(value) {
  const linkId = String(value || '').slice(0, 80);
  return LINK_IDS.has(linkId) ? linkId : '';
}

function normalizeReferrer(value) {
  try {
    return new URL(String(value || '')).hostname.slice(0, 200);
  } catch {
    return '';
  }
}

function safeText(value, max) {
  return String(value || '').replace(/[^A-Za-z0-9_+\-/]/g, '').slice(0, max);
}

function emptyState() {
  return {
    version: 2,
    visitors: {},
    sessions: {},
    visitorDays: {},
    sessionDays: {},
    pageViews: [],
    assistantEvents: [],
    outboundClicks: [],
  };
}

function ensureState(data) {
  const sites = data.sites && typeof data.sites === 'object' ? data.sites : (data.sites = {});
  const musk = sites.musk && typeof sites.musk === 'object' ? sites.musk : (sites.musk = {});
  if (!musk.analyticsV2 || typeof musk.analyticsV2 !== 'object') {
    musk.analyticsV2 = emptyState();
  }
  const state = musk.analyticsV2;
  for (const key of ['visitors', 'sessions', 'visitorDays', 'sessionDays']) {
    if (!state[key] || typeof state[key] !== 'object') state[key] = {};
  }
  for (const key of ['pageViews', 'outboundClicks', 'assistantEvents']) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  state.version = 2;
  return { data, musk, state };
}

async function gistFileContent(gist) {
  const file = gist.files?.['stats.json'];
  if (!file) return '{}';
  if (!file.truncated && typeof file.content === 'string') return file.content;
  if (!file.raw_url) throw new Error('gist file content unavailable');
  const response = await fetch(file.raw_url, {
    headers: { Accept: 'application/vnd.github.raw+json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`gist raw ${response.status}`);
  return response.text();
}

async function readGist() {
  const { gistId, token } = storageConfig();
  if (!gistId || !token) throw new Error('analytics storage is not configured');
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`gist ${response.status}`);
  const gist = await response.json();
  let data = {};
  try {
    data = JSON.parse(await gistFileContent(gist));
  } catch {
    data = {};
  }
  return ensureState(data);
}

async function writeGist(data) {
  const { gistId, token } = storageConfig();
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: {
        'stats.json': { content: JSON.stringify(data, null, 2) + '\n' },
      },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`gist write ${response.status}`);
}

function prune(state) {
  const now = Date.now();
  const detailCutoff = utcIso(new Date(now - DETAIL_RETENTION_DAYS * 86400000));
  const aggregateCutoff = localDay(new Date(now - AGGREGATE_RETENTION_DAYS * 86400000));
  state.pageViews = state.pageViews.filter((row) => String(row.occurredAt || '') >= detailCutoff);
  state.outboundClicks = state.outboundClicks.filter((row) => String(row.occurredAt || '') >= detailCutoff);
  state.assistantEvents = state.assistantEvents.filter((row) => String(row.occurredAt || '') >= detailCutoff);

  for (const table of [state.visitorDays, state.sessionDays]) {
    for (const day of Object.keys(table)) {
      if (day < aggregateCutoff) delete table[day];
    }
  }
  for (const [id, row] of Object.entries(state.visitors)) {
    if (String(row.lastSeen || '') < utcIso(new Date(now - AGGREGATE_RETENTION_DAYS * 86400000))) {
      delete state.visitors[id];
    }
  }
  for (const [id, row] of Object.entries(state.sessions)) {
    if (String(row.lastSeen || '') < utcIso(new Date(now - AGGREGATE_RETENTION_DAYS * 86400000))) {
      delete state.sessions[id];
    }
  }
}

export async function handleAnalyticsTrack(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method not allowed' });

  const { gistId, token } = storageConfig();
  if (!gistId || !token) return json(res, 503, { ok: false, error: 'analytics storage is not configured' });
  let payload;
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body, 'utf8') > 16384) {
      return json(res, 413, { ok: false, error: 'payload too large' });
    }
    try {
      payload = JSON.parse(req.body);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid json' });
    }
  } else {
    payload = typeof req.body === 'object' && req.body !== null ? req.body : {};
  }
  const visitorId = String(payload.visitorId || '');
  const sessionId = String(payload.sessionId || '');
  const event = String(payload.event || '');
  const path = normalizedPath(payload.path);
  if (!ID_RE.test(visitorId) || !ID_RE.test(sessionId)) {
    return json(res, 400, { ok: false, error: 'invalid visitor or session id' });
  }
  if (!EVENT_TYPES.has(event)) return json(res, 400, { ok: false, error: 'invalid event' });
  if (!path) return json(res, 400, { ok: false, error: 'invalid path' });

  const linkId = event === 'outbound_click' ? normalizeLinkId(payload.linkId) : '';
  if (event === 'outbound_click' && !linkId) {
    return json(res, 400, { ok: false, error: 'invalid link id' });
  }
  const assistantAction = event === 'assistant_event' ? String(payload.assistantAction || '') : '';
  const assistantTopic = event === 'assistant_event' ? String(payload.assistantTopic || '') : '';
  if (
    event === 'assistant_event'
    && (!ASSISTANT_ACTIONS.has(assistantAction) || !ASSISTANT_TOPICS.has(assistantTopic))
  ) {
    return json(res, 400, { ok: false, error: 'invalid assistant event' });
  }
  if (rateLimited(ipHash(req))) return json(res, 429, { ok: false, error: 'rate limited' });

  const now = new Date();
  const nowIso = utcIso(now);
  const day = localDay(now);
  const bot = isBot(req);
  const durationRaw = Number(payload.durationMs || 0);
  const scrollRaw = Number(payload.maxScrollPct || 0);
  const durationSeconds = Number.isFinite(durationRaw)
    ? Math.max(0, Math.min(Math.floor(durationRaw / 1000), 86400))
    : 0;
  const maxScroll = Number.isFinite(scrollRaw)
    ? Math.max(0, Math.min(Math.round(scrollRaw), 100))
    : 0;
  const referrerHost = normalizeReferrer(payload.referrer);
  const language = safeText(payload.language, 32);
  const timezone = safeText(payload.timezone, 64);
  const requestHash = ipHash(req);

  try {
    const { data, state } = await readGist();
    const visitor = state.visitors[visitorId];
    if (visitor) {
      visitor.lastSeen = nowIso;
      visitor.isBot = Boolean(visitor.isBot || bot);
    } else {
      state.visitors[visitorId] = {
        firstSeen: nowIso,
        lastSeen: nowIso,
        firstPath: path,
        firstReferrer: referrerHost,
        isBot: bot,
      };
    }

    const session = state.sessions[sessionId];
    if (session) {
      const elapsed = Math.max(0, Math.floor((now.getTime() - Date.parse(session.startedAt)) / 1000));
      session.lastSeen = nowIso;
      session.pageViews = Number(session.pageViews || 0) + Number(event === 'page_view');
      session.maxScrollPct = Math.max(Number(session.maxScrollPct || 0), maxScroll);
      session.durationSeconds = Math.max(Number(session.durationSeconds || 0), durationSeconds, elapsed);
      session.isBot = Boolean(session.isBot || bot);
      if (language) session.language = language;
      if (timezone) session.timezone = timezone;
    } else {
      state.sessions[sessionId] = {
        visitorId,
        startedAt: nowIso,
        lastSeen: nowIso,
        pageViews: Number(event === 'page_view'),
        maxScrollPct: maxScroll,
        durationSeconds,
        ipHash: requestHash,
        isBot: bot,
        language,
        timezone,
      };
    }

    state.visitorDays[day] ||= {};
    const visitorDay = state.visitorDays[day][visitorId];
    if (visitorDay) {
      visitorDay.lastSeen = nowIso;
    } else {
      state.visitorDays[day][visitorId] = { firstSeen: nowIso, lastSeen: nowIso };
    }

    state.sessionDays[day] ||= {};
    const sessionDay = state.sessionDays[day][sessionId];
    if (sessionDay) {
      sessionDay.lastSeen = nowIso;
      sessionDay.pageViews = Number(sessionDay.pageViews || 0) + Number(event === 'page_view');
    } else {
      state.sessionDays[day][sessionId] = {
        visitorId,
        firstSeen: nowIso,
        lastSeen: nowIso,
        pageViews: Number(event === 'page_view'),
      };
    }

    if (event === 'page_view') {
      state.pageViews.push({
        occurredAt: nowIso,
        day,
        path,
        visitorId,
        sessionId,
        referrerHost,
        isBot: bot,
      });
    } else if (event === 'outbound_click') {
      state.outboundClicks.push({
        occurredAt: nowIso,
        day,
        linkId,
        path,
        visitorId,
        sessionId,
        isBot: bot,
      });
    } else if (event === 'assistant_event') {
      state.assistantEvents.push({
        occurredAt: nowIso,
        day,
        action: assistantAction,
        topic: assistantTopic,
        path,
        visitorId,
        sessionId,
        isBot: bot,
      });
    }
    prune(state);
    await writeGist(data);
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error('[analytics] track failed', error);
    return json(res, 502, { ok: false, error: 'analytics write failed' });
  }
}

function countUnique(rows, key) {
  return new Set(rows.map((row) => row[key]).filter(Boolean)).size;
}

function statsView(payload, publicOnly) {
  if (!publicOnly) return payload;
  const result = { ...payload };
  delete result.assistant;
  return result;
}

async function analyticsStats(req, res, publicOnly = false) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method not allowed' });
  if (!publicOnly) {
    const auth = authorized(req);
    if (!auth.ok) return json(res, auth.status, { ok: false, error: auth.error });
  }

  const rawDays = Number(new URL(req.url || '/api/stats', 'https://musk.local').searchParams.get('days') || 1);
  const days = [1, 7, 30, 90].includes(rawDays) ? rawDays : 1;
  const cacheControl = publicOnly
    ? 'public, max-age=30, s-maxage=60, stale-while-revalidate=120'
    : 'private, no-store';
  const cached = statsCache.get(days);
  if (cached && cached.expiresAt > Date.now()) {
    return json(res, 200, statsView(cached.payload, publicOnly), cacheControl);
  }
  try {
    const { state } = await readGist();
    const dates = dayList(days);
    const dateSet = new Set(dates);
    const startDay = dates[0];
    const startIso = utcIso(startOfLocalDayUtc(startDay));
    const activeSince = Date.now() - 5 * 60000;
    const inRange = (day) => dateSet.has(String(day));

    const visitorRows = Object.entries(state.visitorDays)
      .filter(([day]) => inRange(day))
      .flatMap(([, rows]) => Object.keys(rows).map((visitorId) => ({ visitorId })));
    const uniqueVisitors = new Set(
      visitorRows.map((row) => row.visitorId).filter((id) => !state.visitors[id]?.isBot),
    );

    const sessionRows = Object.entries(state.sessionDays)
      .filter(([day]) => inRange(day))
      .flatMap(([, rows]) => Object.keys(rows).map((sessionId) => ({ sessionId })));
    const sessionIds = new Set(
      sessionRows.map((row) => row.sessionId).filter((id) => !state.sessions[id]?.isBot),
    );

    const pageViews = state.pageViews.filter((row) => inRange(row.day) && !row.isBot);
    const outboundClicks = state.outboundClicks.filter((row) => inRange(row.day) && !row.isBot);
    const returningVisitors = [...uniqueVisitors].filter(
      (id) => String(state.visitors[id]?.firstSeen || '') < startIso,
    ).length;
    const activeNow5m = Object.values(state.sessions).filter(
      (row) => !row.isBot && Date.parse(row.lastSeen) >= activeSince,
    ).length;
    const durations = [...sessionIds]
      .map((id) => Number(state.sessions[id]?.durationSeconds || 0))
      .filter(Number.isFinite);
    const avgSessionSeconds = durations.length
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : 0;

    const daily = dates.map((day) => {
      const visitorIds = new Set(
        Object.keys(state.visitorDays[day] || {}).filter((id) => !state.visitors[id]?.isBot),
      );
      const daySessionIds = new Set(
        Object.keys(state.sessionDays[day] || {}).filter((id) => !state.sessions[id]?.isBot),
      );
      return {
        day,
        visitors: visitorIds.size,
        sessions: daySessionIds.size,
        pageViews: state.pageViews.filter((row) => row.day === day && !row.isBot).length,
      };
    });

    const pageMap = new Map();
    for (const row of pageViews) {
      const entry = pageMap.get(row.path) || { path: row.path, views: 0, visitors: new Set() };
      entry.views += 1;
      entry.visitors.add(row.visitorId);
      pageMap.set(row.path, entry);
    }
    const pages = [...pageMap.values()]
      .map((row) => ({ path: row.path, views: row.views, visitors: row.visitors.size }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 12);

    const outboundMap = new Map();
    for (const row of outboundClicks) {
      const entry = outboundMap.get(row.linkId) || { link_id: row.linkId, clicks: 0, visitors: new Set() };
      entry.clicks += 1;
      entry.visitors.add(row.visitorId);
      outboundMap.set(row.linkId, entry);
    }
    const outbound = [...outboundMap.values()]
      .map((row) => ({ link_id: row.link_id, clicks: row.clicks, visitors: row.visitors.size }))
      .sort((a, b) => b.clicks - a.clicks);

    const assistantEvents = state.assistantEvents.filter(
      (row) => inRange(row.day) && !row.isBot,
    );
    const assistantTopics = new Map();
    for (const row of assistantEvents.filter((entry) => entry.action === 'question')) {
      assistantTopics.set(row.topic, (assistantTopics.get(row.topic) || 0) + 1);
    }
    const assistant = {
      opens: assistantEvents.filter((row) => row.action === 'open').length,
      questions: assistantEvents.filter((row) => row.action === 'question').length,
      fallbacks: assistantEvents.filter((row) => row.action === 'fallback').length,
      ctaClicks: assistantEvents.filter((row) => row.action === 'cta').length,
      topics: [...assistantTopics.entries()]
        .map(([topic, count]) => ({ topic, count }))
        .sort((a, b) => b.count - a.count),
    };

    const today = daily[daily.length - 1] || { visitors: 0, sessions: 0, pageViews: 0 };
    const payload = {
      ok: true,
      generatedAt: utcIso(),
      timezone: TIMEZONE,
      rangeDays: days,
      overview: {
        uniqueVisitors: uniqueVisitors.size,
        sessions: sessionIds.size,
        pageViews: pageViews.length,
        returningVisitors,
        activeNow5m,
        avgSessionSeconds: Math.round(avgSessionSeconds * 10) / 10,
      },
      daily,
      pages,
      outbound,
      assistant,
      // Compatibility fields used by earlier Musk dashboards.
      date: localDay(),
      today_views: today.pageViews,
      today_visitors: today.visitors,
      week_views: daily.slice(-7).reduce((sum, row) => sum + row.pageViews, 0),
      week_visitors: daily.slice(-7).reduce((sum, row) => sum + row.visitors, 0),
      stats_status: 'ok',
      access_mode: 'free',
      methodology: {
        visitor: 'localStorage 中随机生成的匿名 visitorId',
        session: 'sessionStorage 中的标签页会话 ID，页面可见时每 60 秒心跳续期',
        activeNow: '最近 5 分钟有心跳的会话数，不等同于精确真人数量',
        ip: '不保存原始 IP，仅使用私有密钥生成截断 HMAC 用于限流',
        retention: `页面与导流明细保留 ${DETAIL_RETENTION_DAYS} 天，访客与会话聚合保留 ${AGGREGATE_RETENTION_DAYS} 天`,
      },
    };
    statsCache.set(days, { payload, expiresAt: Date.now() + 60000 });
    return json(
      res,
      200,
      statsView(payload, publicOnly),
      cacheControl,
    );
  } catch (error) {
    console.error('[analytics] stats failed', error);
    return json(res, 502, { ok: false, error: 'analytics read failed' });
  }
}

export function handleAnalyticsStats(req, res) {
  return analyticsStats(req, res, false);
}

export function handleAnalyticsPublicStats(req, res) {
  return analyticsStats(req, res, true);
}

export function handleAnalyticsHealth(req, res) {
  return json(res, 200, {
    ok: true,
    service: 'musk-analytics',
    storageConfigured: Boolean(storageConfig().gistId && storageConfig().token),
    publicStats: true,
    adminConfigured: Boolean(adminToken()),
    timezone: TIMEZONE,
  });
}
