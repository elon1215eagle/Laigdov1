alter policy approval_file_read on storage.objects to authenticated using (
 storage.objects.bucket_id='ops-approval-files' and exists(
 select 1 from public.ops_approval_attachments a where a.path=storage.objects.name and ops_approval_private.can_read(a.request_id))
);
alter policy approval_file_upload on storage.objects to authenticated with check (
 storage.objects.bucket_id='ops-approval-files' and ops_approval_private.role_name() is not null and exists(
 select 1 from public.ops_approval_requests r where r.id::text=split_part(storage.objects.name,'/',1) and r.owner_id=auth.uid() and r.state in ('draft','returned'))
);
