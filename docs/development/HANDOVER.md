# Handover

## Current Position

- Project folder: `C:\Users\uedar\amazon_shopee_system_github`
- This folder is the GitHub development and operation source of truth candidate.
- GitHub is the source of truth for collaborative development and operation, not a permanent archive.
- The current production folder must not be changed.
- GitHub remote already exists locally, but this task does not change remote settings or push.

## Current Direction

- STEP1 will be maintained in a GitHub-friendly form.
- Amazon CSV files for STEP1 are placed in `input/working/`.
- Amazon CSV files are temporary input data and are not tracked by Git.
- `category_rules.csv` is updated as part of daily operation.
- `ng_master.csv` is updated only when needed.
- `shopee_existing_asin.csv` is updated only when needed and is not mandatory for every STEP1 run.
- GitHub Actions version does not move processed Amazon CSV files by default.
- SAFE, CHECK, and OUT_DENY CSVs are the priority review outputs.
- STEP1 is not just a CSV export system. It is a review system for checking SAFE / CHECK / OUT_DENY and growing Allow/Deny, NG, and Duplicate masters.
- OpenAI API and automatic AI comments are not implemented in the current phase. If AI review is needed, staff manually pass SAFE / CHECK / OUT_DENY CSVs to GPT.
- Phase3 Web UI design has started. The first candidate is GitHub Pages + GitHub API + GitHub Actions.
- STEP1 remains executed by GitHub Actions; GitHub Pages only provides the staff-facing UI.
- PC always-on operation is not required in the target design.
- GitHub Pages token handling and temporary Amazon CSV upload are the main verification points.
- Phase4 GitHub Pages UI has been implemented under `docs/`.
- Phase4 stores PAT in LocalStorage and uploads CSV through GitHub Contents API.
- Phase4 UI flow is Amazon CSV confirmation -> category_rules.csv confirmation -> STEP1 execution.
- Phase4 accepts that uploaded CSV files are committed to Git history; later phases should improve this.
- Phase7 updates the UI into a business application layout for the future Amazon->Shopee OS.
- The UI now uses a fixed left business flow, a focused right work area, and a bottom status console.
- Standard UI flow is Amazon CSV upload -> category_rules.csv editing -> master save -> STEP1 execution -> Review -> Rule improvement and rerun.
- This Phase7 shell should be reused when STEP2, STEP3, STEP4, and AI review are added.

## Important Files

- `scripts/step1.py`: STEP1 processing script.
- `input/category_rules.csv`: category Allow/Deny rule master.
- `input/ng_master.csv`: long-term NG master.
- `input/shopee_existing_asin.csv`: Shopee existing ASIN / DUPLICATE master. It is retained long term and treated close to an NG master.
- `.github/workflows/run_step1.yml`: manual GitHub Actions workflow.

## Notes For Next Work

- Git repository has been re-initialized locally because the previous `.git` existed but was not a valid repository.
- Review existing GitHub remote before any future push.
- Do not change the format of `category_rules.csv`.
- Do not delete `ng_master.csv`.
- Do not delete `shopee_existing_asin.csv`.
- Before Run STEP1, confirm the Amazon CSV is under `input/working/`, is not broken, has category in the filename, and uses `category@min-max_日付.csv` only when a price condition is needed.
- In GitHub Actions results, check `01_SAFE_CSV`, `02_CHECK_CSV`, and `03_OUT_DENY_CSV` first. Use `99_ALL_RESULTS` for full retention.
- If an Amazon CSV was accidentally committed, run `git rm --cached <path>` and commit the removal. Full history purge is not required in Phase1.
- Before implementing Phase3, verify GitHub API operations, temporary CSV input, workflow dispatch, artifact download, and token handling.
- To enable the UI, configure GitHub Pages to deploy from branch `main` and folder `/docs`.
- In UI testing, upload Amazon CSV first, confirm filename/category/price, fetch and save `category_rules.csv`, then run STEP1.
- In Phase7 UI testing, confirm each left-side flow item opens only its matching work area and that the bottom status console receives API/run/error messages.
