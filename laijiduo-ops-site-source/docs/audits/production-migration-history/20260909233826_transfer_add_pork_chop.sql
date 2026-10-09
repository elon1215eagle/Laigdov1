-- Requested by Elon: transfer-only pork chop, one unit per line, no conversion.
-- No source mapping: this is not a change to franchise or inventory catalogs.
insert into ops_transfer_private.products
  (code, name, category, spec, units, active, sort_order)
select 'TR-MEAT-PORK-CHOP', '排骨', '肉品', '', array['箱','包'], true,
  coalesce(max(sort_order),0) + 1
from ops_transfer_private.products
where category='肉品'
on conflict (code) do nothing;

do $$
begin
  if not exists (
    select 1 from ops_transfer_private.products
    where code='TR-MEAT-PORK-CHOP' and name='排骨' and category='肉品'
      and units=array['箱','包'] and active
  ) then
    raise exception 'Pork chop transfer product does not match the approved configuration';
  end if;
end $$;
