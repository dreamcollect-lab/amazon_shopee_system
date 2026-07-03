# Decision Log

## 2026-07-03

- Use `C:\Users\uedar\amazon_shopee_system_github` as the GitHub development version candidate.
- Treat this GitHub development version as the development source of truth going forward.
- Do not touch the current production folder.
- Treat the previous `.git` as invalid because it existed but did not contain the required Git repository structure.
- Re-initialize Git locally with `git init`.
- Do not configure GitHub remote or push during this task.
- Current local Git state is valid after re-initialization; no remote is configured yet.
- Rename the default branch to `main`.
- Keep `input/category_rules.csv` format unchanged.
- Keep `input/ng_master.csv` as a long-term retained master.
- `category_rules.csv` is updated daily and organized about once per month; old organized copies are not retained.
- Use `input/working/` as the Amazon CSV input folder.
- Do not move Amazon CSV files after GitHub Actions STEP1 runs by default.
- Prioritize review in this order: SAFE CSV, CHECK CSV, OUT_DENY CSV, then OUT_NG / OUT_DUPLICATE / OUT_PRICE as needed.
- Do not split review CSV and Shopee import CSV at this stage; keep source and judgment columns in SAFE/CHECK/OUT_DENY.
- Remove root-level NG master helper/intermediate files from the STEP1-only GitHub development version after confirming STEP1 does not reference them.
