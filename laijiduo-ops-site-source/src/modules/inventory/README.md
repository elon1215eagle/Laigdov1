# Inventory Module

The module owns product unit rules and management quantity conversions shared
by store reporting, incoming inventory, and headquarters analysis.

## Rules

- From 2026-08-18, variable products use a fixed store-specific unit shared by
  inventory and incoming forms. S01, S05, and S06 use pieces; the other stores
  use packs. Sweet potato is the exception: only S01 and S06 use pieces.
- Chicken wings follow the same store rule as chicken legs, chicken cutlets,
  thigh steaks, popcorn chicken, triangle bones, and chicken necks.
- Three packs equal one management piece. The conversion is effective-dated so
  sweet potato yield changes can be added without rewriting historical rows.
- Legacy box values remain readable as management pieces and are converted
  without changing their management quantity when opened under the new policy.
- Powder products store boxes and packs; one box equals ten packs.
- Fixed pack, skewer, and barrel products retain their fixed display units.
- Save payload normalization is shared by store and headquarters workflows.
