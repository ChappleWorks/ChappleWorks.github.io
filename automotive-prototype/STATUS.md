# LeoNet VINCORE Auction status

## Verified

- The separate dealer showcase is live at https://dealer-showcase.leonet-vincore-staging.pages.dev/. Dealer A signed in and the Auction performance view showed source-backed demo figures. The canonical staging deployment and the original public Auction were left intact.
- Seeded 100 clearly labeled fictional auction vehicles into Dealer A. Verified 45 purchased, 20 lost, 15 passed, 10 bidding and 10 watching. Prior fictional records remain. The seed is scoped to the fictional dealer and is safe to rerun.
- The report groups by auction and shows status counts, average recorded purchase price and average recorded all-in cost. Four independent hosted SQL results matched the signed-in browser. Bayline showed 12 purchases with averages of $12,494.00 and $13,853.50. All-in includes recorded expenses and can understate cost when expenses are missing.
- Seven automated tests passed, including a repeatable seed, cost aggregation, and the existing browser and security flows.

## Pending

The actual dealer needs a dedicated workspace and their history import needs mapping. The current inventory and auction-run CSV uploads are distinct from historical financial import. Prior legacy data can be archived, but archived amounts do not feed the current performance report. No direct dealer system or API has been identified or connected. No real dealer records were imported.

## Chris decision and next action

Get a redacted export sample or column headers from one historical auction file, plus the source system name if available. Use that to map auction, VIN, outcome, winning bid and expenses. Reconcile a small real import in the dealership's own private workspace before loading its full history. Add selling-price or margin reporting only when reliable realized sale and cost data are available.

[Dealer showcase](https://dealer-showcase.leonet-vincore-staging.pages.dev/) · [Draft PR](https://github.com/ChappleWorks/ChappleWorks.github.io/pull/1)
