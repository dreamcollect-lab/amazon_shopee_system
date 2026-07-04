# Decision Log

## 2026-07-03

- Use `C:\Users\uedar\amazon_shopee_system_github` as the GitHub development version candidate.
- Treat this GitHub development version as the development and operation source of truth going forward.
- GitHub is not a permanent archive; it manages the currently operated system.
- Do not touch the current production folder.
- Treat the previous `.git` as invalid because it existed but did not contain the required Git repository structure.
- Re-initialize Git locally with `git init`.
- Do not add, change, or push GitHub remote during this task.
- Current local Git state is valid and an existing GitHub remote is present.
- Rename the default branch to `main`.
- Keep `input/category_rules.csv` format unchanged.
- Keep `input/ng_master.csv` as a long-term retained master.
- Keep `input/shopee_existing_asin.csv` as the long-term retained DUPLICATE master. It is treated close to an NG master and is not a monthly cleanup target.
- `ng_master.csv` and `shopee_existing_asin.csv` are updated only when needed; they are not mandatory updates for every STEP1 run.
- `category_rules.csv` is updated daily and organized about once per month; old organized copies are not retained.
- Use `input/working/` as the Amazon CSV input folder.
- Do not move Amazon CSV files after GitHub Actions STEP1 runs by default.
- Use this judgment order: NG -> DUPLICATE -> DENY -> ALLOW -> SAFE -> PRICE.
- Prioritize review in this order: SAFE CSV, CHECK CSV, OUT_DENY CSV, OUT_NG CSV, OUT_DUPLICATE CSV, OUT_PRICE CSV.
- Do not split review CSV and Shopee import CSV at this stage; keep source and judgment columns in SAFE/CHECK/OUT_DENY.
- STEP1 is not just a CSV export system. It is a review system that checks SAFE / CHECK / OUT_DENY and grows Allow/Deny, NG, and Duplicate masters.
- Use GitHub operation flow: input Amazon CSV, check the Amazon CSV itself, update category rules, update NG/DUPLICATE masters only when needed, run STEP1, review SAFE/CHECK/OUT_DENY, revise category rules / NG / Duplicate masters, rerun if needed.
- SAFE review confirms no category mixing and no product that should be excluded.
- CHECK review finds SAFE candidates and Allow candidates.
- OUT_DENY review checks Deny false positives and excessive Deny.
- Do not implement AI comments or OpenAI API integration in this phase. AI review is a future phase, and current operation is staff manually giving CSVs to GPT when needed.
- Split GitHub Actions artifacts into priority CSV artifacts and `99_ALL_RESULTS` so SAFE / CHECK / OUT_DENY are easy to find.
- Keep summary concise: priority files appear near the top, lower-priority files appear below, and the full output file list is collapsed.
- Treat GitHub Actions total time and STEP1 internal processing time as separate measurements.
- Remove root-level NG master helper/intermediate files from the STEP1-only GitHub development version after confirming STEP1 does not reference them.
