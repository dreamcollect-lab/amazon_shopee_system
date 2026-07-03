# Architecture Log

## STEP1 GitHub Development Version

- This folder is the development source of truth going forward.
- `scripts/step1.py` runs STEP1.
- Input masters are stored under `input/`.
- Amazon CSV files are placed under `input/working/`.
- Outputs are generated under `output/` at runtime and are not tracked by Git.
- Logs are generated under `logs/` at runtime and are not tracked by Git.
- `summary.txt` is generated at runtime and is not tracked by Git.
- GitHub Actions workflow is located at `.github/workflows/run_step1.yml`.

## Runtime Masters

- `input/category_rules.csv`: category Allow/Deny master.
- `input/ng_master.csv`: NG master, long-term retained.
- `input/shopee_existing_asin.csv`: Shopee duplicate ASIN master.

## Review Output Policy

- SAFE, CHECK, and OUT_DENY are the priority review outputs.
- OUT_NG, OUT_DUPLICATE, and OUT_PRICE are normally retention/support outputs.
- Review CSV and Shopee import CSV are not split at this stage.
- Output CSVs keep `source_file`, `source_row`, `category`, `status`, `asin`, `title`, `brand`, `price_yen`, `hit_type`, `hit_value`, `out_reason`, `amazon_url`, `image_url`, `raw_text_for_ng`, and `all_asins`.

## GitHub Actions

- Manual execution with `workflow_dispatch`.
- Python 3.12.
- Installs `requirements.txt`.
- Runs `python scripts/step1.py`.
- Uploads `output/`, `logs/`, and `summary.txt` as artifacts.
- Recommended artifact retention is 14 days.
