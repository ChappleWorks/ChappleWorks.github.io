# VINCORE staging and Mike's phone rehearsal

Use this runbook for a separate HTTPS origin for the dealer workspace. Before sharing leonet-crm-test, complete the [shared-project approval and validation gates](SHARED-SUPABASE.md). Start with fictional accounts and files. Confirm the hosting and Supabase account can run without any extra charge, including overages. No paid backups or upgrades are needed for this rehearsal. The development checkout has no configured hosted project.

## Set up staging

1. Confirm the staging project reference and separate HTTPS origin. In Supabase, disable public signups and leave password sign-in enabled. Apply [the base schema](../../supabase/dealer_workspace.sql) then [the upgrade](../../supabase/dealer_workspace_upgrade.sql) to a blank project. If the vincore base migration already exists, apply only the upgrade. A previous public-schema pilot is a separate migration case, covered in the shared-project plan.
2. In Authentication, create three confirmed test users with distinct randomly generated passwords. Use the addresses below as fictional identifiers and auto-confirm them in the admin interface. Keep the passwords in the approved secret store. Do not send mail to these addresses.

   | Seat | Address | Membership |
   | --- | --- | --- |
   | Dealer A | vincore-dealer-a@example.com | VINCORE Pilot Dealer A, owner |
   | Dealer B | vincore-dealer-b@example.com | VINCORE Pilot Dealer B, owner |
   | Dealer A teammate | vincore-dealer-a-teammate@example.com | VINCORE Pilot Dealer A, dealer |

3. Execute [assign-fictional-dealers.sql](assign-fictional-dealers.sql) as the staging database administrator. It rolls back if any required confirmed account is missing and is safe to rerun for those same accounts.
4. Serve the feature branch dealer workspace at the staging origin with an untracked environment-specific config.js. Use the project URL and public publishable key. Add only vincore to the Data API exposed schemas after both migrations succeed. Keep vincore_private and its helpers unexposed. The hosted check never needs an admin key, database password, or production access.
5. On the test runner, supply VINCORE_STAGE_URL, VINCORE_STAGE_KEY, VINCORE_STAGE_PASSWORD_A, VINCORE_STAGE_PASSWORD_B, and VINCORE_STAGE_PASSWORD_TEAMMATE through the process environment. Set VINCORE_STAGE_CONFIRM to fictional-staging only after checking the project reference and account assignments. Use the test accounts above. From dealer/tests, run:

   ```sh
   node staging-check.mjs
   ```

   The runner verifies password sign-in, exactly one intended membership per seat, anonymous denial, private reads and edits, denied cross-dealer inventory and run-list imports, duplicate handling, teammate attribution, purchase status, expenses, and record retrieval after sign-out and fresh sign-in. It writes marked fictional records, one set per successful run. Record the pass lines and evidence tag. Keep tokens, passwords, and connection strings out of evidence.

## Restore rehearsal

For shared leonet-crm-test, follow the VINCORE-only recovery procedure in [SHARED-SUPABASE.md](SHARED-SUPABASE.md). The project-level backup workflow below is for a dedicated VINCORE project only.

The local test exports and restores only the VINCORE table data into a separate instance. It verifies the purchase, expenses, inventory and RLS after restore. Hosted recovery still requires its own rehearsal.

1. In the dedicated fictional staging project, complete the API check and record the evidence tag. Follow the [Supabase CLI backup and restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) to make a manual logical backup, including the Auth data needed by VINCORE memberships. Free projects do not include automatic backups. Store the backup outside Git and Drive handoffs with restricted access.
2. Restore into an empty disposable Supabase stack or an approved second no-cost test project. Confirm the source and destination references before executing the restore. Keep the staging source intact.
3. Point the staging runner at the restore target and set VINCORE_RESTORE_TAG to the complete evidence tag from the source run. Run node staging-check.mjs with the restored test identities. This mode signs in, then reads the original vehicles, events, and inventory and verifies dealer isolation without writing fixture rows. Capture redacted results. Clear VINCORE_RESTORE_TAG and rerun for a fresh write-and-isolation check.

## Phone acceptance

Use Dealer A on the staging URL and Dealer B in a separate browser session. Any file tested on staging must be fictional. If Mike's export is necessary to establish column layout, request a sample with fabricated VINs and business values or a blank template.

| Step | Expected result |
| --- | --- |
| Open staging, sign in as Dealer A and choose its workspace. | Dealer A sees its own list, even when Dealer B already has an entry for the same VIN. |
| Scan a practice barcode and confirm the VIN. Repeat with camera permission denied and manual entry. | Supported camera capture works. Manual entry still works when capture is unavailable. |
| Look up the fixture VIN with NHTSA. Retry on weak signal and without connectivity. | Response is attributed, model campaigns are distinct from VIN-specific recall status, and manual preparation is possible if lookup fails while the app is open. Full offline sync is outside this pilot. |
| Import [inventory.csv](inventory.csv) and [run-list.csv](run-list.csv). Import both again. | One stock match for the VIN and one run-list appearance. The run-list entry shows lane A12. |
| Prepare the run-list entry. Enter wholesale value 14,200, cost 500, and profit 1,000. Copy the cap and save notes. | The saved maximum is 12,700 and attached to the correct VIN and lane. |
| Record a manual bid of 12,000, a win for 12,000, and an expense of 450. | Status goes from watching to bidding to won. Recorded acquisition totals 12,450. |
| Sign out and back in, then open the same vehicle from another browser. | Notes, cap, event history, inventory match and purchase status are recovered from the server. |
| Open CARFAX and Manheim after copying the fixture VIN. | Clipboard handoff works on Mike's device. Stop at any paid or credentialed step unless already authorized and included. |
| Repeat with representative fictional exports in Mike's actual file format. | Confirm column names, date format, lane/run, duplicates and VIN matching. If a file needs mapping, record it as a pilot blocker before handoff. |

Record the build SHA, device/browser, network conditions, step results, and any blocker. After the hosted API, backup restore, and phone rehearsal pass, Chris can approve a fictional dealer pilot.
