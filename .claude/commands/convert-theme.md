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

### Step 8: ビジュアル検証（VISUAL_VERIFICATION_SKILL.md 参照）
1. wp-env でクラシックテーマ（port 8881）とFSEテーマ（port 8882）を並列起動
2. 両環境に同一テストデータを投入
3. Playwright で全ページ × 全ビューポートのスクリーンショット + Computed Style を取得
4. ピクセル差分とスタイル値差分を解析
5. 差分レポートをユーザーに提示し確認を得る
6. Critical/Warning の差異を theme.json / style.css で修正
7. 再キャプチャ → 再比較（最大5ループ、閾値: ピクセル差分率 < 2%）
8. 最終ビジュアル差分レポートを生成

### Step 9: 出力
- 変換結果を `./converted-theme/` ディレクトリに出力（元テーマは変更しない）
- `CONVERSION_REPORT.md` を生成:
  - 変換サマリー統計
  - ファイル別変換マッピング表
  - PHPロジック処理結果（カテゴリ別）
  - 未変換・要手動対応項目の詳細と推奨アクション
  - テスト推奨チェックリスト
