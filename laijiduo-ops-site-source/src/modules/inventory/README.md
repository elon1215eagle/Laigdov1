# Inventory Module

The module owns product unit rules and management quantity conversions shared
by store reporting, incoming inventory, and headquarters analysis.

## Rules

- Variable products use boxes or packs; three packs equal one management unit.
- Powder products store boxes and packs; one box equals ten packs.
- Fixed pack, skewer, and barrel products retain their fixed display units.
- Save payload normalization is shared by store and headquarters workflows.
