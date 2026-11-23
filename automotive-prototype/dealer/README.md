# VINCORE secure dealer workspace (isolated draft)

**Status:** Implementation draft on a feature branch. Not deployed or verified end-to-end. The live automotive prototype is unchanged.

## Goal
Dealer signs in with their own Supabase Auth email/password, selects their provisioned dealership, privately manages VINs and auction preparation, and records bids/outcomes manually. This is NOT connected to any auction bidding API.

## Setup required
1. Create/use a dedicated Supabase project with email/password authentication. Decide whether email confirmation is required. Disable public self-registration for invite-only accounts.
2. Execute `supabase/dealer_workspace.sql` in the project's SQL editor (check for duplicate policies before rerunning).
3. Create dealer users with Supabase Auth invite/admin flow, then provision each dealer and membership using the SQL examples.
4. Copy `dealer/config.example.js` to `dealer/config.js` and enter the public **project URL** and **publishable/anon key**. NEVER commit a service_role key or database password.
5. Host `dealer/` and test two distinct dealerships in separate private sessions: data separation, signed-out access, events against another dealer's vehicle, and cross-account modification attempts.
6. Only after security review and tests, link this dealer portal from the existing Auction page. Current public prototype localStorage data is NOT migrated automatically.

## Security boundary
GitHub Pages is public. Login protects database records through Supabase RLS, **not** the static HTML/source files. Do not store private data or secrets in GitHub files. Each vehicle is scoped by dealer_id; event writes also verify the event vehicle belongs to the same dealer. RLS access must be validated in a real project before production.

## Scope
The secure workspace is a separate starting point; the current comprehensive VIN research interface remains public and local-only. Integrating its research/notes/imports into the secure workspace requires a deliberate follow-up migration, preserving historical records and testing for cross-tenant leaks.
