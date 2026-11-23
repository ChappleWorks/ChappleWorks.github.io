# Shared Supabase staging plan

**Approval gate:** This design is tested locally. Applying it to leonet-crm-test, exposing the API schema or creating users requires separate approval. Keep the live Auction preview, CRM, and Invoice Studio outside the change.

## Ownership and access

- Application tables live in vincore. The browser explicitly selects that schema, and REST verification uses the corresponding profile header. Only the authenticated role gets schema usage and object grants. RLS requires a VINCORE dealership membership regardless of role names or CRM membership. Client grants allow limited preparation updates and append-only auction events.
- Policy helpers and event triggers live in vincore_private. Keep this schema outside the Data API. Grant the membership predicate's execute permission for policy evaluation without granting schema access. Keep the transition trigger inaccessible as a client function. Preserve the existing CRM schemas and Auth settings.
- Supabase Auth identities and project signing authority are shared. Use an app-specific browser storage key and local-session sign-out. Never assume a frontend URL, publishable key, or shared authenticated role separates applications. The production CRM API and privileged functions must independently enforce CRM authorization.
- Local tests model CRM membership-based authorization separately from VINCORE. They prove the migration leaves that model intact and that VINCORE membership does not grant access to it. They do not prove what the deployed CRM Worker, policies, views, functions, grants or external integrations do.

## Deployment and reversal after approval

1. Run the [read-only catalog and RLS check](shared-preflight.sql) and record existing API schema selections, effective grants and defaults, Auth configuration, resource use, migration state and dependencies. Capture CRM and Invoice Studio login baseline with authorized fictional accounts. Confirm the project and hosting remain within the $0 boundary.
2. Confirm vincore and vincore_private do not exist, or establish migration history before resuming. The base migration fails on a pre-existing namespace. This revision never moves or removes legacy public-schema VINCORE tables. If such tables exist, approve and rehearse a scoped data transfer before enabling the new API. Do not repurpose CRM or copy business data.
3. Apply both VINCORE migrations before exposing the data schema. The base has no table grants, and the second migration adds narrowly scoped grants and policies. Check catalog differences and ensure no CRM, Auth or public objects were changed. Add only vincore to the existing list of exposed schemas. Serve the development branch on a separate HTTPS staging origin. Provision fictional accounts and memberships after verifying identity side effects.
4. Run the tests below and the [dealer staging runbook](STAGING.md). If a gate fails, remove only the newly added vincore API exposure and stop the VINCORE preview. Keep its database state and evidence intact. Reversing the schema or removing test users requires a separately approved cleanup after checking dependencies and archiving any records. Avoid a project-wide restore or cascading schema deletion.

## Real API acceptance

- Signed out, CRM-only and unassigned authenticated identities must get no VINCORE records and no writes using the actual API profile. Verify VINCORE direct reads, preparation updates, events, imports and membership protection. Only an explicit dealership assignment enables that dealer's access.
- VINCORE-only and signed-out identities must get no private CRM reads or writes. Test exposed CRM schemas, membership lookups, views and privileged business functions, and applicable CRM Worker endpoints. Confirm public endpoints provide only intended public behavior. A CRM-only control identity must retain its authorized access. Recheck CRM and Invoice Studio login.
- Use Dealer A, Dealer B and an A teammate. Run node staging-check.mjs with dedicated fictional fixtures. Confirm each dealer can use the same VIN privately, foreign writes/imports fail, and the teammate can work only within its dealer. Then run the phone workflow. Do not use live business records.

## Independent VINCORE recovery

Prefer a data-only export of the five vincore tables with the matching migration revision. Keep auth, CRM, other schemas and credentials out of the artifact. Open a consistent snapshot and export the dealer, membership, vehicle, event and inventory records. Restore into an empty disposable VINCORE target with matching schema and pre-existing Auth identities or an approved explicit ID mapping. Validate every referenced identity before loading rows. Unmatched IDs must abort the restore.

Load in dependency order in one transaction. Suspend only the VINCORE auction event transition trigger during the load and restore it before commit. Keep the constraints enabled. The vehicle snapshot already includes final status, so replaying historical bid transitions is unnecessary. Check row counts, ownership, final status, costs, author attribution, access boundaries and a fresh transition before approval. Keep the source and other schemas intact.

The local test exports only the five table datasets, loads them into a separate PostgreSQL instance, confirms rollback when Auth identities are missing, and verifies the successful load leaves pre-existing CRM and Auth records unchanged. The hosted export, identity mapping, real API checks and recovery rehearsal require staging approval. Do not restore shared Auth or the whole project as part of VINCORE recovery.
