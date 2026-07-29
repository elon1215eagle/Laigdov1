# Daily Report Module

The module owns the daily revenue rules shared by store submission and
headquarters editing.

## Interface

- `deriveRevenueBreakdown(form)` calculates the three revenue periods, total,
  validity, and completion progress.
- `buildDailyReportPayload(input)` produces the existing Supabase
  `daily_reports` payload.
- `totalRevenue(report)` totals a stored report.

Inventory persistence and UI layout remain outside this first-stage seam.
