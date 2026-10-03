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
