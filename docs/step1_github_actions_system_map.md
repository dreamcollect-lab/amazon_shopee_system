# STEP1 GitHub Actions対応 システムマップ

## 1. フォルダ構成

- `.github/workflows/`: GitHub Actions workflowを置くフォルダです。
- `docs/`: システムマップとDDOSを置くフォルダです。
- `docs/development/`: 引き継ぎ、現在状態、判断ログ、構成ログを置くDDOSフォルダです。
- `input/`: STEP1の判定マスタCSVを置くフォルダです。
- `input/working/`: Amazon CSV投入先です。空フォルダ維持のため `.gitkeep` を残します。
- `scripts/`: STEP1本体とバックアップを置くフォルダです。

実行時生成フォルダはGit管理しません。

- `output/`: STEP1結果CSV出力先です。GitHub ActionsではArtifactsに保存します。
- `logs/`: 実行ログ出力先です。GitHub ActionsではArtifactsに保存します。
- `processed/`: 旧ローカル運用用です。通常は使わず、`STEP1_MOVE_TO_PROCESSED=1` の場合のみ使います。
- `venv/`, `.venv/`: ローカル仮想環境です。Git管理しません。

## 2. 各CSVの役割

- `input/category_rules.csv`: category判定の正本です。Allow/Deny本体として使います。
- `input/ng_master.csv`: NG判定の正本です。更新頻度が低いため長期保存します。
- `input/shopee_existing_asin.csv`: Shopee既存ASIN判定の正本です。
- `input/working/*.csv`: 処理対象のAmazon CSVです。ファイル名からcategoryと価格条件を取得します。

`category_rules.csv` の列は現状維持です。

```text
category,rule_type,value,match_mode,memo
```

更新日、更新者、理由の列は追加しません。履歴管理はGitHub側で行います。`category_rules.csv` は毎日更新し、約1か月に1回整理します。整理前ファイルの保管は不要で、現在の `category_rules.csv` だけを正本とします。

## 3. STEP1の流れ

1. `input/working/` のAmazon CSVだけを処理対象にします。
2. ファイル名からcategoryと価格条件を取得します。
3. Amazon CSVからASIN、title、brand、price、URL、画像URL、NG判定用テキストを抽出します。
4. NGマスタでOUT_NGを判定します。
5. Shopee既存ASINでOUT_DUPLICATEを判定します。
6. `category_rules.csv` のDeny/AllowでOUT_DENY、SAFE、CHECKを判定します。
7. SAFEになった商品だけ価格条件を判定し、条件外はOUT_PRICEにします。
8. 元Amazon CSVは通常移動しません。`STEP1_MOVE_TO_PROCESSED=1` の場合のみ `processed/` へ移動します。
9. `summary.txt` とレビュー用CSVを出力します。

レビュー専用CSVとShopee投入CSVは分けません。SAFE混在確認、CHECK確認、DENY誤除外確認を優先するため、SAFE CSVも元情報と判定情報を保持します。

必須列:

```text
source_file
source_row
category
status
asin
title
brand
price_yen
hit_type
hit_value
out_reason
amazon_url
image_url
raw_text_for_ng
all_asins
```

## 4. 出力CSV

確認優先順位は以下です。

1. `output/safe/safe_{category}_{timestamp}.csv`
2. `output/check/check_{category}_{timestamp}.csv`
3. `output/out_deny/out_deny_{category}_{timestamp}.csv`
4. `output/out_ng/out_ng_{category}_{timestamp}.csv`
5. `output/out_duplicate/out_duplicate_{category}_{timestamp}.csv`
6. `output/out_price/out_price_{category}_{timestamp}.csv`

補助出力:

- `output/standard/standard_{category}_{timestamp}.csv`: Amazon CSVから抽出・標準化した基礎情報です。
- `output/review_source/review_source_{category}_{timestamp}.csv`: 判定後の全レビュー対象情報です。
- `logs/step1_log.txt`: 実行ログです。
- `summary.txt`: 確認順序、件数、出力ファイル一覧、処理時間をまとめます。

OUT_NG、OUT_DUPLICATE、OUT_PRICEは通常ほぼ確認しないため、主に保管用途です。

## 5. GitHub Actions構成図

```text
workflow_dispatch
  |
  v
actions/checkout@v4
  |
  v
actions/setup-python@v5
  |  Python 3.12
  v
pip install -r requirements.txt
  |
  v
python scripts/step1.py
  |
  +--> output/
  +--> logs/
  +--> summary.txt
  |
  v
summary.txt -> GitHub Step Summary
  |
  v
upload-artifact@v4
  |
  v
Artifacts: output/, logs/, summary.txt
retention-days: 14
```

## 6. 実行手順

### ローカル実行

1. Amazon CSVを `input/working/` に置きます。
2. 必要に応じて仮想環境を作成します。
3. `pip install -r requirements.txt` を実行します。
4. `python scripts/step1.py` を実行します。
5. `summary.txt` を開きます。
6. SAFE、CHECK、OUT_DENYの順にCSVを確認します。

旧ローカル運用として処理後にAmazon CSVを `processed/` に移動したい場合だけ、`STEP1_MOVE_TO_PROCESSED=1` を設定します。

### GitHub Actions実行

1. GitHub remote設定と初回pushを後続作業で実施します。
2. Amazon CSVを `input/working/` に配置してコミットします。
3. GitHubのActionsタブで `Run STEP1` を選びます。
4. `Run workflow` から手動実行します。
5. Step Summaryで `summary.txt` を確認します。
6. Artifactsの `step1-results` をダウンロードし、SAFE、CHECK、OUT_DENYの順に確認します。

## 7. 変更ファイル一覧

### 変更したファイル

- `.gitignore`: GitHub管理対象外を整理しました。
- `docs/development/CURRENT_STATUS.md`: 現在状態とSTEP1専用化を反映しました。
- `docs/development/CURRENT_TASK.md`: 現在タスクと完了内容を更新しました。
- `docs/development/DECISION_LOG.md`: 判断事項を更新しました。
- `docs/development/ARCHITECTURE_LOG.md`: STEP1構成とArtifacts方針を更新しました。
- `docs/step1_github_actions_system_map.md`: システムマップを現状に合わせて更新しました。

### 新規作成済みファイル

- `.github/workflows/run_step1.yml`: 手動実行用GitHub Actions workflowです。
- `requirements.txt`: GitHub Actions用の最小依存です。
- `input/working/.gitkeep`: Amazon CSV投入先フォルダ維持用です。
- `scripts/step1_backup_before_github_actions.py`: GitHub Actions対応前のSTEP1バックアップです。

### 削除したファイル

- `conpare_ng_master.py`: STEP1本体から参照されていないNGマスタ比較補助のため削除しました。
- `make_csv.py`: STEP1本体から参照されていないNGマスタ生成補助のため削除しました。
- `new_words.txt`: STEP1本体から参照されていない中間データのため削除しました。
- `ng_master_new.csv`: STEP1本体から参照されていない中間ファイルのため削除しました。
- `ng_master_old.csv`: STEP1本体から参照されていない比較用旧ファイルのため削除しました。
- `memo.txt`: 旧ローカル運用メモで、必要内容をDDOSとシステムマップへ反映済みのため削除しました。

### 削除済みフォルダ

- `venv/`
- `output/`
- `logs/`
- `processed/`
- `ng_master_diff_output/`
- `input/shopee_existing_excel/`
- `scripts/__pycache__/`

## 8. Git状態

- ブランチ名は `main` です。
- GitHub remote接続は未実施です。
- GitHub pushは未実施です。
- 今後の開発正本はこのGitHub開発版です。
