# PH・SG 出品済みASIN統合

## 通常業務
- STEP1業務フローは従来どおり。Allow/DenyとNGマスターはRule編集で管理する。
- STEP1はPH・SGのASINマスターを直接読み込み、どちらかに存在するASINをOUT_DUPLICATEへ送る。
- 統合CSVの生成や別途呼び出し操作は不要。

## 出品済み商品マスター更新
- 左メニュー「マスター管理・更新」にPHとSGの独立した更新画面を設置。
- PH: input/shopee_existing_asin.csv（既存データを保全）
- SG: input/shopee_sg_existing_asin.csv（今回提供のSG Excelから抽出したASINを初期登録）
- 各国の全件ASIN CSV（先頭列 asin）を選択し、件数を確認して置換。差分CSVは不可。
- 不正ASIN、空ファイル、20%を超える件数減少は更新を拒否。STEP1実行中は更新不可。
- GitHub Contents APIのSHAを使い、競合更新を検出する。履歴はGitに残る。

## 未対応・注意
- Shopeeのxlsxを直接Web UIにアップロードする機能は未実装。ASIN抽出済みCSVを使用する。
- SGの元Excelが出品済み全件を含むこと、PHのマスターが最新であることは利用者側の確認が必要。
- SG初期マスターには3,594件のユニークASINが登録されている。
- どちらかのマスターが欠損・空・不正ならSTEP1を停止し、誤ってSAFEへ通さない。
- WindowsローカルフォルダにはGitHubでの変更が自動同期されない。正本はGitHub mainとする。
