クラシックテーマとFSE変換テーマのビジュアル差分を検証してください。

クラシックテーマ: $ARGUMENTS
FSEテーマ: ./converted-theme

## 実行手順

### Step 1: 環境準備
- wp-env でクラシックテーマ（port 8881）とFSEテーマ（port 8882）を並列起動
- 両環境に同一テストデータを投入（WordPress Theme Unit Test Data + 追加コンテンツ）
- メニュー・ウィジェット等の設定を同期

### Step 2: キャプチャ
`scripts/capture.ts` を実行し、以下を取得:
- 全ページ種別 × 全ビューポートのフルページスクリーンショット
- 各ページの主要要素の Computed Style（font-size, margin, padding, color 等）
- 要素の BoundingRect（位置・サイズ）

### Step 3: 差分解析
`scripts/diff.ts` を実行し、以下を生成:
- ピクセル差分ヒートマップ画像
- Computed Style 差分テーブル（severity分類付き）
- diff-report.json

### Step 4: 差分レポート提示
検出された差異をユーザーに提示:
- Critical（レイアウト崩れ、大きなフォントサイズ差異）
- Warning（色の違い、中程度のスペーシング差異）
- Info（微細な差異、無視可能）

### Step 5: 自動修正ループ（ユーザー確認後）
Critical / Warning の差異について:
1. theme.json の typography/spacing/color を修正
2. 必要に応じて style.css に個別ルール追加
3. 再キャプチャ → 再比較
4. 差異がすべて許容閾値以下になるか、5回ループしたら終了

### Step 6: 最終レポート
VISUAL_DIFF_REPORT.md を生成:
- Before/After の差分率推移
- 残存する差異の一覧と対応推奨
- 各ページのスクリーンショットパス一覧
