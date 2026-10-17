export const now = () => new Date().toISOString();

export function addMonths(date, months) {
  const value = new Date(date);
  const originalDay = value.getDate();
  value.setDate(1);
  value.setMonth(value.getMonth() + Number(months));
  const lastDay = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
  value.setDate(Math.min(originalDay, lastDay));
  return value.toISOString();
}

// Month keys (YYYY-MM) are calculated in Pakistan time so a payment made on
// the 1st of a month at 2 AM PKT counts for that month, not the previous one.
const ACCESS_TIMEZONE = process.env.ACCESS_TIMEZONE || 'Asia/Karachi';

export function monthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ACCESS_TIMEZONE, year: 'numeric', month: '2-digit' })
    .formatToParts(new Date(date));
  const get = type => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}`;
}

export function shiftMonthKey(key, offset) {
  const [year, month] = String(key).split('-').map(Number);
  const total = year * 12 + (month - 1) + Number(offset);
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
