# Current Status

- Local GitHub development folder exists at `C:\Users\uedar\amazon_shopee_system_github`.
- This GitHub development version is the development source of truth going forward.
- Production folder is out of scope and has not been touched.
- Invalid `.git` residue was found earlier and local Git has been re-initialized.
- Current `.git` is valid and `git status` works.
- GitHub remote has not been configured.
- Initial push has not been performed.
- Current branch is `main`.
- STEP1 GitHub Actions support files are present.
- `input/working/.gitkeep` exists to preserve the Amazon CSV input folder.

## Operations Policy

- `category_rules.csv` is the category Allow/Deny decision body.
- `ng_master.csv` is a long-term retained master.
- `category_rules.csv` is expected to be updated daily and organized monthly.
- Old organized copies of `category_rules.csv` are not required.
- If past rules become necessary, add them again to the current master.
- Review CSV and Shopee import CSV are not split. SAFE/CHECK/OUT_DENY keep source and judgment columns for review.

## Cleanup Completed

- Removed `conpare_ng_master.py`, `make_csv.py`, `new_words.txt`, `ng_master_new.csv`, `ng_master_old.csv`, and `memo.txt` after confirming STEP1 does not reference them.
