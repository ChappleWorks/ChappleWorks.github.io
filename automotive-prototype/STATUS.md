# LeoNet VINCORE Auction status

## What was completed

The dealer workspace remains on feature/vincore-dealer-accounts. Added staging instructions, three fictional account assignments, inventory/run-list fixtures and a credential-gated hosted acceptance runner. Expanded the local tests to cover cross-dealer import rejection, sign-out and sign-in recovery, and actual embedded PostgreSQL backup and restore. The original Auction application and public preview files were preserved.

## What was verified

- Four local automated tests passed. Embedded PostgreSQL applied the migrations, rejected cross-dealer reads, writes and imports, and applied atomic bid and purchase transitions. The fixture SQL rolled back without confirmed accounts, then assigned exactly three memberships when run twice with fictional identities.
- A separate local PostgreSQL instance loaded a data-directory archive. The recovered database preserved purchase status, bid and expense entries, inventory and dealer isolation.
- The 390-pixel Edge test used mocked Supabase and NHTSA. It exercised sign-in, VIN research, maximum bid, preparation, bid, purchase, expenses, list imports and VIN matching, sign-out, fresh sign-in, and record recovery.
- The hosted runner passed syntax checking and refused to connect without explicit staging settings. Hosted API checks were not run.

## What is still pending

No accessible Supabase staging configuration or credentials were available. A local full Supabase stack was not available on this machine. Real password authentication, PostgREST persistence and isolation, hosted backup restore, and phone testing are pending. No merge, deployment or live preview change was performed.

## What Chris needs to decide

Identify the isolated no-spend project and staging origin that may be used. Confirm Mike's phone and browser plus a fictional or blank export in the actual inventory and auction formats.

## Next recommended action

Follow the [staging and phone runbook](dealer/pilot/STAGING.md). Provision the three test users, run the hosted API check, verify recovery in an isolated restore target, then rehearse on Mike's device with fictional data. Resolve and retest blockers before asking Chris to approve the pilot.

[Draft PR and implementation evidence](https://github.com/ChappleWorks/ChappleWorks.github.io/pull/1/files)
