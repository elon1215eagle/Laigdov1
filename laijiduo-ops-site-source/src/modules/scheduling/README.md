# Scheduling Module

## Interface

Callers import scheduling rules from `src/modules/scheduling/index.js`.

The module owns:

- part-time weekday and holiday defaults;
- one-day shift override precedence;
- cross-store assignment;
- excluded staffing roles;
- lunch, dinner and closing coverage;
- half-hour staffing matrices;
- data-driven scheduling groups.

React rendering and UI state remain outside this module. Supabase reads and
writes are owned by `data/scheduleRepository.js`; callers use the public exports
from `index.js` instead of accessing scheduling tables directly.

## Data adapter

The repository owns:

- monthly leave plan reads and writes;
- headquarters schedule confirmation and unlock state;
- store schedule change requests and headquarters review;
- temporary support summaries;
- daily part-time overrides and cross-store support shifts;
- offline fallbacks used by local acceptance testing.

## Invariants

- A one-day shift overrides the staff master default for that date only.
- A support shift counts only at its assigned store.
- `兼職後勤`, delivery and shipping roles do not contribute effective staffing.
- S01/S06 and S02/S03 grouping applies only to scheduling, staffing and support.
- Revenue, inventory, daily reporting and inspection scopes remain store-specific.
