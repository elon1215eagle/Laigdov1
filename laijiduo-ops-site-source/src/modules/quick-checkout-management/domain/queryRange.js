import { addBusinessDays } from "../../daily-report/domain/businessDate.js";

export function checkoutQueryRange(startDate, endDate) {
  const valid = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && addBusinessDays(value, 0) === value;
  if (!valid(startDate) || !valid(endDate) || startDate > endDate) {
    throw new Error("請選擇有效的查詢起訖日期");
  }
  return {
    from: `${startDate}T00:00:00+08:00`,
    until: `${addBusinessDays(endDate, 1)}T00:00:00+08:00`,
  };
}
