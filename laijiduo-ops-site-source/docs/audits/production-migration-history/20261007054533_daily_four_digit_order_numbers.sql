begin;
alter table laigdo_order_private.orders add column order_day date;
update laigdo_order_private.orders set order_day=(created_at at time zone 'Asia/Taipei')::date;
alter table laigdo_order_private.orders alter column order_day set not null;
alter table laigdo_order_private.orders alter column number drop identity;
alter table laigdo_order_private.orders drop constraint orders_number_key;
alter table laigdo_order_private.orders add constraint orders_day_number_key unique(order_day,number);
create table laigdo_order_private.daily_order_numbers(order_day date primary key,last_number integer not null check(last_number between 8001 and 8999));
alter table laigdo_order_private.daily_order_numbers enable row level security;
revoke all on laigdo_order_private.daily_order_numbers from public,anon,authenticated;
insert into laigdo_order_private.daily_order_numbers select order_day,max(number)::integer from laigdo_order_private.orders where number between 8001 and 8999 group by order_day;
create function laigdo_order_private.assign_daily_order_number() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.order_day:=(statement_timestamp() at time zone 'Asia/Taipei')::date;
 insert into laigdo_order_private.daily_order_numbers(order_day,last_number) values(new.order_day,8001)
 on conflict(order_day) do update set last_number=laigdo_order_private.daily_order_numbers.last_number+1
 returning last_number into new.number;
 return new;
end $$;
revoke all on function laigdo_order_private.assign_daily_order_number() from public,anon,authenticated;
create trigger assign_daily_order_number before insert on laigdo_order_private.orders for each row execute function laigdo_order_private.assign_daily_order_number();
commit;
