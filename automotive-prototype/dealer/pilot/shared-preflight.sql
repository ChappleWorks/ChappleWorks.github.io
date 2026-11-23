-- Read-only catalog preflight. Run as an authorized database administrator.
-- Save only metadata results. This query does not read business records.
with relations as (
  select n.nspname as schema_name, c.relname as relation_name, c.relrowsecurity as rls,
    has_schema_privilege('authenticated', n.oid, 'USAGE')
    and has_table_privilege('authenticated', c.oid, 'SELECT') as readable
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('crm', 'crm_admin', 'delivery', 'public')
    and c.relkind in ('r', 'p', 'v', 'm')
), routines as (
  select n.nspname as schema_name, p.proname as routine_name
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('crm', 'crm_admin', 'delivery', 'public')
    and p.prosecdef
    and has_schema_privilege('authenticated', n.oid, 'USAGE')
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
)
select jsonb_build_object(
  'vincore_schemas', (select count(*) from pg_namespace where nspname in ('vincore', 'vincore_private')),
  'authenticated_readable_relations', (select count(*) from relations where readable),
  'read_without_table_rls', (select jsonb_agg(schema_name || '.' || relation_name order by schema_name, relation_name) from relations where readable and not rls),
  'privileged_callable', (select jsonb_agg(schema_name || '.' || routine_name order by schema_name, routine_name) from routines),
  'auth_user_triggers', (select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal),
  'database_bytes', pg_database_size(current_database())
) as preflight;

-- Guard the simulated identity before switching roles. Run this block separately.
-- A clean result is evidence for these six tables, not Proof of Auth/API isolation.
begin read only;
do $$
begin
  if exists (select 1 from auth.users where id = '7a11e000-0000-4000-8000-000000000111') then
    raise exception 'Fictional preflight subject already exists';
  end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '7a11e000-0000-4000-8000-000000000111';
set local request.jwt.claims = '{"sub":"7a11e000-0000-4000-8000-000000000111","role":"authenticated"}';
select
  (select count(*) from crm.memberships) as memberships,
  (select count(*) from crm.activities) as activities,
  (select count(*) from crm.contacts) as contacts,
  (select count(*) from crm.companies) as companies,
  (select count(*) from crm.invoices) as invoices,
  (select count(*) from crm.leads) as leads;
rollback;
