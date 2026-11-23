# LeoNet VINCORE Auction status

## What was completed

Prepared the shared Supabase design on feature/vincore-dealer-accounts. Moved dealer data into vincore, separated private database helpers, selected the API schema explicitly and isolated the browser session key and sign-out. Documented staging approval, rollback, real API checks and VINCORE-only recovery.

## What was verified

Six local automated tests passed. Embedded PostgreSQL applied both migrations, denied access to CRM-only and cross-dealer identities on VINCORE, and denied a VINCORE-only identity using a modeled CRM membership policy. A VINCORE-only data export restored into a separate local database without changing its existing CRM or Auth records. Missing identity references caused a rollback. Browser and API checks used mocks and verified explicit schema selection and local-session sign-out.

## What is still pending

Effective hosted CRM grants, views, privileged routines and Worker authorization are unverified. The real Supabase API, isolated recovery including identity mapping, CRM and Invoice Studio regression, and Mike's phone rehearsal have not run. No changes were applied to leonet-crm-test or either live application. No merge or charges occurred.

## What Chris needs to decide

Approve a separately scoped activation in leonet-crm-test after the grant and dependency preflight, or continue in a disposable Supabase environment for hosted-style verification.

## Next recommended action

Follow the [shared-project plan](dealer/pilot/SHARED-SUPABASE.md) after approval. Record the CRM/Invoice Studio baseline, run the real API access matrix with fictional identities, and prove a VINCORE-only restore before the phone rehearsal.

[Draft PR and test evidence](https://github.com/ChappleWorks/ChappleWorks.github.io/pull/1/files)
