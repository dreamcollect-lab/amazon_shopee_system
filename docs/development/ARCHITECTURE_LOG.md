# Architecture Log

## STEP1 GitHub Development Version

- This folder is the development and operation source of truth going forward.
- `scripts/step1.py` runs STEP1.
- Input masters are stored under `input/`.
- Amazon CSV files are placed under `input/working/` as temporary input data.
- Amazon CSV files under `input/working/*.csv` are ignored by Git; only `input/working/.gitkeep` is tracked.
- Outputs are generated under `output/` at runtime and are not tracked by Git.
- Logs are generated under `logs/` at runtime and are not tracked by Git.
- `summary.txt` is generated at runtime and is not tracked by Git.
- GitHub Actions workflow is located at `.github/workflows/run_step1.yml`.
- STEP1 is not just a CSV export system. It is a review system for growing `category_rules.csv`, `ng_master.csv`, and `shopee_existing_asin.csv` through SAFE / CHECK / OUT_DENY review.

## Runtime Masters

- `input/category_rules.csv`: category Allow/Deny master.
- `input/ng_master.csv`: NG master, long-term retained, updated only when needed.
- `input/shopee_existing_asin.csv`: Shopee duplicate ASIN master, long-term retained, updated only when needed. It is treated close to an NG master and is not an auto-delete or monthly cleanup target.

## Git Tracking Policy

- Track code, master CSVs, workflow, and DDOS.
- Do not track Amazon CSV input files.
- Keep `input/working/.gitkeep` so the input folder exists in the repository.
- Future Web UI upload should treat Amazon CSVs as temporary files.

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

## Phase3 Web UI Architecture Candidate

First candidate:

```text
GitHub Pages Web UI
  -> GitHub API
  -> GitHub Actions workflow_dispatch
  -> scripts/step1.py
  -> Artifacts
  -> Web UI result display and CSV download
```

Design notes:

- GitHub Pages hosts only the Web UI.
- Python STEP1 remains in GitHub Actions.
- GitHub API is required for master CSV read/update, workflow dispatch, workflow run polling, and artifact download.
- Amazon CSV must remain temporary input data and must not be committed into Git history.
- GitHub Pages has no backend secret store, so PAT handling in the browser is the largest risk.
- Streamlit Community Cloud is the fallback option because it can run Python UI code and has a server-side environment/secrets model.

## Phase4 GitHub Pages UI Implementation

```text
docs/index.html
  -> docs/style.css
  -> docs/app.js
      -> GitHub Contents API
      -> GitHub Actions workflow_dispatch API
      -> Workflow runs API
      -> Artifacts API
```

Implemented capabilities:

- PAT input, save, load, and delete using LocalStorage.
- Repository, branch, and workflow confirmation.
- Work wizard shows Amazon CSV confirmation -> rule addition -> master save -> STEP1 execution -> result review.
- Run STEP1 checks whether Amazon CSV has been uploaded and whether `category_rules.csv` has been fetched/saved in the UI, and warns if not.
- Amazon CSV file selection and filename-derived category/price display.
- Amazon CSV upload to `input/working/` through Contents API.
- Master CSV get/update for `category_rules.csv`, `ng_master.csv`, and `shopee_existing_asin.csv`.
- `run_step1.yml` workflow dispatch.
- Latest workflow run display.
- Artifacts listing and download, with SAFE/CHECK/OUT_DENY visually prioritized.

Phase4 tradeoff:

- CSV upload through Contents API leaves Git history. This is accepted in Phase4 and should be improved in a later phase.

## Phase7 Business Application Layout

Phase7 defines the standard UI shell for the future Amazon->Shopee OS.

```text
docs/index.html
  -> app header
  -> PAT / repository connection bar
  -> workspace
      -> left business flow
      -> right focused work area
  -> bottom status console
docs/style.css
  -> enterprise admin layout tokens
  -> reusable panel, flow, action, status, artifact styles
docs/app.js
  -> GitHub API operations
  -> flow step state
  -> active work-panel switching
  -> status console logging
```

Standard business flow:

```text
Amazon CSV upload
  -> category_rules.csv editing
  -> master save
  -> STEP1 execution
  -> Review
  -> Rule improvement and rerun
```

Design rules:

- The left side always shows the fixed operational flow.
- Only the current work area is displayed on the right.
- Completed flow items are check-marked, the active item is highlighted, and unstarted items remain neutral.
- The bottom status console is the single place for execution results, errors, GitHub API results, and Workflow state.
- The structure must support future STEP2, STEP3, STEP4, and AI review screens without changing the whole page model.
