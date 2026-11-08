(() => {
  const allowedPaths = new Set([
    '/',
    '/index.html',
    '/morphology_compare.html',
    '/theme-picker.html',
    '/privacy.html',
    '/analytics.html',
  ]);
  const path = window.location.pathname;
  if (!allowedPaths.has(path)) return;
  const isStatsPage = path === '/analytics.html';

  const endpoint = '/api/track';
  const visitorKey = 'musk_visitor_id';
  const sessionKey = 'musk_session_id';
  const legacyVisitorKey = 'musk_vid';
  const uuid = () => {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (window.crypto?.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  const storageGet = (store, key) => {
    try {
      return store?.getItem(key) || null;
    } catch {
      return null;
    }
  };
  const storageSet = (store, key, value) => {
    try {
      store?.setItem(key, value);
    } catch {
      // Storage can be disabled; the current page session remains usable.
    }
  };
  const localStore = (() => {
    try { return window.localStorage; } catch { return null; }
  })();
  const sessionStore = (() => {
    try { return window.sessionStorage; } catch { return null; }
  })();
  const validId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value);

  const visitorId = (() => {
    const existing = storageGet(localStore, visitorKey);
    if (validId(existing)) return existing;
    const legacy = storageGet(localStore, legacyVisitorKey);
    if (validId(legacy)) {
      storageSet(localStore, visitorKey, legacy);
      return legacy;
    }
    const created = uuid();
    storageSet(localStore, visitorKey, created);
    return created;
  })();
  const sessionId = (() => {
    const existing = storageGet(sessionStore, sessionKey);
    if (validId(existing)) return existing;
    const created = uuid();
    storageSet(sessionStore, sessionKey, created);
    return created;
  })();

  const startedAt = Date.now();
  let maxScrollPct = 0;
  let lastSentAt = 0;
  const readScroll = () => {
    const root = document.documentElement;
    const height = Math.max(root.scrollHeight - window.innerHeight, 1);
    maxScrollPct = Math.max(
      maxScrollPct,
      Math.min(100, Math.round((window.scrollY / height) * 100)),
    );
  };
  const send = (event, force = false, linkId = '') => {
    const now = Date.now();
    if (!force && now - lastSentAt < 30_000) return;
    lastSentAt = now;
    readScroll();
    const payload = JSON.stringify({
      visitorId,
      sessionId,
      event,
      linkId,
      path,
      durationMs: now - startedAt,
      maxScrollPct,
      referrer: document.referrer,
      language: navigator.language || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }));
      return;
    }
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      credentials: 'omit',
      keepalive: true,
    }).catch(() => {});
  };

  if (!isStatsPage) send('page_view', true);
  document.addEventListener('click', (event) => {
    const target = event.target.closest?.('[data-track-link]');
    if (target) send('outbound_click', true, target.dataset.trackLink || '');
  }, { capture: true });
  if (!isStatsPage) {
    setInterval(() => {
      if (document.visibilityState === 'visible') send('heartbeat');
    }, 60_000);
    window.addEventListener('scroll', readScroll, { passive: true });
    document.addEventListener('visibilitychange', () => {
      send(document.visibilityState === 'visible' ? 'heartbeat' : 'page_hide', true);
    });
    window.addEventListener('pagehide', () => send('page_hide', true));
  }
})();
