# SG 類似商品重複リスク CHECK

## 対象
- フィリピンの類似判定は変更しない（ASIN完全一致のみ）。
- シンガポールの出品済み商品名CSV（asin,product_id,title）を使い、同一ブランド・シリーズ・商品種別の万年筆等をCHECKへ送る。
- ASIN完全一致は従来どおりOUT_DUPLICATE。
- 色違い、ペン先違い、仕様違いはShopee違反の確定ではなくリスクとしてCHECK。
- 現行対象：Platinum Curidas/Procyon/Plaisir、Kaweco Piston Sport/Classic Sport/Skyline Sport のペン種別。PC等の一般製品は現段階で自動類似判定しない。
- 同一Amazon CSV内の候補についても、同一ファミリーの複数SAFE候補が出ないようにCHECKへ保留。
- CHECKの hit_type=sg_variant_risk または batch_variant_risk。out_reasonに比較対象のASIN・商品名・商品ID（SG既存時）を記録。

## データ
- SG商品名マスターは2026-11-11 08:58出力のExcelから3,991行を抽出したもの。
- その後09:22〜09:24に削除された商品が存在するため、このマスターは最新のライブ出品状況ではなく、当時のスナップショット。削除済みの商品も比較対象に含む可能性がある。
- PH・SGのASINマスターは別管理。SG商品名マスターは類似判定専用。
- 更新画面は左メニューの「SG出品済み商品更新」。Shopee Excelから asin,product_id,title CSVへ変換して全件更新する。
- SG商品名マスターが欠損・不正の場合はSTEP1を停止（fail closed）。
- CSV更新後は新しいSTEP1実行から反映。

## 検証
- 5件の削除された万年筆の例を回帰テストに登録。
- PC等の無関係な商品を誤ってCHECKへ送らないことを検証。
- 本番の実際のSTEP1実行とブラウザUIの動作確認は別途必要。
