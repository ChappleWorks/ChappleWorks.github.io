# VINCORE dealer Auction workspace

The development branch keeps the original public Auction prototype and adds the private workflow under [dealer/](./index.html). The public preview never sends local records to this workspace automatically.

## Configure an isolated Supabase staging project

1. Confirm the staging project and hosting are approved under the no-spend rule. Use fictional dealers and vehicles. Disable public signup and configure email/password authentication. Provision verified test users through the admin interface, then set their memberships. This draft has no self-service invite acceptance or password recovery screen.
2. On an empty project run [dealer_workspace.sql](../supabase/dealer_workspace.sql), then [dealer_workspace_upgrade.sql](../supabase/dealer_workspace_upgrade.sql). If the new vincore base schema is already applied, back up first and apply the upgrade once. If an earlier public-schema pilot exists, stop for the migration procedure in the [shared-project plan](pilot/SHARED-SUPABASE.md). A mismatched historical event/vehicle tenant blocks the upgrade and rolls it back. Investigate such rows in staging before retrying. Validate the new NOT VALID constraints against pre-existing rows after resolving any legacy invalid data.
3. Copy [config.example.js](config.example.js) to the ignored config.js and fill only the public project URL and publishable key or legacy anon key. Serve dealer/ over HTTPS on an approved development origin. Supply config.js as part of that environment, outside Git. Keep secret keys and database credentials out of browser assets.
4. Expose only the new vincore schema in addition to the existing API exposure settings. Keep vincore_private unexposed. Verify the CDN script loads and sign in using at least two separate dealer accounts, plus a teammate of one dealer. Run the acceptance checks below with fictional data.

## Dealer workflow

- Look up a VIN with NHTSA or enter details manually when lookup or scanning is unavailable. Recall data is model-level. The VIN handoff uses clipboard copy and the CARFAX or Manheim provider homepage.
- Enter wholesale or retail inputs to calculate a cap, save to the watchlist, and select a vehicle to edit preparation or record a manual bid, outcome, expense, or note. An auction has one terminal outcome. Expenses and notes can follow it. The acquisition total reflects the recorded purchase and expense entries.
- In Import auction records, choose an inventory CSV (vin, optional label and stock_number), auction run-list CSV (vin, auction_name, auction_date, lane_run, optional label), or VIN JSON export. A run list must use YYYY-MM-DD dates. Preview and explicitly confirm the target dealership. The database leaves identical imports intact. Inventory imports add VINs and preserve existing stock records on repeat. Matches appear when selecting the auction vehicle.
- To migrate existing browser records, open the authenticated workspace on the same origin and browser profile as the original storage. Preview and confirm only records authorized for that dealership. If the staging origin differs, use the legacy VIN JSON export and import. The legacy exporter omits its separate local VIN notes and quick bid decisions. Same-origin browser import includes those where linked to a valid VIN. Untagged decisions remain in the original local data. Imported history is archived as source evidence and does not become a verified purchase or live bid. The structured customer contact field is omitted, but free-text notes may still contain contact information. Review the source material before import.

## Test and release gate

From dealer/tests, run npm ci and npm test. The browser suite uses local Edge on Windows or Playwright Chromium. Set VINCORE_BROWSER_PATH to an installed Chromium browser if needed. The test suite uses fictional data, embedded PostgreSQL with a simulated auth.uid(), and a mocked browser SDK. Run the actual hosted checks before dealer use.

- Verify Supabase Auth login, expiry, sign-out and account recovery. Confirm both dealer sessions and one same-dealer teammate.
- Verify actual API policies for list, detail, create, update, import, and events. Dealer A and Dealer B can use the same VIN privately. Same-dealer edits preserve attribution. Check rejected cross-dealer operations and signed-out requests.
- On the dealer phone, exercise scan or manual entry, NHTSA response and outage, run-list VIN matching, provider handoff, an event sequence, duplicate import, and retrieval after sign-in from a second browser.
- Restore a test backup and confirm inventory, bid history and purchases. Confirm Mike’s source build and sample files and get Chris’s approval before a dealer pilot. Keep real dealer records out of the public preview.

[Current project status](../STATUS.md) · [Draft PR #1](https://github.com/ChappleWorks/ChappleWorks.github.io/pull/1)

[Staging verification and Mike's phone rehearsal](pilot/STAGING.md)
