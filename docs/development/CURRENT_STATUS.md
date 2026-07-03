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

## Operations Policy

- `category_rules.csv` is the category Allow/Deny decision body.
- `ng_master.csv` is a long-term retained master.
- `shopee_existing_asin.csv` is the DUPLICATE master. It is treated close to an NG master, retained long term, and is not an auto-delete or monthly cleanup target.
- `ng_master.csv` and `shopee_existing_asin.csv` are updated only when needed. They are not mandatory daily updates.
- `category_rules.csv` is expected to be updated daily and organized monthly.
- Old organized copies of `category_rules.csv` are not required.
- If past rules become necessary, add them again to the current master.
- Review CSV and Shopee import CSV are not split. SAFE/CHECK/OUT_DENY keep source and judgment columns for review.
- STEP1 is not just a CSV export system. It is a review system for checking SAFE / CHECK / OUT_DENY and improving Allow/Deny, NG, and Duplicate masters.

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

## Judgment And Review Order

- Judgment order: NG -> DUPLICATE -> DENY -> ALLOW -> SAFE -> PRICE.
- Review priority: SAFE -> CHECK -> OUT_DENY -> OUT_NG -> OUT_DUPLICATE -> OUT_PRICE.

## Review Purpose

- SAFE: confirm there is no category mixing and no product that should be excluded.
- CHECK: find products that can be moved to SAFE and identify Allow candidates.
- OUT_DENY: confirm truly SAFE products are not dropped by Deny and check excessive Deny.
- OUT_NG / OUT_DUPLICATE / OUT_PRICE: not priority checks; review only when needed.

## Cleanup Completed

- Removed `conpare_ng_master.py`, `make_csv.py`, `new_words.txt`, `ng_master_new.csv`, `ng_master_old.csv`, and `memo.txt` after confirming STEP1 does not reference them.
