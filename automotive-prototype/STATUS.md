# LeoNet VINCORE Auction status

## Completed and verified

- Installed both VINCORE migrations in one transaction in leonet-crm-test using the pinned development SQL. Verified all five VINCORE tables have row-level security.
- Added vincore to the exposed Data API schemas. Verified the prior entries public, crm, crm_admin and graphql_public remain exposed. vincore_private and delivery remain unexposed.
- A read-only hosted SQL check under an unassigned fictional subject returned zero VINCORE dealers, auction vehicles, CRM memberships and billing workspaces. This was a database role simulation.
- Extended the staging API runner to check that each actual fictional dealer login sees no CRM memberships, CRM contacts, Invoice Studio ledgers or billing workspaces on the shared API. The real check still needs credentials. Six local tests passed.

## Pending and decision

The three fictional Auth accounts were absent immediately before credential handoff. The account forms use direct creation with auto-confirm and no email; Chris enters their passwords in Supabase. No new approval is required for the authorized scope. Keep passwords out of chat, Git and reports.

## Next action

Once the Auth identities exist, assign the fictional dealer memberships and run real dealer password, isolation, persistence and shared API checks. Verify VINCORE-only recovery, then publish and smoke-test the static HTTPS staging build. Cloudflare Pages static Direct Upload is the proposed route; verify account access and free configuration before publishing. There is no tested staging URL yet. The public Auction preview, CRM login settings and Invoice Studio login settings were preserved.

[Draft PR and tests](https://github.com/ChappleWorks/ChappleWorks.github.io/pull/1/files) · [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
