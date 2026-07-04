# STEP1 GitHub Actions対応 システムマップ

## 0. Phase1 正式仕様

このGitHub開発版は、Amazon→Shopee 自動選別システムの今後の共同開発・共同運用の正本です。GitHubは永久保管庫ではなく、現在運用するシステムを管理する場所とします。

現行本番フォルダは変更しません。変更対象は `C:\Users\uedar\amazon_shopee_system_github` のみです。

STEP1は単なるCSV出力システムではありません。Amazon商品を自動判定し、SAFE / CHECK / OUT_DENY などの結果CSVを確認しながら、`category_rules.csv`、`ng_master.csv`、`shopee_existing_asin.csv` を育てるためのレビューシステムです。最終的にSAFE商品をShopee投入候補にしますが、主目的はレビューしてルールとマスターを育てることです。

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
- `input/shopee_existing_asin.csv`: Shopee既存ASINのDUPLICATE判定マスターです。NGマスターに近い扱いで、更新頻度は低く、長期保存対象です。自動削除や月次整理削除の対象ではありません。
- `input/working/*.csv`: 処理対象のAmazon CSVです。ファイル名からcategoryと価格条件を取得します。

`category_rules.csv` の列は現状維持です。

```text
category,rule_type,value,match_mode,memo
```

更新日、更新者、理由の列は追加しません。履歴管理はGitHub側で行います。`category_rules.csv` は毎日更新し、約1か月に1回整理します。整理前ファイルの保管は不要で、現在の `category_rules.csv` だけを正本とします。

`ng_master.csv` と `shopee_existing_asin.csv` は更新頻度が低く、毎回更新必須ではありません。必要時のみ更新し、長期保存するGitHub正本として扱います。

## 3. STEP1の流れ

1. `input/working/` のAmazon CSVだけを処理対象にします。
2. ファイル名からcategoryと価格条件を取得します。
3. Amazon CSVからASIN、title、brand、price、URL、画像URL、NG判定用テキストを抽出します。
4. NGマスタでOUT_NGを判定します。
5. Shopee既存ASINでOUT_DUPLICATEを判定します。
6. `category_rules.csv` のDenyでOUT_DENYを判定します。
7. `category_rules.csv` のAllowでSAFEまたはCHECKを判定します。
8. SAFEになった商品だけ価格条件を判定し、条件外はOUT_PRICEにします。
9. 元Amazon CSVは通常移動しません。`STEP1_MOVE_TO_PROCESSED=1` の場合のみ `processed/` へ移動します。
10. `summary.txt` とレビュー用CSVを出力します。

判定順序は以下を正本とします。

```text
NG → DUPLICATE → DENY → ALLOW → SAFE → PRICE
```

判定順序の理由:

- NG: 絶対除外対象のため最初に判定します。
- DUPLICATE: Shopee出品済みASINであり、カテゴリ判定前に機械的に除外します。
- DENY / ALLOW: category_rules.csv によるカテゴリールール判定です。
- PRICE: SAFEになった後の商品だけに実行します。

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

確認理由:

- SAFE: 異カテゴリ混在がないか、SAFEに入れてはいけない商品が混ざっていないか確認します。
- CHECK: SAFEへ追加できる商品が残っていないか、Allow追加候補がないか確認します。
- OUT_DENY: 本来SAFEの商品がDenyで落ちていないか、Deny過剰がないか確認します。
- OUT_NG: 通常確認不要です。必要時のみ確認します。
- OUT_DUPLICATE: 通常確認不要です。Shopee既存ASIN確認が必要な場合のみ確認します。
- OUT_PRICE: 通常確認不要です。価格条件確認が必要な場合のみ確認します。

補助出力:

- `output/standard/standard_{category}_{timestamp}.csv`: Amazon CSVから抽出・標準化した基礎情報です。
- `output/review_source/review_source_{category}_{timestamp}.csv`: 判定後の全レビュー対象情報です。
- `logs/step1_log.txt`: 実行ログです。
- `summary.txt`: 確認順序、件数、出力ファイル一覧、処理時間をまとめます。

OUT_NG、OUT_DUPLICATE、OUT_PRICEは通常ほぼ確認しないため、主に保管用途です。

判定順序と確認順序は別です。日常確認ではSAFE混在確認、CHECK内のSAFE候補確認、OUT_DENY誤除外確認を優先します。

SAFE / CHECK / OUT_DENY はAIレビューまたは担当者レビューをしやすいCSVとして扱います。元情報と判定情報を残し、レビュー結果を `category_rules.csv`、`ng_master.csv`、`shopee_existing_asin.csv` の改善へ戻します。

現時点ではOpenAI API等のAI接続は実装しません。AIレビューは将来Phaseで対応します。当面は事務担当者がSAFE / CHECK / OUT_DENY CSVをGPTへ渡して確認する運用です。

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
Artifacts:
  01_SAFE_CSV
  02_CHECK_CSV
  03_OUT_DENY_CSV
  04_OUT_NG_CSV
  05_OUT_DUPLICATE_CSV
  06_OUT_PRICE_CSV
  99_ALL_RESULTS
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

1. GitHub remote設定は既存設定を確認し、必要がある場合のみ後続作業で調整します。今回のPhase1仕様反映ではremote変更とpushは行いません。
2. Amazon CSVを `input/working/` に配置します。
3. Amazon CSV自体が壊れていないか確認します。
4. `category_rules.csv` のAllow/Denyを必要に応じて更新します。
5. `ng_master.csv` を必要時のみ更新します。
6. `shopee_existing_asin.csv` を必要時のみ更新します。毎回更新必須ではありません。
7. 変更をコミットします。
8. GitHubのActionsタブで `Run STEP1` を選びます。
9. `Run workflow` から手動実行します。
10. Step Summaryで `summary.txt` を確認します。
11. Artifactsの `01_SAFE_CSV`、`02_CHECK_CSV`、`03_OUT_DENY_CSV` を優先して確認します。
12. SAFE、CHECK、OUT_DENYの順に確認します。
13. 必要なら `category_rules.csv` / `ng_master.csv` / `shopee_existing_asin.csv` を再修正します。
14. 再度 `Run STEP1` を実行します。

## 7. GitHub運用フロー図

```text
GitHub
  |
  v
Amazon CSV を input/working/ へ投入
  |
  v
Amazon CSV自体を確認
  |
  v
category_rules.csv を必要に応じて更新
  |
  v
ng_master.csv を必要に応じて更新
  |
  v
shopee_existing_asin.csv を必要に応じて更新
  |
  v
Run STEP1
  |
  v
SAFE確認
  |
  v
CHECK確認
  |
  v
OUT_DENY確認
  |
  v
AIレビューまたは人レビュー
  |
  v
必要なら category_rules.csv / ng_master.csv / shopee_existing_asin.csv を再修正
  |
  v
再Run STEP1
  |
  v
問題なければ完了
```

## 8. 変更ファイル一覧

### 変更したファイル

- `.gitignore`: GitHub管理対象外を整理しました。
- `docs/development/CURRENT_STATUS.md`: 現在状態とSTEP1専用化を反映しました。
- `docs/development/CURRENT_TASK.md`: 現在タスクと完了内容を更新しました。
- `docs/development/DECISION_LOG.md`: 判断事項を更新しました。
- `docs/development/ARCHITECTURE_LOG.md`: STEP1構成とArtifacts方針を更新しました。
- `docs/development/HANDOVER.md`: Phase1正式仕様とGitHub運用方針を更新しました。
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

## 9. GitHub Actions構成

- `workflow_dispatch`: 手動実行です。
- Python: 3.12です。
- Dependencies: `requirements.txt` をインストールします。
- Execution: `python scripts/step1.py` を実行します。
- Summary: `summary.txt` をStep Summaryに表示します。確認優先ファイルはSAFE / CHECK / OUT_DENYのみを目立つ位置に出し、出力ファイル一覧はHTMLの `details` / `summary` で折りたたみます。
- Artifacts: 結果確認しやすいように個別Artifactsへ分けます。
- retention-days: 14です。厳密削除要件ではなく、容量肥大化防止の保守的な設定です。

Artifactsの位置づけ:

- `01_SAFE_CSV`: SAFE確認用です。
- `02_CHECK_CSV`: CHECK確認用です。
- `03_OUT_DENY_CSV`: OUT_DENY確認用です。
- `04_OUT_NG_CSV`: 保管・必要時確認用です。
- `05_OUT_DUPLICATE_CSV`: 保管・必要時確認用です。
- `06_OUT_PRICE_CSV`: 保管・必要時確認用です。
- `99_ALL_RESULTS`: `output/`, `logs/`, `summary.txt` をまとめて保存します。

処理時間の考え方:

- GitHub Actions全体時間: runner起動、checkout、Python準備、依存インストール、STEP1実行、summary表示、Artifact保存を含みます。
- STEP1処理時間: `scripts/step1.py` 内部の実処理時間です。`summary.txt` の処理時間はこちらです。

## 10. Run STEP1前確認事項

- Amazon CSVが `input/working/` に入っている。
- Amazon CSV自体が壊れていない。
- Amazon CSVファイル名にcategory名が入っている。
- 価格条件が必要な場合、`category@min-max_日付.csv` 形式になっている。
- `category_rules.csv` の列が `category,rule_type,value,match_mode,memo` のまま。
- `ng_master.csv` は必要時のみ更新済み。
- `shopee_existing_asin.csv` は必要時のみ更新済み。

## 11. Git状態

- ブランチ名は `main` です。
- GitHub remoteは既存設定があります。今回の作業ではremote追加・変更は行っていません。
- GitHub pushは今回の作業では未実施です。
- 今後の開発正本はこのGitHub開発版です。
