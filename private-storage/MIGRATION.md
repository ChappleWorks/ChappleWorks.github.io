# Task 04 — Migration and verification checklist

Status: PREPARED, NOT CONNECTED. Do not mark complete until a real authorized end-to-end test.

## Verified infrastructure
- Existing private Google Sheet: https://docs.google.com/spreadsheets/d/15wcozk9MCy6SfXfbIJ4HEc1uzwx4gcz7hCW-SruMgA0/edit
- Storage tab: Command Center Storage; row 2 dashboard, row 3 catalog.
- Source: Code.gs and Sidebar.html in this folder.
- Dashboard public prototype: https://chappleworks.github.io/dashboard.html

## Prepare without owner interaction
1. Ensure the dashboard initializes localStorage keys `cw-command-center-v01` and `cw-catalog-v02` even on first visit. **Committed**.
2. Ensure unified export contains `format: "cw-backup-v03"`, `dashboard.projects/tasks/sessions`, and `catalog[]`. **Source reviewed**.
3. Ensure invalid/missing backup records are rejected before writing. **Source reviewed; runtime untested**.
4. Keep storage data in the private Sheet only; do not place customer data in public GitHub. **Design constraint**.

## Owner-assisted installation
1. Open the Master Registry with chrischapple84@gmail.com.
2. Extensions → Apps Script → add Code.gs and Sidebar.html from this folder. Sidebar HTML file name must be exactly `Sidebar`.
3. Save and authorize the bound script; refresh the Sheet.
4. Open Chapple Works → Open Storage.
5. Export the unified JSON backup from the browser containing the desired authoritative data. Important: localStorage differs per device; don't overwrite the authoritative device with a phone's starter data.
6. Paste the unified JSON into the private storage sidebar and save.
7. Reload cloud data, compare counts and record contents to the exported backup.

## Acceptance test (must all pass)
- [ ] Apps Script sidebar opens under authorized Chapple Works account.
- [ ] Invalid JSON is rejected without changing existing cloud records.
- [ ] Valid unified backup saves dashboard and catalog.
- [ ] Reload returns identical project/task/session/catalog counts and IDs.
- [ ] Data persists after browser refresh.
- [ ] A second authorized device can access the same stored snapshot.
- [ ] Public dashboard does not expose private Sheet records.
- [ ] Confirm behavior with backup larger than one cell's supported size; refuse cleanly.

## Limitations requiring further engineering
This is a manual snapshot migration bridge, **not live automatic synchronization**. A fully synchronized dashboard requires an authenticated app surface, conflict handling, and a tested backend connection. Never expose Apps Script write endpoints without authentication.

## Recovery
Before replacing cloud records, retain an exported JSON backup. If the migration fails, do not delete localStorage; restore the backup on the original device using the dashboard Import control.
