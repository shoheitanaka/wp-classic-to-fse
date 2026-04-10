ビジュアル差分レポートに基づいて、FSE テーマを自動修正し再検証するループを実行してください。

対象テーマ: ./converted-theme
差分レポート: ./visual-diff/diff-report.json

## 前提条件
- `npm run capture` と `npm run diff` が実行済みで `visual-diff/diff-report.json` が存在すること
- `capture-config.json` が設定済みであること

## 実行手順

### Step 1: 差分レポート読み取り
`visual-diff/diff-report.json` を読み取り、現在の状態を把握する:
- summary.majorDiffs（ピクセル差分率 > 2% のページ数）
- summary.criticalStyleIssues の件数
- summary.warningStyleIssues の件数
- fixSuggestions の一覧（priority 順にソート済み）

状態をユーザーに報告し、自動修正を開始してよいか確認する。

### Step 2: 修正実行

fixSuggestions を priority 順に処理する。修正ルール:

#### theme.json の修正

**typography（font-size, font-family, font-weight, line-height）:**
- selector が `h1`〜`h6` → `styles.elements.{tag}.typography.fontSize` を Classic 値に設定
- selector が `p`, `body` → `styles.typography.fontSize` または `styles.blocks.core/paragraph`
- selector が `.entry-title`, `.post-title` → `styles.blocks.core/post-title.typography`
- selector が `nav a`, `.nav-menu a` → `styles.blocks.core/navigation.typography`
- selector が `.widget-title` → `styles.blocks.core/heading.typography`（サイドバーパーツ内）

**spacing（margin, padding）:**
- `styles.spacing.padding/margin` でグローバル設定
- 特定ブロック → `styles.blocks.{block}.spacing.padding/margin`
- theme.json で対応不可のセレクタ → `style.css` にルール追加

**color:**
- Classic の色値が `settings.color.palette` に存在するか確認
- なければ palette に追加（slug は色名から自動生成）
- `styles.elements.{element}.color.text` または `.background` を設定

**layout:**
- `settings.layout.contentSize` / `wideSize` を Classic の main 幅に合わせる

#### style.css の修正
theme.json で表現できない差異は `converted-theme/style.css` の末尾にルールを追加する。
追加時は以下のコメントで囲む:
```css
/* === FSE Conversion Auto-Fix === */
.entry-content {
    margin-top: 40px;
}
/* === /FSE Conversion Auto-Fix === */
```

#### テンプレート/パーツの修正
要素欠落や display/position の差異は `templates/*.html` または `parts/*.html` を直接修正する。
- ブロックの追加/削除/並び替え
- ブロック属性の修正（className, align, style 等）

### Step 3: 修正ログ記録
修正内容を `visual-diff/fix-log.json` に追記する。

### Step 4: 再アップロード
```bash
cd converted-theme && zip -r ../converted-theme.zip . && cd ..
```
REST API でステージングにアップロード（上書き）。

### Step 5: 再キャプチャ・再比較
```bash
npm run capture
npm run diff
```

### Step 6: 結果判定
`visual-diff/diff-report.json` を再読み取りし:

**成功条件（すべて満たす）:**
- 全ページのピクセル差分率 < 2%
- critical スタイル問題 = 0件

→ 成功した場合: 最終 VISUAL_DIFF_REPORT.md を出力し、修正ログのサマリーを報告して終了。

**未達の場合:**
→ Step 2 に戻って修正ループを継続。ただし以下に注意:
- 前回のループで修正した項目が改善されていない場合、別のアプローチを試す
  - theme.json で効かなかった → style.css に !important 付きで追加
  - style.css で効かなかった → テンプレートのブロック構造を見直す
- 前回のループで新たに発生した差異（修正の副作用）を優先的に対処
- 同じ修正を繰り返さない（fix-log.json を参照して重複回避）

**ループ上限: 5回**
5回で未達の場合、残存する差異の一覧と推奨手動対応を VISUAL_DIFF_REPORT.md に記録して終了。

### Step 7: 最終レポート
ループ完了後（成功/上限到達いずれでも）:
1. `visual-diff/VISUAL_DIFF_REPORT.md` を最終版に更新
2. `visual-diff/fix-log.json` の全ループサマリーを出力
3. 残存差異があれば手動対応の推奨手順を提示
4. `converted-theme/CONVERSION_REPORT.md` にビジュアル検証結果セクションを追加
