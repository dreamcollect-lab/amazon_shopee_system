# Architecture Log

## STEP1 GitHub Development Version

- This folder is the development and operation source of truth going forward.
- `scripts/step1.py` runs STEP1.
- Input masters are stored under `input/`.
- Amazon CSV files are placed under `input/working/`.
- Outputs are generated under `output/` at runtime and are not tracked by Git.
- Logs are generated under `logs/` at runtime and are not tracked by Git.
- `summary.txt` is generated at runtime and is not tracked by Git.
- GitHub Actions workflow is located at `.github/workflows/run_step1.yml`.
- STEP1 is not just a CSV export system. It is a review system for growing `category_rules.csv`, `ng_master.csv`, and `shopee_existing_asin.csv` through SAFE / CHECK / OUT_DENY review.

## Runtime Masters

- `input/category_rules.csv`: category Allow/Deny master.
- `input/ng_master.csv`: NG master, long-term retained, updated only when needed.
- `input/shopee_existing_asin.csv`: Shopee duplicate ASIN master, long-term retained, updated only when needed. It is treated close to an NG master and is not an auto-delete or monthly cleanup target.

## Judgment Order

1. NG
2. DUPLICATE
3. DENY
4. ALLOW
5. SAFE
6. PRICE

## Review Output Policy

- SAFE, CHECK, and OUT_DENY are the priority review outputs.
- OUT_NG, OUT_DUPLICATE, and OUT_PRICE are normally retention/support outputs.
- Review priority is SAFE -> CHECK -> OUT_DENY -> OUT_NG -> OUT_DUPLICATE -> OUT_PRICE.
- SAFE checks category mixing and products that should not be SAFE.
- CHECK finds products that can become SAFE and Allow candidates.
- OUT_DENY checks products that should be SAFE but were dropped by Deny, and excessive Deny rules.
- OUT_NG / OUT_DUPLICATE / OUT_PRICE are reviewed only when needed.
- Review CSV and Shopee import CSV are not split at this stage.
- Output CSVs keep `source_file`, `source_row`, `category`, `status`, `asin`, `title`, `brand`, `price_yen`, `hit_type`, `hit_value`, `out_reason`, `amazon_url`, `image_url`, `raw_text_for_ng`, and `all_asins`.
- OpenAI API or other AI connection is not implemented in the current phase. AI review is a future phase; current operation is staff manually passing CSVs to GPT when needed.

## GitHub Actions

- Manual execution with `workflow_dispatch`.
- Python 3.12.
- Installs `requirements.txt`.
- Runs `python scripts/step1.py`.
- Shows `summary.txt` in the GitHub Step Summary.
- Uploads split artifacts: `01_SAFE_CSV`, `02_CHECK_CSV`, `03_OUT_DENY_CSV`, `04_OUT_NG_CSV`, `05_OUT_DUPLICATE_CSV`, `06_OUT_PRICE_CSV`, and `99_ALL_RESULTS`.
- Recommended artifact retention is 14 days.

## Time Measurements

- GitHub Actions total time includes runner startup, checkout, Python setup, dependency install, STEP1 execution, summary display, and artifact upload.
- STEP1 processing time is measured inside `scripts/step1.py` and written to `summary.txt`.

## GitHub Operation Flow

```text
GitHub
  -> Amazon CSV under input/working/
  -> Check Amazon CSV itself
  -> category_rules.csv update when needed
  -> ng_master.csv update when needed
  -> shopee_existing_asin.csv update when needed
  -> Run STEP1
  -> Review SAFE
  -> Review CHECK
  -> Review OUT_DENY
  -> AI review or human review
  -> Fix category_rules.csv / ng_master.csv / shopee_existing_asin.csv when needed
  -> Re-run STEP1
```
