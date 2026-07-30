export const STORE_MANAGER_REVENUE_LOOKBACK_DAYS = 14;

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function storeManagerRevenueMinDate(referenceDate) {
  return addDays(referenceDate, 1 - STORE_MANAGER_REVENUE_LOOKBACK_DAYS);
}

export function isStoreManagerRevenueDateAllowed(dateText, referenceDate) {
  return (
    Boolean(dateText)
    && dateText >= storeManagerRevenueMinDate(referenceDate)
    && dateText <= referenceDate
  );
}
