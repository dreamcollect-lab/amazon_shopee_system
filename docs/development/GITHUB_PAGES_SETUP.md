# GitHub Pages 設定手順

## 目的

Phase4では、事務担当者がGitHubを直接操作せずにSTEP1を実行・確認できる最低限のGitHub Pages Web UIを用意する。

## 配置ファイル

- `docs/index.html`
- `docs/style.css`
- `docs/app.js`

## GitHub Pages設定

1. GitHub repository `dreamcollect-lab/amazon_shopee_system` を開く。
2. `Settings` を開く。
3. `Pages` を開く。
4. Sourceを `Deploy from a branch` にする。
5. Branchを `main` にする。
6. Folderを `/docs` にする。
7. 保存する。
8. 表示されたGitHub Pages URLを開く。

## PATについて

Phase4では操作性優先のため、PATをLocalStorageに保存する。

必要な権限候補:

- Contents read/write: `input/working/*.csv` のアップロード、マスターCSV取得・更新
- Actions read/write: workflow_dispatch、workflow run取得
- Actions artifacts read: Artifacts取得

Fine-grained tokenを使う場合は、対象repositoryを `dreamcollect-lab/amazon_shopee_system` に限定する。

## Phase4の割り切り

- Backendなし。
- GitHub Appなし。
- PATはLocalStorage保存。
- OpenAI API接続なし。
- AIレビューは担当者がCSVをGPTへ渡す運用のまま。
- CSVはGitHub Contents APIで `input/working/` にアップロードするため、Phase4ではGit履歴に残る。
- CSVをGit履歴に残さない方式は後続Phaseで改善する。

## Phase7 UIレイアウト

Phase7では、GitHub Pages UIを「Amazon→Shopee OS」の共通業務アプリケーション画面として整理する。

- 左側: 業務フローを固定表示する。
- 右側: 現在選択中の作業だけを表示する。
- 下部: ステータス、実行結果、エラー、GitHub API結果、Workflow状態を集約する。

業務フロー:

1. Amazon CSVアップロード
2. category_rules.csv編集
3. マスター保存
4. STEP1実行
5. Review
6. Rule改善・再実行

このレイアウトは、今後STEP2、STEP3、STEP4、AIレビューを追加するときの標準UIとして扱う。

## 基本操作

1. PATを入力して保存する。
2. Amazon CSVを選択する。
3. `input/workingへアップロード` を押す。
4. アップロードしたCSVのファイル名・category候補・価格条件を確認する。
5. `category_rules.csv` を取得する。
6. 対象カテゴリのAllow/Denyルールを確認・必要時追加する。
7. `ng_master.csv` / `shopee_existing_asin.csv` を必要に応じて確認する。
8. マスターCSVを保存する。
9. `Run STEP1` を押す。
10. 最新Runを確認する。
11. Artifactsを取得する。
12. `01_SAFE_CSV`, `02_CHECK_CSV`, `03_OUT_DENY_CSV` を優先確認する。
13. 結果を見てcategory_rules.csvを育て、必要なら再実行する。

## STEP1実行前の注意

STEP1は、Amazon CSVを入れて即実行するものではない。

まずAmazon CSVをアップロードし、その内容・category候補・価格条件を確認する。その後、`category_rules.csv` を取得し、対象カテゴリのAllow/Denyルールを確認・追加してから実行する。Web UIでは、Amazon CSV未アップロード、または `category_rules.csv` が未取得・未保存の場合、Run STEP1前に警告を出す。
