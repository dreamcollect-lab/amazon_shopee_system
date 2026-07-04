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

## 基本操作

1. PATを入力して保存する。
2. Amazon CSVを選択する。
3. `input/workingへアップロード` を押す。
4. 必要ならマスターCSVを取得・編集・更新する。
5. `Run STEP1` を押す。
6. 最新Runを確認する。
7. Artifactsを取得する。
8. `01_SAFE_CSV`, `02_CHECK_CSV`, `03_OUT_DENY_CSV` を優先確認する。
