# LeoNet VINCORE Auction status

## Verified

- The existing VINCORE dealer application is deployed to the separate static HTTPS staging site at https://leonet-vincore-staging.pages.dev/. HTTPS returned 200 and the VINCORE dealer email/password form rendered. The response includes noindex. The GitHub Pages production preview and existing LeoNet apps were left unchanged.
- All three fictional Supabase Auth users are confirmed. Dealer A and the teammate share the same dealership, and Dealer B belongs to a different dealership. All five dealer tables have RLS. A direct signed-out API request returned HTTP 401 and PostgreSQL code 42501.
- Hosted PostgreSQL tests using the three actual account subjects exercised a fictional vehicle and inventory row, bid, teammate purchase, expense, record visibility and dealer-private write rejection. Dealer A and Dealer B saw no CRM memberships, contacts, or Invoice Studio workspaces on the checked database paths. The fictional operation was rolled back. This was a database identity simulation.
- Hosting used static Cloudflare Pages Direct Upload with no Functions, upgrades, or paid add-ons.

## Pending

Chris has the live Dealer A sign-in form. Actual password sign-ins, authenticated API isolation, browser record persistence and hosted recovery remain unverified. No real dealer data is authorized. Do not distribute as a verified pilot until those checks pass.

## Next

Chris signs in once on the staging site as Dealer A. Verify the workspace, save and reopen a fictional record, then check Dealer B and teammate access and the private CRM/Invoice Studio API boundary. Rehearse backup recovery before dealer handoff.

[HTTPS staging](https://leonet-vincore-staging.pages.dev/) · [Draft PR and tests](https://github.com/ChappleWorks/ChappleWorks.github.io/pull/1/files)
