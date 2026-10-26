import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const failures = [];

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function walk(path) {
  return readdirSync(path).flatMap((name) => {
    const child = join(path, name);
    return statSync(child).isDirectory() ? walk(child) : [child];
  });
}

const clientBundle = walk(join(root, 'dist'))
  .filter((path) => /\.(?:html|js|css)$/.test(path))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

const retiredClientMarkers = [
  'buy.polar.sh',
  '$29.99',
  '订阅后解锁',
  '会员验证',
  '验证会员',
  'Tier 1',
  'musk_member_v1',
  '预览模式：付费墙已开启',
];

for (const marker of retiredClientMarkers) {
  if (clientBundle.includes(marker)) {
    failures.push(`client bundle still contains: ${marker}`);
  }
}

const app = read('src/App.tsx');
for (const marker of [
  'SubscriptionNotice',
  'MembershipModal',
  'LockedGate',
  'MemberChip',
  'memberOk',
  'previewPaid',
]) {
  if (app.includes(marker)) {
    failures.push(`src/App.tsx still references: ${marker}`);
  }
}

const verifyApi = read('api/verify-member.js');
if (!verifyApi.includes('publicMode: true') || verifyApi.includes('MEMBERS_GIST_RAW_URL')) {
  failures.push('api/verify-member.js is not permanently open');
}

const leadApi = read('api/lead.js');
if (!leadApi.includes('status(410)') || leadApi.includes('TELEGRAM_BOT_TOKEN')) {
  failures.push('api/lead.js still accepts or forwards subscription leads');
}

if (failures.length) {
  console.error('Free-mode check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Free-mode check passed: no paid gate or subscription intake remains.');
