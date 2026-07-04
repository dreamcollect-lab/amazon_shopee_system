# Phase3 Web UI 基本設計書

## 1. 目的

Amazon→Shopee 自動選別システムを、事務担当者がGitHubを直接触らずに使えるWeb UIへ移行する。

前提:

- PC常時起動を不要にする。
- GitHubをコード、マスターCSV、Workflow、DDOSの正本とする。
- STEP1実行基盤はGitHub Actionsとする。
- Web UIは事務担当者向けの操作画面とする。
- OpenAI API等のAI接続は現時点では行わない。
- 追加料金、新規契約はできるだけ避ける。
- Phase3-1では設計のみ行い、実装しない。

## 2. 推奨構成

第一候補は GitHub Pages + GitHub API + GitHub Actions とする。

```text
Web UI（GitHub Pages）
  |
  v
GitHub API
  |
  +--> マスターCSV取得・更新
  |
  +--> STEP1用一時入力の受け渡し
  |
  +--> workflow_dispatch
        |
        v
GitHub Actions
        |
        v
scripts/step1.py
        |
        v
Artifacts
        |
        v
Web UIで結果確認・CSVダウンロード
```

GitHub Pages単体ではPythonは動かないため、STEP1はGitHub Actionsに実行させる。Web UIはGitHub APIを呼び出すフロントエンドとして扱う。

## 3. 重要な設計判断

### GitHub Pages案

メリット:

- PC常時起動が不要。
- GitHubの正本、履歴、Actionsと近い。
- 追加サーバー契約なしで開始しやすい。
- 静的UIであれば構成が単純。

課題:

- GitHub Pagesは静的ホスティングであり、サーバー側でトークンを安全に保持できない。
- GitHub APIを呼ぶにはPersonal Access Token等が必要になる。
- ブラウザにトークンを持たせる設計は漏洩リスクがある。
- private repositoryや社内限定運用ではPages公開範囲と認証設計の確認が必要。

結論:

- Phase3の第一候補として検証する。
- ただし、本格運用では「トークンをブラウザに持たせるリスク」が最大の技術リスク。
- 最初の検証では、管理者1名の限定利用、短期限・最小権限トークン、社内限定運用を前提にする。

### Streamlit Community Cloud案

メリット:

- PythonでUIを作れる。
- GitHub連携しやすい。
- secrets管理を使えるため、GitHub Pagesよりトークンを隠しやすい。
- CSV表示や簡易編集が作りやすい。

課題:

- 外部サービスに依存する。
- 無料枠やprivate app制限がある。
- 事務担当者向けの認証・共有範囲を確認する必要がある。
- GitHub Pages案よりシステム境界が増える。

結論:

- GitHub Pagesでトークン管理が厳しい場合の有力な代替案。
- 追加契約なしで試せる可能性はあるが、無料版制限をPhase3-2で確認する。

### 有料Webホスティング案

メリット:

- サーバー側でGitHub Tokenを安全に保持できる。
- 認証、アップロード、一時ファイル、API仲介を作りやすい。
- 顧客提供や複数担当者運用に拡張しやすい。

課題:

- 新規契約、運用、費用、セキュリティ管理が発生する。
- Phase3初期の目的には重い。

結論:

- Phase3初期では採用しない。
- GitHub Pages / Streamlitで安全性や運用性が不足した場合の将来候補。

## 4. 事務担当者の操作フロー

```text
Web UIを開く
  |
  v
Amazon CSVをドラッグ&ドロップ
  |
  v
category名・価格条件を確認
  |
  v
Amazon CSV自体を確認
  |
  v
category_rules.csvを確認・必要時更新
  |
  v
ng_master.csvを確認・必要時更新
  |
  v
shopee_existing_asin.csvを確認・必要時更新
  |
  v
STEP1実行
  |
  v
実行状況確認
  |
  v
SAFE / CHECK / OUT_DENY確認
  |
  v
CSVダウンロード
  |
  v
必要ならAllow/Deny等を修正
  |
  v
再実行
```

## 5. 画面構成

### 5.1 CSVアップロード画面

- Amazon CSVをドラッグ&ドロップする。
- ファイル名からcategoryと価格条件を表示する。
- CSV破損、空ファイル、拡張子違いを検知する。
- Git履歴へ残さず、一時入力としてSTEP1へ渡す。

### 5.2 マスター確認画面

- `category_rules.csv` を表示する。
- `ng_master.csv` を表示する。
- `shopee_existing_asin.csv` を表示する。
- `ng_master.csv` と `shopee_existing_asin.csv` は必要時のみ更新する低頻度マスターとして扱う。

### 5.3 STEP1実行画面

- 実行前チェックリストを表示する。
- `Run STEP1` ボタンでGitHub Actionsを起動する。
- workflow_dispatchの実行結果を表示する。

### 5.4 実行状況確認画面

- workflow runの状態を表示する。
- queued / in_progress / completed を表示する。
- 成功 / 失敗を表示する。
- GitHub Actions全体時間とSTEP1内部処理時間は別物として表示する。

### 5.5 SAFE確認画面

- `01_SAFE_CSV` の内容を表示する。
- 異カテゴリ混在がないか、SAFEに入れてはいけない商品が混ざっていないか確認する。

### 5.6 CHECK確認画面

- `02_CHECK_CSV` の内容を表示する。
- SAFEへ追加できる商品が残っていないか、Allow追加候補を確認する。

### 5.7 OUT_DENY確認画面

- `03_OUT_DENY_CSV` の内容を表示する。
- 本来SAFEの商品がDenyで落ちていないか、Deny過剰を確認する。

### 5.8 CSVダウンロード画面

- `01_SAFE_CSV`
- `02_CHECK_CSV`
- `03_OUT_DENY_CSV`
- `04_OUT_NG_CSV`
- `05_OUT_DUPLICATE_CSV`
- `06_OUT_PRICE_CSV`
- `99_ALL_RESULTS`

をダウンロードできるようにする。

## 6. GitHub APIで必要な操作

### マスターCSV取得・更新

- `input/category_rules.csv` を取得・更新する。
- `input/ng_master.csv` を取得・更新する。
- `input/shopee_existing_asin.csv` を取得・更新する。
- GitHub Contents APIの create/update file を使う候補とする。
- 更新時はshaが必要になるため、取得→編集→更新を直列で行う。

### STEP1実行

- Actions workflow dispatch APIで `.github/workflows/run_step1.yml` を起動する。
- workflow run一覧・run状態取得APIで状態を確認する。
- run完了後、Artifacts APIでartifact一覧とdownload URLを取得する。

### Amazon CSVを一時入力として渡す方法

課題:

- `input/working/*.csv` はGit管理対象外であり、GitHub Webアップロード方式は使わない。
- GitHub APIのContents APIで `input/working/*.csv` を作ると、結局commit履歴に残る。
- GitHub Actionsの標準 `workflow_dispatch` だけでは、大きなCSVファイル本体を直接渡す用途には向かない。

候補:

1. workflow_dispatch inputに小さいCSV内容をbase64で渡す  
   小容量なら検証可能だが、大きなAmazon CSVには不向き。

2. GitHub Actions artifact/cache相当へ事前アップロード  
   REST APIだけで任意の一時ファイルをworkflow開始前にartifactとして置く設計は難しい。

3. GitHub Issue / Gist / Release assetを一時置き場にする  
   Git履歴は避けられるが、運用・権限・削除・秘匿性の検証が必要。

4. 外部一時ストレージを使う  
   技術的には自然だが、新規契約や追加料金の可能性がある。

5. Streamlit等のサーバー側UIを使い、サーバーが一時ファイルを受けてGitHub Actionsへ渡す  
   GitHub Pagesより現実的だが、外部サービス依存が増える。

Phase3-2〜3で最優先検証すること:

- GitHub Pages + GitHub APIだけで、Amazon CSVをGit履歴に残さずActionsへ渡せるか。
- 難しい場合、Streamlit Community Cloudを代替案として検証する。

## 7. 認証・権限

### GitHub Personal Access Token

GitHub API操作には認証が必要になる。Fine-grained personal access tokenを第一候補とする。

必要候補:

- repository contents read/write: マスターCSV取得・更新
- actions read/write: workflow_dispatch、workflow run確認
- artifacts read: artifact取得

最小権限に絞り、対象repositoryも限定する。

### 事務担当者アカウント

候補:

- 事務担当者ごとにGitHubアカウントを作る。
- 共有トークンを使う。
- 管理者だけがトークンを持つ。

推奨:

- Phase3検証では管理者限定で開始する。
- 複数担当者運用では、担当者ごとに権限を分ける設計を再検討する。

### GitHub Pagesでのトークンリスク

GitHub Pagesは静的サイトであり、サーバー側secretを安全に保持できない。ブラウザにPATを保存する方式は漏洩リスクが高い。

暫定方針:

- localStorage等への長期保存は避ける。
- 検証時は短期限・最小権限トークンを手入力し、メモリ保持を基本にする。
- 本格運用前に、GitHub Pagesだけで安全かを必ず再評価する。

## 8. 料金・契約

### GitHub Actions

- private repositoryでは利用時間・storageに応じた無料枠と課金条件がある。
- STEP1が数分程度で、日次〜数十回/月であれば、まずは無料枠で足りる可能性が高い。
- 実際の消費はGitHub billing画面で確認する。

### GitHub Pages

- GitHub Pages自体は追加契約なしで利用できる可能性が高い。
- private Pagesやアクセス制限はプラン・組織設定に依存する可能性があるため確認が必要。

### Streamlit Community Cloud

- 無料で開始できる。
- private appや共有範囲に制限がある。
- secrets管理を使えるため、トークン保持の面ではGitHub Pagesより安全に設計しやすい。

### 有料Webホスティング

- Phase3初期では採用しない。
- 顧客公開、複数担当者、強い認証、サーバー側token管理が必要になったら検討する。

## 9. セキュリティ

- Amazon CSVを公開しない。
- repositoryはprivate前提。
- GitHub Pages公開範囲に注意する。
- トークン漏洩リスクを最重要リスクとして扱う。
- 顧客提供は現時点では行わない。
- 最初は社内限定運用とする。
- OpenAI API等のAI接続は現時点では行わない。

## 10. Phase分け

- Phase3-1: Web UI基本設計
- Phase3-2: GitHub API検証
- Phase3-3: CSVアップロード検証
- Phase3-4: Actions実行検証
- Phase3-5: Artifacts取得検証
- Phase3-6: SAFE/CHECK/DENY表示
- Phase3-7: マスターCSV編集
- Phase3-8: 事務担当者向け運用テスト

## 11. 実装しないこと

- AI自動レビュー
- OpenAI API接続
- 顧客公開
- 有料サーバー契約
- 本番切替
- 現行本番フォルダ変更

## 12. 次に検証すること

1. GitHub Pages上のWeb UIからFine-grained PATでGitHub APIを呼べるか。
2. workflow_dispatchでSTEP1を起動できるか。
3. workflow run状態をWeb UIで追跡できるか。
4. Artifacts一覧とdownload URLを取得できるか。
5. Amazon CSVをGit履歴に残さずActionsへ渡す方法がGitHub APIだけで成立するか。
6. GitHub Pagesでトークンを安全に扱えるか。
7. GitHub Pagesが難しい場合、Streamlit Community Cloudで同じ操作ができるか。

## 13. 参照した公式情報

- GitHub REST API workflow dispatchは手動workflow実行をAPIから起動できる。
- GitHub REST API artifactsはworkflow artifactの取得・downloadに使える。
- GitHub Contents APIはrepositoryファイルの作成・更新に使えるが、commitが発生する。
- GitHub Actionsはprivate repositoryで利用量・保存量に応じた課金条件がある。
- Streamlit Community CloudはGitHub repositoryから無料でアプリをdeployできるが、private app等に制限がある。
