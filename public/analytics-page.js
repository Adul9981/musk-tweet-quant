const TOKEN_KEY = 'musk_analytics_admin_token';
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const number = (value) => Number(value || 0).toLocaleString('zh-CN');
const duration = (seconds) => {
  const value = Number(seconds || 0);
  if (value < 60) return `${Math.round(value)}s`;
  const minutes = Math.floor(value / 60);
  const rest = Math.round(value % 60);
  return minutes < 60 ? `${minutes}m ${rest}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};
const pageName = (path) => ({
  '/': '市场概览',
  '/index.html': '市场概览',
  '/morphology_compare.html': '走势形态对比',
  '/theme-picker.html': '主题预览',
  '/privacy.html': '隐私说明',
}[path] || path);
const linkName = (id) => ({
  polymarket_home: 'Polymarket 主页',
  polymarket_market: '当前市场',
  polymarket_bet: 'Polymarket 下注',
  morphology_open: '形态对比新窗口',
  telegram_alert: 'Telegram 通知',
}[id] || id);

let rangeDays = 1;
let token = sessionStorage.getItem(TOKEN_KEY) || '';

function render(payload) {
  const overview = payload.overview || {};
  $('visitors').textContent = number(overview.uniqueVisitors);
  $('sessions').textContent = number(overview.sessions);
  $('pageviews').textContent = number(overview.pageViews);
  $('active').textContent = number(overview.activeNow5m);
  $('returning').textContent = number(overview.returningVisitors);
  $('duration').textContent = duration(overview.avgSessionSeconds);
  $('updated').textContent = `更新 ${new Date(payload.generatedAt).toLocaleString('zh-CN', { hour12: false })}`;

  const daily = payload.daily || [];
  const maximum = Math.max(...daily.map((row) => Number(row.visitors) || 0), 1);
  $('chart').innerHTML = daily.length ? daily.map((row) => {
    const visitors = Number(row.visitors) || 0;
    const height = Math.max(3, Math.round((visitors / maximum) * 176));
    return `<div class="day" title="${escapeHtml(row.day)} · ${number(visitors)} 访客 · ${number(row.sessions)} 会话 · ${number(row.pageViews)} 浏览">
      <b>${number(visitors)}</b><div class="bar" style="height:${height}px"></div><span>${escapeHtml(String(row.day).slice(5))}</span>
    </div>`;
  }).join('') : '<div class="empty">当前范围暂无匿名访问数据。</div>';

  const pages = payload.pages || [];
  $('pages').innerHTML = pages.length ? pages.map((row) => `<tr>
    <td><b>${escapeHtml(pageName(row.path))}</b><small>${escapeHtml(row.path)}</small></td>
    <td class="num">${number(row.views)}</td><td class="num">${number(row.visitors)}</td>
  </tr>`).join('') : '<tr><td colspan="3" class="empty">当前范围暂无页面浏览。</td></tr>';

  const outbound = payload.outbound || [];
  $('outbound').innerHTML = outbound.length ? outbound.map((row) => `<tr>
    <td>${escapeHtml(linkName(row.link_id))}</td>
    <td class="num">${number(row.clicks)}</td><td class="num">${number(row.visitors)}</td>
  </tr>`).join('') : '<tr><td colspan="3" class="empty">当前范围暂无导流点击。</td></tr>';
}

async function load(days = rangeDays) {
  rangeDays = days;
  document.querySelectorAll('[data-days]').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.days) === days);
  });
  try {
    const response = await fetch(`/api/stats?days=${days}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      token = '';
      showLogin('管理员令牌无效，请重新输入。');
      return;
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `${response.status}`);
    render(payload);
  } catch (error) {
    $('updated').textContent = `统计接口不可用：${error.message}`;
  }
}

function showDashboard() {
  $('loginPanel').hidden = true;
  $('dashboard').hidden = false;
  load(1);
}

function showLogin(message = '') {
  $('dashboard').hidden = true;
  $('loginPanel').hidden = false;
  $('loginError').textContent = message;
  $('tokenInput').focus();
}

$('loginButton').addEventListener('click', () => {
  const value = $('tokenInput').value.trim();
  if (!value) {
    $('loginError').textContent = '请输入管理员令牌。';
    return;
  }
  token = value;
  sessionStorage.setItem(TOKEN_KEY, token);
  showDashboard();
});
$('tokenInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') $('loginButton').click();
});
$('logoutButton').addEventListener('click', () => {
  sessionStorage.removeItem(TOKEN_KEY);
  token = '';
  $('tokenInput').value = '';
  showLogin();
});
document.querySelectorAll('[data-days]').forEach((button) => {
  button.addEventListener('click', () => load(Number(button.dataset.days)));
});
setInterval(() => {
  if (!$('dashboard').hidden && token) load(rangeDays);
}, 60_000);

if (token) showDashboard();
else showLogin();
