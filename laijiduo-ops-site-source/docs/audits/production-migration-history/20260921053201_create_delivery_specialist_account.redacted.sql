with new_user as (
  insert into auth.users (
    id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,is_super_admin,created_at,updated_at,
    phone,phone_change,phone_change_token,email_change_token_current,
    email_change_confirm_status,reauthentication_token,is_sso_user,is_anonymous
  )
  select
    gen_random_uuid(),'[REDACTED]'::uuid,
    '[REDACTED]','[REDACTED]',lower('[REDACTED]'),
    extensions.crypt('[REDACTED]',extensions.gen_salt('[REDACTED]',10)),now(),
    '[REDACTED]'::jsonb,
    '[REDACTED]'::jsonb,
    false,now(),now(),null,'[REDACTED]','[REDACTED]','[REDACTED]',0,'[REDACTED]',false,false
  where not exists (select 1 from auth.users where lower(email)=lower('[REDACTED]'))
  returning id,email
), account_user as (
  select id,email from new_user
  union all
  select id,email from auth.users where lower(email)=lower('[REDACTED]')
    and not exists(select 1 from new_user)
), upsert_identity as (
  insert into auth.identities(provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
  select id::text,id,jsonb_build_object('[REDACTED]',id::text,'[REDACTED]',email,'[REDACTED]',true,'[REDACTED]',false),'[REDACTED]',null,now(),now()
  from account_user
  on conflict(provider,provider_id) do update set identity_data=excluded.identity_data,updated_at=now()
), upsert_profile as (
  insert into public.profiles(id,full_name,role,store_id,is_active,created_at,updated_at)
  select id,'[REDACTED]','[REDACTED]'::public.app_role,null,true,now(),now() from account_user
  on conflict(id) do update set full_name=excluded.full_name,role=excluded.role,store_id=null,is_active=true,updated_at=now()
  returning id
), upsert_membership as (
  insert into public.app_account_memberships(user_id,app_code,is_active,note,created_at,updated_at)
  select id,'[REDACTED]',true,'[REDACTED]',now(),now() from account_user
  on conflict(user_id,app_code) do update set is_active=true,note=excluded.note,updated_at=now()
)
insert into hq_short_private.credentials(alias,user_id,password_hash,enabled,failures,version,updated_at)
select '[REDACTED]',id,extensions.crypt('[REDACTED]',extensions.gen_salt('[REDACTED]',12)),true,0,1,now() from account_user
on conflict(alias) do nothing;

update auth.users set
 confirmation_token='[REDACTED]',recovery_token='[REDACTED]',email_change_token_new='[REDACTED]',email_change='[REDACTED]',
 raw_user_meta_data='[REDACTED]'::jsonb,updated_at=now()
where lower(email)=lower('[REDACTED]');

insert into hq_short_private.events(alias,action,reason,after_state)
select '[REDACTED]','[REDACTED]','[REDACTED]',jsonb_build_object('[REDACTED]',true,'[REDACTED]',1)
where not exists(select 1 from hq_short_private.events where alias='[REDACTED]' and action='[REDACTED]');
