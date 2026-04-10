クラシックWordPressテーマを FSE テーマに変換してください。

対象テーマディレクトリ: $ARGUMENTS

## 実行手順

### Step 1: テーマ解析
- ディレクトリ構造をスキャンし、全ファイルを一覧化
- `style.css` のテーマヘッダーを抽出
- `functions.php` を完全解析:
  - `add_theme_support()` 一覧
  - `register_nav_menus()` / `register_sidebar()` 一覧
  - `wp_enqueue_script()` / `wp_enqueue_style()` 一覧
  - カスタム投稿タイプ・タクソノミー登録
  - カスタマイザー設定
- 各テンプレートファイル内のPHPロジックをスキャンし、CLAUDE.md の4カテゴリ（A〜D）に分類

### Step 2: 変換計画の提示
解析結果をもとに変換計画をユーザーに提示し、確認を得る:
- ファイル別の変換方針一覧（元ファイル → 出力先 + 処理方式）
- PHPロジックの分類結果サマリー
- 検出された課題・リスク
- 変換不可項目（カテゴリD）の一覧

**ユーザーの確認を得てから Step 3 に進む。**

### Step 3: theme.json 生成
- `functions.php` の `add_theme_support()` から settings を生成
- CSSカスタムプロパティからパレット・フォント・スペーシングを抽出
- グローバルCSS から styles セクションを生成
- templateParts / customTemplates を宣言

### Step 4: テンプレートパーツ変換
以下の順序で変換:
1. `header.php` → `parts/header.html`
   - 埋め込みPHPロジックをカテゴリ判定し、ブロック化/パターン化/functions.php移行
2. `footer.php` → `parts/footer.html`
3. `sidebar.php` → `parts/sidebar.html` またはパターン

### Step 5: テンプレート変換
以下の順序で変換:
1. `index.php` → `templates/index.html`
2. `single.php` → `templates/single.html`
3. `page.php` → `templates/page.html`
4. `archive.php` → `templates/archive.html`
5. `search.php` → `templates/search.html`
6. `404.php` → `templates/404.html`
7. その他検出されたテンプレート

各テンプレートで:
- PHPテンプレートタグ → ブロックマークアップに変換
- `is_*()` 条件分岐 → テンプレート階層分割 or functions.php移行
- カスタムループ → wp:query ブロック or パターン化
- インラインPHPロジック → カテゴリ判定し適切に処理

### Step 6: PHPロジック移行
- カテゴリB のコードを `patterns/*.php` に配置
- カテゴリC のコードを `functions.php` に統合
  - 適切なアクション/フィルターフックにアタッチ
  - 必要に応じてダイナミックブロックとして `register_block_type()` で登録
- 不要になった `add_theme_support()` 等を functions.php から削除

### Step 7: アセット整理
- CSS/JS/画像/フォントを `assets/` に再配置
- エンキュー処理のパスを更新
- Google Fonts を可能な限り `theme.json` fontFamilies に移行

### Step 8: ビジュアル検証 + 自動修正ループ（ステージング方式）

capture-config.json が存在するか確認し、なければユーザーに作成を案内する。

#### 8-1. カスタマイザー設定の取得と theme.json への反映
```bash
npm run capture
```
実行前に REST API 経由でカスタマイザー設定をエクスポートし `visual-diff/exports/` に保存する。
出力された `customizer.json` の内容を読み取り、以下を theme.json に反映する:
- `theme_mods.header_textcolor` → `styles.elements.heading.color`
- `theme_mods.background_color` → `styles.color.background`
- `editor-color-palette` の値 → `settings.color.palette`
- `editor-font-sizes` の値 → `settings.typography.fontSizes`
- カスタムロゴのサイズ → `parts/header.html` の `wp:site-logo` 属性
- ウィジェット構成 → `parts/sidebar.html` のブロック構造
- メニュー構造 → `wp:navigation` の構造

#### 8-2. 変換済みテーマを ZIP 化しステージングにアップロード
```bash
cd converted-theme && zip -r ../converted-theme.zip . && cd ..
curl -u "$API_USER:$API_PASS" \
  -F "theme=@converted-theme.zip" \
  $STAGING_URL/wp-json/fse-conversion/v1/upload-theme
```

#### 8-3. Playwright キャプチャ実行
```bash
npm run capture
```
Classic 状態 → スクショ + Computed Style → テーマ切替 → FSE 状態 → スクショ + Computed Style → Classic に戻す

#### 8-4. 差分解析
```bash
npm run diff
```
`visual-diff/diff-report.json` と `visual-diff/VISUAL_DIFF_REPORT.md` が生成される。

#### 8-5. 差分レポートを読み取り、自動修正ループに入る

`visual-diff/diff-report.json` を読み取り、以下のルールで自動修正する。
**ユーザー確認不要 — critical/warning は自動で修正して再検証する。**

##### 修正ルール（diff-report.json の fixSuggestions に基づく）

1. **font-size 差異** → `converted-theme/theme.json`
   - diff の selector がどの要素/ブロックに対応するか判定
   - `h1`〜`h6` → `styles.elements.h1.typography.fontSize` 等を Classic 値に設定
   - `.entry-content p` 等 → `styles.blocks.core/paragraph.typography.fontSize`
   - 該当なければ `converted-theme/style.css` に直接ルール追加

2. **margin/padding 差異** → `converted-theme/theme.json` or `style.css`
   - `styles.spacing` または `styles.blocks.{block}.spacing.margin/padding` を設定
   - theme.json で表現できない複雑なセレクタは `style.css` に追加

3. **color 差異** → `converted-theme/theme.json`
   - `settings.color.palette` に不足している色を追加
   - `styles.elements.{element}.color.text/background` を設定

4. **layout 差異（display, width, position）** → テンプレート構造を修正
   - `converted-theme/templates/*.html` または `parts/*.html` のブロック構造を修正
   - コンテナブロックの `layout` 属性、alignWide/alignFull 設定を調整

5. **要素欠落** → テンプレート/パーツにブロックを追加

6. **font-family 差異** → `theme.json` の `settings.typography.fontFamilies` を確認・修正

##### 修正後の再検証

修正が完了したら:
1. `converted-theme` を再 ZIP 化
2. REST API でステージングにアップロード（上書き）
3. `npm run capture` で再キャプチャ
4. `npm run diff` で再比較
5. `diff-report.json` を再読み取り

##### ループ終了条件
- **成功**: 全ページのピクセル差分率 < 2% かつ critical が 0件
- **上限**: 5回ループしても閾値未達の場合、残存差異を VISUAL_DIFF_REPORT.md に記録して終了
- **各ループで**: 修正内容のサマリーをコンソールに出力（何を変えたか追跡可能にする）

##### 修正ログ
各ループの修正内容を `visual-diff/fix-log.json` に記録する:
```json
[
  {
    "loop": 1,
    "fixes": [
      { "file": "theme.json", "path": "styles.elements.h1.typography.fontSize", "from": null, "to": "36px", "reason": "h1 font-size diff: 36px vs 32px" },
      { "file": "style.css", "added": ".entry-content { margin-top: 40px; }", "reason": "margin-top diff: 40px vs 0px" }
    ],
    "result": { "pixelDiffMax": 4.2, "criticals": 3, "warnings": 8 }
  },
  {
    "loop": 2,
    "fixes": [...],
    "result": { "pixelDiffMax": 1.1, "criticals": 0, "warnings": 2 }
  }
]
```

### Step 9: 出力
- 変換結果を `./converted-theme/` ディレクトリに出力（元テーマは変更しない）
- `CONVERSION_REPORT.md` を生成:
  - 変換サマリー統計
  - ファイル別変換マッピング表
  - PHPロジック処理結果（カテゴリ別）
  - 未変換・要手動対応項目の詳細と推奨アクション
  - テスト推奨チェックリスト
