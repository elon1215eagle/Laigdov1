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

UI state, Supabase reads/writes and React rendering remain outside this domain
module. They will move behind separate adapters in later architecture phases.

## Invariants

- A one-day shift overrides the staff master default for that date only.
- A support shift counts only at its assigned store.
- `兼職後勤`, delivery and shipping roles do not contribute effective staffing.
- S01/S06 and S02/S03 grouping applies only to scheduling, staffing and support.
- Revenue, inventory, daily reporting and inspection scopes remain store-specific.

