# LeoNet VINCORE Auction status

## What was completed

Extended the existing dealer workspace on feature/vincore-dealer-accounts. Added VIN lookup, recall display, barcode capture with manual fallback, dealer-private watchlists and notes, bid caps, manual events and expenses, inventory/run-list uploads and legacy archive import. Dealer scope is enforced in PostgreSQL. An event and its status update use the same database transaction. The public Auction files were preserved.

## What was verified

- Embedded PostgreSQL applied the original schema and upgrade with a simulated Supabase auth identity. Tests covered no anonymous reads, cross-dealer read/write denial, mismatched dealer/vehicle rejection, same-dealer teammate edits, immutable event records, transaction rollback on rejected outcomes, duplicate import handling, and inventory separation for the same VIN.
- A 390px Edge test with mocked services covered unconfigured behavior, sign-in/out, VIN lookup and recalls, cap selection, saving/editing a vehicle, manual bid/win/expenses, inventory match, run-list duplicate protection, local notes migration, and reopening records.
- Pure logic tests covered calculation and import validation, including legacy preservation. These checks establish local behavior.

## What is still pending

Hosted Supabase authentication, PostgREST behavior, deployment-origin configuration, real mobile camera, NHTSA requests from the signed-in workspace, Mike's actual files and workflow, and backup restore remain unverified. Cross-dealer shared vehicle history and future departments are later milestones. No deployment or merge was performed.

## What Chris needs to decide

Approve the no-spend staging setup when ready and identify Mike's exact build, test device, and representative authorized exports. Confirm who can approve migration of existing dealer records and who signs off on the pilot.

## Next recommended action

Follow the [setup and release gate](dealer/README.md) in isolated staging. Run two dealer sessions plus one same-dealer teammate with fictional data and verify database behavior through the real API before entrusting it with dealer records.

[Draft PR and source/test evidence](https://github.com/ChappleWorks/ChappleWorks.github.io/pull/1/files)
