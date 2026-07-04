# Current Status

- Local GitHub development folder exists at `C:\Users\uedar\amazon_shopee_system_github`.
- This GitHub development version is the development and operation source of truth going forward.
- GitHub is the source of truth for collaborative development and operation, not a permanent archive.
- Production folder is out of scope and has not been touched.
- Invalid `.git` residue was found earlier and local Git has been re-initialized.
- Current `.git` is valid and `git status` works.
- GitHub remote already exists locally.
- This task did not add or change GitHub remote settings.
- This task did not push to GitHub.
- Current branch is `main`.
- STEP1 GitHub Actions support files are present.
- `input/working/.gitkeep` exists to preserve the Amazon CSV input folder.
- Amazon CSV files under `input/working/*.csv` are temporary input data and are not tracked by Git.

## Operations Policy

- `category_rules.csv` is the category Allow/Deny decision body.
- `ng_master.csv` is a long-term retained master.
- `shopee_existing_asin.csv` is the DUPLICATE master. It is treated close to an NG master, retained long term, and is not an auto-delete or monthly cleanup target.
- `ng_master.csv` and `shopee_existing_asin.csv` are updated only when needed. They are not mandatory daily updates.
- GitHub tracks code, master CSVs, workflow, and DDOS. It does not track Amazon CSV input files.
- `category_rules.csv` is expected to be updated daily and organized monthly.
- Old organized copies of `category_rules.csv` are not required.
- If past rules become necessary, add them again to the current master.
- Review CSV and Shopee import CSV are not split. SAFE/CHECK/OUT_DENY keep source and judgment columns for review.
- STEP1 is not just a CSV export system. It is a review system for checking SAFE / CHECK / OUT_DENY and improving Allow/Deny, NG, and Duplicate masters.
- OpenAI API or other AI connections are not implemented in the current phase. AI review is a future phase; for now, staff manually pass SAFE / CHECK / OUT_DENY CSVs to GPT when needed.

## GitHub Operation Flow

1. Put Amazon CSV under `input/working/`.
2. Check the Amazon CSV itself.
3. Update `category_rules.csv` as needed.
4. Update `ng_master.csv` only when needed.
5. Update `shopee_existing_asin.csv` only when needed.
6. Run STEP1 from GitHub Actions.
7. Review SAFE.
8. Review CHECK.
9. Review OUT_DENY.
10. Fix `category_rules.csv`, `ng_master.csv`, or `shopee_existing_asin.csv` if needed.
11. Run STEP1 again.
12. Finish when review is clean.

## Amazon CSV Input Policy

- Amazon CSV files are temporary input data.
- Do not keep Amazon CSV files in Git history.
- `input/working/` is the input folder, but CSV files in it are ignored by Git.
- Keep only `input/working/.gitkeep` tracked.
- After Web UI completion, Amazon CSV files are expected to be temporary uploads through the Web UI.

## Phase3 Web UI Direction

- Phase3 will design a Web UI so office staff can use STEP1 without directly operating GitHub.
- The first candidate is GitHub Pages + GitHub API + GitHub Actions.
- GitHub Pages cannot run Python, so STEP1 continues to run in GitHub Actions.
- PC always-on operation is not required.
- OpenAI API and AI auto-review are not implemented in Phase3-1.
- The biggest technical risk is secure token handling in a static GitHub Pages UI.
- Streamlit Community Cloud is the main fallback if GitHub Pages cannot safely handle authentication and temporary CSV input.

## Phase4 GitHub Pages UI

- Phase4 implements the first working GitHub Pages UI under `docs/`.
- Files: `docs/index.html`, `docs/style.css`, `docs/app.js`.
- Backend and GitHub App are not used.
- PAT is stored in LocalStorage for usability.
- The UI can upload Amazon CSV to `input/working/` using GitHub Contents API.
- The UI can trigger `run_step1.yml` with workflow_dispatch.
- The UI can show the latest workflow run and list/download artifacts.
- The UI guides users through Amazon CSV upload, Amazon CSV confirmation, `category_rules.csv` editing, master save, STEP1 execution, and artifact review.
- Run STEP1 warns and stops if Amazon CSV has not been uploaded or if `category_rules.csv` has not been fetched/saved in the UI.
- Phase4 accepts that uploaded Amazon CSV files are committed to Git history; avoiding that is a later phase.
- OpenAI API integration and AI comments are not implemented.

## Judgment And Review Order

- Judgment order: NG -> DUPLICATE -> DENY -> ALLOW -> SAFE -> PRICE.
- Review priority: SAFE -> CHECK -> OUT_DENY -> OUT_NG -> OUT_DUPLICATE -> OUT_PRICE.

## Review Purpose

- SAFE: confirm there is no category mixing and no product that should be excluded.
- CHECK: find products that can be moved to SAFE and identify Allow candidates.
- OUT_DENY: confirm truly SAFE products are not dropped by Deny and check excessive Deny.
- OUT_NG / OUT_DUPLICATE / OUT_PRICE: not priority checks; review only when needed.

## GitHub Actions Result UI

- Step Summary shows SAFE, CHECK, and OUT_DENY as the priority files.
- Other files are shown lower in the summary.
- Full output file list is collapsed with HTML `details` / `summary`.
- Artifacts are split into `01_SAFE_CSV`, `02_CHECK_CSV`, `03_OUT_DENY_CSV`, `04_OUT_NG_CSV`, `05_OUT_DUPLICATE_CSV`, `06_OUT_PRICE_CSV`, and `99_ALL_RESULTS`.

## Processing Time

- GitHub Actions total time includes runner startup, checkout, Python setup, dependency install, artifact upload, and other workflow overhead.
- STEP1 processing time is the internal runtime of `scripts/step1.py` and is the time shown in `summary.txt`.

## Cleanup Completed

- Removed `conpare_ng_master.py`, `make_csv.py`, `new_words.txt`, `ng_master_new.csv`, `ng_master_old.csv`, and `memo.txt` after confirming STEP1 does not reference them.
