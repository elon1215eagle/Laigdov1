drop policy if exists "supervisors create review actions" on public.review_actions;
create policy "supervisors create review actions"
on public.review_actions for insert
to authenticated
with check (
  public.current_profile_role() in ('ceo', 'coo', 'hq', 'supervisor', 'admin')
  and created_by = auth.uid()
);
