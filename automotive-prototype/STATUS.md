# LeoNet VINCORE Auction status

## Verified

- The existing VINCORE dealer application is deployed to the separate static HTTPS staging site at https://leonet-vincore-staging.pages.dev/. HTTPS returned 200 and the VINCORE dealer email/password form rendered. The response includes noindex. The GitHub Pages production preview and existing LeoNet apps were left unchanged.
- All three fictional Supabase Auth users are confirmed. Dealer A and the teammate share the same dealership, and Dealer B belongs to a different dealership. All five dealer tables have RLS. A direct signed-out API request returned HTTP 401 and PostgreSQL code 42501.
- Hosted PostgreSQL tests using the three actual account subjects exercised a fictional vehicle and inventory row, bid, teammate purchase, expense, record visibility and dealer-private write rejection. Dealer A and Dealer B saw no CRM memberships, contacts, or Invoice Studio workspaces on the checked database paths. The fictional operation was rolled back. This was a database identity simulation.
- Hosting used static Cloudflare Pages Direct Upload with no Functions, upgrades, or paid add-ons.

- Dealer A successfully signed in on the deployed site. A live NHTSA decode, vehicle save and reload, inventory and run-list imports, manual bid, purchase and expense, and sign-out all passed. The fictional acquisition total was $12,450.

- Dealer B signed in and saved the same VIN in its separate workspace. Its record survived reload, and the Dealer A record was absent. The teammate signed in, recovered Dealer A's acquisition total, did not see Dealer B's record, and saved a note to Dealer A's record.

- A read-only export of hosted fictional VINCORE records restored successfully in a disposable local PostgreSQL instance. All five table counts matched, the acquisition total remained 12,450, dealer isolation held, and destination CRM and Auth records were preserved.

- Direct authenticated API checks passed using the real Dealer A login on a separate Cloudflare Pages preview deployment. VINCORE returned Dealer A's dealership; CRM memberships and contacts and Invoice Studio ledgers and billing workspaces each returned HTTP 200 with no records. The canonical staging deployment was not replaced.

## Pending

The phone rehearsal with Mike and fictional data remains pending.

## Next

Run the phone rehearsal with Mike using fictional data on the verified VINCORE staging site.

[HTTPS staging](https://leonet-vincore-staging.pages.dev/) · [Draft PR and tests](https://github.com/ChappleWorks/ChappleWorks.github.io/pull/1/files)
