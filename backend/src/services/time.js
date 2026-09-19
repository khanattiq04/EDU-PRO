export const now = () => new Date().toISOString();

export function addMonths(date, months) {
  const value = new Date(date);
  value.setMonth(value.getMonth() + Number(months));
  return value.toISOString();
}
