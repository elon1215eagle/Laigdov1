function isBlank(value) {
  return value === "" || value === null || value === undefined;
}

function toAmount(value) {
  if (isBlank(value)) return 0;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function deriveRevenueBreakdown(form = {}) {
  const openedTo1400 = toAmount(form.opened_to_1400_revenue);
  const revenue1400To1900 = toAmount(form.revenue_1400_to_1900);
  const fullDayRevenue = toAmount(form.full_day_revenue);
  const reportedSubtotal = openedTo1400 + revenue1400To1900;

  return {
    openedTo1400,
    revenue1400To1900,
    revenue1900ToClose: Math.max(0, fullDayRevenue - reportedSubtotal),
    fullDayRevenue,
    isValid: fullDayRevenue >= reportedSubtotal,
    completedSteps: [
      form.opened_to_1400_revenue,
      form.revenue_1400_to_1900,
      form.full_day_revenue,
    ].filter((value) => !isBlank(value) && Number(value) >= 0).length,
  };
}

export function buildDailyReportPayload({
  form,
  reportDate,
  storeId,
  submittedAt,
  submittedBy,
}) {
  const revenue = deriveRevenueBreakdown(form);
  if (!revenue.isValid) {
    throw new Error("全日總營收不可小於 14:00 與 19:00 營收加總");
  }

  return {
    store_id: storeId,
    report_date: reportDate,
    opened_to_1400_revenue: revenue.openedTo1400,
    revenue_1400_to_1900: revenue.revenue1400To1900,
    revenue_1900_to_close: revenue.revenue1900ToClose,
    cash_difference: toAmount(form.cash_difference),
    manager_note: form.manager_note || "",
    status: "submitted",
    submitted_at: submittedAt,
    submitted_by: submittedBy,
  };
}

export function totalRevenue(report = {}) {
  return (
    toAmount(report.opened_to_1400_revenue) +
    toAmount(report.revenue_1400_to_1900) +
    toAmount(report.revenue_1900_to_close)
  );
}
