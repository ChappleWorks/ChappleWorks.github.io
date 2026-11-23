# LeoNet VINCORE Auction status

## What was completed

Ran the controlled activation preflight against leonet-crm-test. Added a reusable read-only catalog and RLS preflight to the VINCORE branch. Stopped before shared-project writes because the authenticated CRM and Invoice Studio baseline and complete CRM authorization boundary were not established.

## What was verified

- The shared project was Healthy on the Free Plan. The dashboard showed 27.79 MB database use, organization egress of 0.013/5 GB and four monthly active users. No paid services were used.
- The Data API exposed public, crm, crm_admin and graphql_public. Catalog queries found zero VINCORE schemas, zero custom Auth user triggers, and 23 relations readable by the authenticated role in the surveyed schemas, all with table RLS enabled. The role could execute 18 SECURITY DEFINER routines in the surveyed database schemas. Database execute grants alone do not show whether a routine is routed through the API or authorizes a particular caller.
- An unassigned fictional subject under the transaction-local authenticated role saw zero rows in CRM memberships, activities, contacts, companies, invoices and leads. The transaction was read-only and rolled back. This checks those policies at the database layer.
- Both CRM and Invoice Studio HTTPS entry points reached the CRM sign-in screen while signed out. This checks reachability and the signed-out gate.

## What is still pending

Authenticated baselines for CRM and Invoice Studio, the effective API routing and internal authorization of callable CRM routines and Worker endpoints, the shared VINCORE migrations and API exposure, fictional Auth accounts, real two-way access tests, isolated hosted restore and the staging HTTPS address are pending. No migrations, role grants, API settings, Auth users or live applications were changed.

## What Chris needs to decide

Make an approved fictional CRM/Invoice Studio baseline identity available in a secure session. If none exists, authorize a separate baseline fixture plan that preserves existing CRM records. Credentials should stay outside chat, Git and handoff documents.

## Next recommended action

Verify authenticated CRM and Invoice Studio behavior and check callable routine and Worker authorization. If preflight passes, follow the shared staging plan and verify real Auth and API isolation plus VINCORE-only recovery before handing Mike a staging URL.

[Shared staging plan](dealer/pilot/SHARED-SUPABASE.md) · [Read-only preflight](dealer/pilot/shared-preflight.sql) · [Draft PR](https://github.com/ChappleWorks/ChappleWorks.github.io/pull/1)
