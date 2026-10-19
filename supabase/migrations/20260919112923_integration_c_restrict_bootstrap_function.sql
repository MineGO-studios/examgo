-- New Supabase projects may include this SECURITY DEFINER event trigger.
-- Retain automatic RLS, but do not expose its function to API roles.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
