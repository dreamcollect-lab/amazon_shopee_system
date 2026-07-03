# Handover

## Current Position

- Project folder: `C:\Users\uedar\amazon_shopee_system_github`
- This folder is being prepared as the GitHub development version candidate.
- The current production folder must not be changed.
- GitHub remote connection and push have not been performed yet.

## Current Direction

- STEP1 will be maintained in a GitHub-friendly form.
- Amazon CSV files for STEP1 are placed in `input/working/`.
- GitHub Actions version does not move processed Amazon CSV files by default.
- SAFE, CHECK, and OUT_DENY CSVs are the priority review outputs.

## Important Files

- `scripts/step1.py`: STEP1 processing script.
- `input/category_rules.csv`: category Allow/Deny rule master.
- `input/ng_master.csv`: long-term NG master.
- `input/shopee_existing_asin.csv`: Shopee existing ASIN master.
- `.github/workflows/run_step1.yml`: manual GitHub Actions workflow.

## Notes For Next Work

- Git repository has been re-initialized locally because the previous `.git` existed but was not a valid repository.
- GitHub remote connection and first push are still pending.
- Do not change the format of `category_rules.csv`.
- Do not delete `ng_master.csv`.
