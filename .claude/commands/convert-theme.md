クラシックWordPressテーマを FSE テーマに変換してください。

対象テーマディレクトリ: $ARGUMENTS

## 基本方針：HTML-First アプローチ

**PHPコードを先に読んで変換するのではなく、ステージングの実レンダリングHTMLを設計の第一参照とする。**

```
❌ 旧アプローチ: PHP → 意図を解釈 → FSEブロック → ズレが生じる
✅ 新アプローチ: 実DOM・実スタイル → FSEブロック → PHPで動的部分を補完
```

理由：
- `antimall_get_header()` 等の複雑なフレームワーク関数はPHP読解では追いきれない
- カスタマイザー値・条件分岐・フィルターが絡んだ実際の出力はレンダリングして初めてわかる
- 実DOMを参照すれば推測ゼロで正確なCSS値・HTML構造が取得できる

---

## 実行手順

### Step 1: HTML抽出（最初に必ず実行）

`capture-config.json` が存在することを確認し、なければユーザーに作成を案内して中断。

```bash
npm run extract
```

このスクリプトは以下を実行する：
- ステージングにクラシックテーマで接続
- 全ページの完全DOM + 計算済みスタイルを取得
- `visual-diff/html/classic/` に保存：
  - `{page}.html` — フルページHTML
  - `{page}-structure.json` — 要素別の計算済みスタイル
  - `{page}-guide.md` — ページ別の変換ガイド
  - `extraction-summary.md` — 全体サマリー（最重要）

**抽出完了後、必ず以下を読む：**
```
visual-diff/html/classic/extraction-summary.md   ← グローバルスタイル基準値・ヘッダー構造
visual-diff/html/classic/front-page-guide.md      ← フロントページ詳細
```

### Step 2: 実DOM解析（PHPより先に行う）

`extraction-summary.md` と各ページの `-guide.md` を読み、以下を把握する：

**グローバル基準値の確定：**
- `body { font-family, font-size, line-height, color, background-color }` の実測値
- → これが `theme.json styles.typography` と `styles.color` の正解値

**ヘッダー構造の確定：**
- `header` 要素の実DOM（子要素・クラス・高さ・背景色）
- ナビゲーションのメニュー項目・階層構造
- ロゴのサイズ・位置

**フッター構造の確定：**
- `footer` 要素の実DOM（カラム数・配色・コンテンツ）

**各テンプレートタイプの確定：**
- 実際に存在する要素セレクタを把握（`.site-header` か `#masthead` か等）
- サイドバーの有無・位置（左/右）

### Step 3: PHPコード確認（動的部分のみ）

実DOMで構造が把握できたら、PHPは以下の確認にのみ使用する：

**確認事項：**
1. `register_nav_menus()` → ナビゲーションのメニューロケーション名とDBのID
2. `register_sidebar()` → サイドバーのスラッグ
3. カスタム投稿タイプ・タクソノミー → archive/single テンプレートの分岐
4. `functions.php` の `wp_enqueue_*` → 必要なJS/CSSアセット
5. 変換不可なプラグイン依存（WooCommerce、Revolution Slider等）→ カテゴリD として記録

**PHPを読む必要がないもの：**
- ヘッダー・フッターの見た目（実DOMで確認済み）
- CSS値・カラー（実スタイルで確認済み）
- レイアウト構造（実DOMで確認済み）

### Step 4: 変換計画の提示

解析結果をもとに変換計画をユーザーに提示し、確認を得る：

- **グローバルスタイル**: 実測値（`body font-size`, `color` 等）の一覧
- **テンプレートパーツ**: ヘッダー・フッター・サイドバーの実構造サマリー
- **テンプレート**: 必要なファイル一覧と各テンプレートの方針
- **変換不可項目**: カテゴリD（プラグイン依存、動的コンテンツ等）

**ユーザーの確認を得てから Step 5 に進む。**

### Step 5: theme.json 生成（実測値ベース）

`extraction-summary.md` の値を最優先で使用する：

```
優先順位:
1位: extraction-summary.md の実測計算済みスタイル
2位: functions.php の add_theme_support() / editor-color-palette
3位: style.css の CSS カスタムプロパティ
```

**設定内容：**
- `styles.typography`: body の実測 font-family / font-size / line-height / color
- `settings.color.palette`: 実DOM上で計測された実際のカラー値
- `settings.layout.contentSize`: 実 `.container` または main 要素の実測 max-width
- `styles.elements.h1〜h6`: 実測フォントサイズ・マージン

### Step 6: テンプレートパーツ変換（実DOM基準）

`{page}-guide.md` の HTML プレビューと子要素リストを参照して設計する。

#### parts/header.html

`front-page-guide.md` の `header 要素` セクションを読み：
- 実際の子要素（topbar / logo-section / nav-section 等）の順序・構造を再現
- 背景色・パディングは実測値をそのまま使用
- ナビゲーション ID は PHPコードまたは MCP で確認

#### parts/footer.html

`front-page-guide.md` の `footer 要素` セクションを読み：
- カラム数・比率は実測レイアウトに合わせる
- 背景色・テキスト色は実測値を使用
- コンテンツ（住所・ウィジェット）はプレースホルダーでOK

#### parts/sidebar.html

`{page}-guide.md` の `sidebar 要素` セクションを読み：
- ウィジェット構成（最新記事・カテゴリ等）を再現

### Step 7: テンプレート変換

各テンプレートを `{page}-guide.md` と実DOM構造を参照して変換する：

| PHPテンプレート | FSEテンプレート | 参照するguide |
|---------------|----------------|-------------|
| `front-page.php` / 固定フロントページ | `templates/front-page.html` | `front-page-guide.md` |
| `index.php` | `templates/index.html` | `category-news-guide.md` |
| `single.php` | `templates/single.html` | `single-with-thumbnail-guide.md` |
| `page.php` | `templates/page.html` | `page-buy-form-guide.md` |
| `archive.php` | `templates/archive.html` | `archive-*-guide.md` |
| `search.php` | `templates/search.html` | `search-results-guide.md` |
| `404.php` | `templates/404.html` | `404-guide.md` |

**front-page.html の特別ルール：**
- 固定フロントページが WooCommerce / Revolution Slider 等のショートコードで構成されている場合は `wp:post-content` を使わない
- `front-page-guide.md` の実HTMLを基に、各セクションをFSEブロックで再構築する
- VC shortcode (`[vc_row]`, `[rev_slider_vc]` 等) は カテゴリD として記録し、カバーブロック等で代替する

### Step 8: アセット整理

- CSS/JS/画像/フォントを `assets/` に再配置
- Google Fonts を `theme.json fontFamilies` に移行（実測 font-family 名を使用）
- フォントアイコン（fontello等）は `functions.php` でエンキュー

### Step 9: 初回デプロイ

```bash
npm run deploy
```

### Step 10: ビジュアル検証 + 自動修正ループ

#### 10-1. キャプチャ

```bash
npm run capture:no-export
```

Classic 状態 → スクショ + Computed Style → テーマ切替 → FSE → スクショ → Classic に戻す

#### 10-2. 差分解析

```bash
npm run diff
```

`visual-diff/diff-report.json` と `visual-diff/VISUAL_DIFF_REPORT.md` が生成される。

#### 10-3. 差分レポートを読み取り、自動修正ループに入る

`visual-diff/diff-report.json` を読み取り、以下のルールで自動修正する。
**ユーザー確認不要 — critical は自動で修正して再検証する。**

##### 修正ルール

1. **font-size / color / spacing 差異**
   - `extraction-summary.md` の実測値と照合して theme.json / style.css を修正
   - 実測値と diff の両方が一致する値を採用する

2. **要素欠落**（`.site-header` 等のクラシック固有クラス）
   - FSEではHTML構造が異なるため、クラシック固有クラスの欠落は「構造的差異」として記録
   - 機能的に同等であれば修正不要

3. **layout 差異**（width, height のずれ）
   - `theme.json settings.layout.contentSize` で調整
   - または `parts/*.html` のブロック構造を修正

4. **要素位置のずれ**（rect_y の差異）
   - コンテンツの差異（VC shortcode vs FSE blocks）によるものは修正不要として記録
   - ヘッダー・フッターのずれは parts/*.html を修正

##### 修正後の再検証

修正が完了したら：
1. `npm run deploy` で再デプロイ（バージョン自動インクリメント）
2. `npm run capture:no-export` で再キャプチャ
3. `npm run diff` で再比較
4. `diff-report.json` を再読み取り

##### ループ終了条件
- **成功**: 全ページのピクセル差分率 < 2% かつ critical が 0件
- **上限**: 5回ループしても閾値未達の場合、残存差異を `VISUAL_DIFF_REPORT.md` に記録して終了
- **各ループで**: 修正内容のサマリーを出力（何を変えたか追跡可能にする）

##### 修正ログ
各ループの修正内容を `visual-diff/fix-log.json` に記録する：
```json
[
  {
    "loop": 1,
    "version": "1.0.0-fse.1",
    "fixes": [
      { "file": "theme.json", "path": "styles.elements.h1.typography.fontSize", "from": null, "to": "36px", "reason": "h1 font-size diff: 36px vs 32px — extraction-summary.md 実測値" },
      { "file": "style.css", "added": ".entry-content { margin-top: 40px; }", "reason": "margin-top diff: 40px vs 0px" }
    ],
    "result": { "pixelDiffMax": 4.2, "criticals": 3, "warnings": 8 }
  }
]
```

### Step 11: 出力

- 変換結果を `./converted-theme/` ディレクトリに出力（元テーマは変更しない）
- `CONVERSION_REPORT.md` を生成：
  - 変換サマリー統計
  - ファイル別変換マッピング表
  - PHPロジック処理結果（カテゴリ別）
  - 未変換・要手動対応項目の詳細と推奨アクション
  - テスト推奨チェックリスト
- `VISUAL_DIFF_REPORT.md` を最終版として更新

---

## チェックリスト

変換開始時：
- [ ] `capture-config.json` が設定済み
- [ ] ステージングに FSE Conversion Helper プラグインが有効
- [ ] `npm run extract` 実行済み
- [ ] `extraction-summary.md` を読んだ

theme.json 作成時：
- [ ] body font-size は実測値（extraction-summary.md）
- [ ] body color は実測値
- [ ] body line-height は実測値
- [ ] contentSize は実測 main 幅

parts/header.html 作成時：
- [ ] 実DOM の子要素順序と一致
- [ ] 背景色は実測値
- [ ] ナビゲーション ID は MCP or PHP で確認済み

front-page.html 作成時：
- [ ] `wp:post-content` を使っていない（VC/WC依存ページの場合）
- [ ] 各セクションを FSE ブロックで再構築済み
