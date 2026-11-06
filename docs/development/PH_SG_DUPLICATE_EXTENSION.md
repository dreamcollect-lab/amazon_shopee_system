# PH・SG 出品済みASIN統合（開発ブランチ）

## 目的
PHまたはSGのどちらかに出品済みのASINを、STEP1のOUT_DUPLICATEへ送る。

## マスター
- PH: `input/shopee_existing_asin.csv`（既存ファイルを維持）
- SG: `input/shopee_sg_existing_asin.csv`（先頭列名 `asin`、全件CSV）
- STEP1実行時、Actionsランナー上でPH・SGを統合して既存の `shopee_existing_asin.csv` に一時的に書き出す。リポジトリのPHマスター自体は変更しない。

## SG更新
- Web UIの「SG出品済みASIN更新」から、`asin` 列のみの全件CSVを選択する。
- 件数を確認して更新する。空・不正ASINは拒否、既存件数から20%超減少する更新は停止。
- GitHubのCSV更新はコミット履歴に残る。
- 差分Excelを全件CSVとして登録しない。商品IDや商品名からASINを推測しない。
- 更新時にSTEP1が走っていないことを確認する。複数管理者の同時保存はGitHub Contents APIのSHA競合で拒否する。

## 注意
- ShopeeのExcelをそのままWeb UIへアップロードする機能は未実装。現時点ではASIN抽出済みCSVが必要。
- SGマスター未登録ならSTEP1を停止する（PHだけで成功扱いにしない）。
- このブランチはmainに未反映。実際のGitHub API更新・STEP1通し実行は未検証。
- 既存のPHデータが全出品商品を含むか、SGのExcelが全件スナップショットかは別途確認が必要。
