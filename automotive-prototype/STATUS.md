# LeoNet VINCORE Auction status

## What was completed

Confirmed the ChappleWorks Supabase dashboard is accessible. The leonet-systems organization is on the Free Plan and already has leonet-crm-demo and leonet-crm-test. Supabase explicitly blocked creation of another free project under the account-wide two-project limit. Neither CRM project was modified. Added a read-only verification mode to the staging runner for checking the original tagged records after a restore.

## What was verified

Six automated local tests passed. They cover embedded PostgreSQL tenant isolation, blocked cross-dealer imports, atomic auction outcomes and actual local backup/restore. The phone-width browser test uses mocked Supabase and NHTSA services. The new restore-check tests use a mocked API and confirm the checker reads the tagged records without fixture writes and rejects leaked events or invalid tags.

## What is still pending

No isolated VINCORE project or HTTPS staging preview was activated. Hosted migrations, fictional Auth accounts, actual Auth/API workflow, hosted backup/restore and Mike's phone tests are pending. No spend, deployment, merge or live preview change occurred.

## What Chris needs to decide

Identify an approved isolated free project with capacity. Freeing either CRM slot requires an explicit decision on which project may be paused after checking dependencies. A local Supabase stack on an existing Docker-capable host is a no-cost alternative for real Auth/API checks. Mike's off-device rehearsal still needs an approved separate HTTPS preview.

## Next recommended action

Once the isolated target is available, follow the [staging runbook](dealer/pilot/STAGING.md). Apply migrations, provision the three fictional users, run the API and browser workflows, restore into a separate target and check the original tag. Then rehearse on Mike's phone using fictional files in his formats.

[Draft PR and test source](https://github.com/ChappleWorks/ChappleWorks.github.io/pull/1/files) · [Supabase Free Plan project limit](https://supabase.com/docs/guides/platform/billing-faq#how-many-free-projects-can-i-have)
