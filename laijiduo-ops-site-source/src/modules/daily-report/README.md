# Daily Report Module

The module owns the daily revenue rules shared by store submission and
headquarters editing.

## Interface

- `deriveRevenueBreakdown(form)` calculates the three revenue periods, total,
  validity, and completion progress.
- `buildDailyReportPayload(input)` produces the existing Supabase
  `daily_reports` payload.
- `totalRevenue(report)` totals a stored report.
- `dailyReportRepository` owns daily report reads, writes, legacy field
  fallback, and delete verification.
- `inventoryRepository` owns inventory reads, writes, unit normalization, and
  legacy schema fallback.

The Supabase implementation and null/local implementation share the same
interface. UI layout remains outside this seam.
