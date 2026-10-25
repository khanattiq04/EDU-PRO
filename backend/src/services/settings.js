import { all, one, run } from '../db.js';
import { cached, invalidate } from './cache.js';

const defaults = {
  site_name: 'Danistan Network',
  news_ticker: 'September quiz registration is open until 18 September | New partner discounts now available | Prize pool this month: Rs. 50,000',
  maintenance_mode: 'false',
  books_distributed: '4200',
  schools_visited: '38',
  plan_pricing: '[{"months":1,"amount":200},{"months":3,"amount":500},{"months":6,"amount":1000},{"months":12,"amount":2000}]',
  certification_passing_percentage: '70',
  certification_min_courses: '2',
  about_text: 'Learning that travels further. Supporting students across Pakistan.',
  introduction_text: 'Danistan Network connects ambitious students with structured learning and fair competition.',
  mission_text: 'We make quality learning, opportunity, and community accessible to every student.'
};

export async function ensureDefaultSettings() {
  for (const [key, value] of Object.entries(defaults)) {
    await run('INSERT IGNORE INTO settings (`key`, value) VALUES (?, ?)', [key, value]);
  }
}

export async function getSetting(key, fallback = '') {
  const map = await settingsMap();
  return map[key] ?? fallback;
}

export async function setSetting(key, value) {
  await run('INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [key, String(value)]);
  invalidate();
}

// Cached for 30 s; changes made in the admin panel clear the cache immediately.
export function settingsMap() {
  return cached('settings', 30000, async () => {
    const rows = await all('SELECT `key`, value FROM settings');
    return Object.fromEntries(rows.map(row => [row.key, row.value]));
  });
}
