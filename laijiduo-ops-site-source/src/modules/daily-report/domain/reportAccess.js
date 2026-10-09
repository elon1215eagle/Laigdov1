export const STORE_MANAGER_REVENUE_ACCESS_LABEL = "本月及上個月";

function firstDayOfPreviousMonth(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1, 1);
  return date.toISOString().slice(0, 10);
}

export function storeManagerRevenueMinDate(referenceDate) {
  return firstDayOfPreviousMonth(referenceDate);
}

export function isStoreManagerRevenueDateAllowed(dateText, referenceDate) {
  return (
    Boolean(dateText)
    && dateText >= storeManagerRevenueMinDate(referenceDate)
    && dateText <= referenceDate
  );
}
