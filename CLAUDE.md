# WordPress Classic Theme → FSE Theme 変換エージェント

## 概要

クラシックWordPressテーマをFull Site Editing (FSE) テーマに変換するClaude Codeエージェント。
テンプレートファイル内のPHPロジックを適切にブロック化またはfunctions.phpに移行し、
完全なFSEテーマ構造を出力する。

---

## FSEテーマ ディレクトリ構造（出力形式）

```
converted-theme/
├── style.css                  # テーマヘッダー（元テーマから継承）
├── theme.json                 # グローバル設定・スタイル
├── functions.php              # 移行したPHPロジック + ブロックパターン登録
├── templates/                 # ブロックテンプレート
│   ├── index.html
│   ├── single.html
│   ├── page.html
│   ├── archive.html
│   ├── search.html
│   ├── 404.html
│   ├── home.html
│   ├── front-page.html
│   └── single-{post_type}.html
├── parts/                     # テンプレートパーツ
│   ├── header.html
│   ├── footer.html
│   └── sidebar.html
├── patterns/                  # ブロックパターン
│   └── *.php
├── assets/                    # 静的アセット
│   ├── css/
│   ├── js/
│   ├── images/
│   └── fonts/
└── CONVERSION_REPORT.md       # 変換レポート
```

---

## PHPテンプレートタグ → ブロックマークアップ 対応表

### サイト情報
| PHP | ブロック |
|-----|---------|
| `bloginfo('name')` / `get_bloginfo('name')` | `<!-- wp:site-title /-->` |
| `bloginfo('description')` | `<!-- wp:site-tagline /-->` |
| `custom_logo()` / `the_custom_logo()` | `<!-- wp:site-logo /-->` |

### ナビゲーション
| PHP | ブロック |
|-----|---------|
| `wp_nav_menu(array('theme_location' => 'xxx'))` | `<!-- wp:navigation {"ref":ID} /-->` |
| `wp_list_pages()` | `<!-- wp:page-list /-->` |

### 投稿コンテンツ
| PHP | ブロック |
|-----|---------|
| `the_title()` | `<!-- wp:post-title /-->` |
| `the_content()` | `<!-- wp:post-content /-->` |
| `the_excerpt()` | `<!-- wp:post-excerpt /-->` |
| `the_post_thumbnail()` | `<!-- wp:post-featured-image /-->` |
| `the_date()` / `get_the_date()` | `<!-- wp:post-date /-->` |
| `the_author()` / `get_the_author()` | `<!-- wp:post-author /-->` |
| `the_category()` / `get_the_category_list()` | `<!-- wp:post-terms {"term":"category"} /-->` |
| `the_tags()` | `<!-- wp:post-terms {"term":"post_tag"} /-->` |
| `comments_template()` | `<!-- wp:comments --><!-- wp:comment-template -->...<!-- /wp:comment-template --><!-- /wp:comments -->` |
| `comment_form()` | `<!-- wp:post-comments-form /-->` |
| `the_permalink()` | リンク属性として処理 |
| `edit_post_link()` | 変換対象外（エディタ内で自動提供） |

### ループ・クエリ
| PHP | ブロック |
|-----|---------|
| メインループ (`while(have_posts())`) | `<!-- wp:query --><!-- wp:post-template -->...<!-- /wp:post-template --><!-- /wp:query -->` |
| `WP_Query` カスタムクエリ | `<!-- wp:query {"queryId":N,"query":{"perPage":N,...}} -->` |
| `paginate_links()` / `the_posts_pagination()` | `<!-- wp:query-pagination -->` 内に配置 |
| `get_search_form()` | `<!-- wp:search /-->` |

### ウィジェット・サイドバー
| PHP | ブロック |
|-----|---------|
| `dynamic_sidebar('sidebar-1')` | テンプレートパーツ化 or パターン化 |
| `is_active_sidebar()` + `dynamic_sidebar()` | ブロックウィジェットエリアまたはパターンに変換 |
| 個別ウィジェット | 対応するコアブロックに個別変換 |

### ヘッダー・フッター
| PHP | ブロック |
|-----|---------|
| `wp_head()` | 不要（FSEが自動処理） |
| `wp_footer()` | 不要（FSEが自動処理） |
| `wp_body_open()` | 不要（FSEが自動処理） |
| `body_class()` | 不要（FSEが自動処理） |
| `language_attributes()` | 不要（FSEが自動処理） |
| `charset` meta | 不要（FSEが自動処理） |

---

## PHPロジック分類と処理方針

テンプレート内のPHPロジックは以下の4カテゴリに分類し、それぞれ異なる方針で処理する。

### カテゴリA: ブロック直接変換（テンプレート内で完結）

対象のPHPロジックをFSEブロックマークアップに直接変換する。

```
対象:
- テンプレートタグ呼び出し（the_title, the_content 等）
- メインループ
- wp_nav_menu()
- get_search_form()
- get_template_part() → テンプレートパーツ参照
- get_header() / get_footer() / get_sidebar()
```

**例: メインループの変換**
```php
// Before (classic)
<?php if ( have_posts() ) : while ( have_posts() ) : the_post(); ?>
  <h2><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
  <?php the_excerpt(); ?>
<?php endwhile; endif; ?>
```
```html
<!-- After (FSE) -->
<!-- wp:query -->
<!-- wp:post-template -->
  <!-- wp:post-title {"isLink":true} /-->
  <!-- wp:post-excerpt /-->
<!-- /wp:post-template -->
<!-- wp:query-no-results -->
  <!-- wp:paragraph -->
  <p>投稿が見つかりませんでした。</p>
  <!-- /wp:paragraph -->
<!-- /wp:query-no-results -->
<!-- /wp:query -->
```

### カテゴリB: パターン変換（patterns/*.php）

動的なPHP処理が必要だがテーマ固有のUIパーツとして再利用可能なものをパターンに変換する。

```
対象:
- カスタムクエリ（WP_Query）を使った特定カテゴリ表示
- 条件付きCTAセクション
- 動的なウィジェットエリア代替
- カスタムフィールド（ACF等）を使った表示ロジック
- ショートコードで実現していた複合レイアウト
```

**例: カスタムクエリのパターン化**
```php
// patterns/featured-posts.php
<?php
/**
 * Title: おすすめ記事
 * Slug: theme-name/featured-posts
 * Categories: posts
 */
?>
<!-- wp:query {"queryId":1,"query":{"perPage":3,"categoryIds":[<?php echo get_cat_ID('featured'); ?>],"order":"desc","orderBy":"date"}} -->
<!-- wp:post-template {"layout":{"type":"grid","columnCount":3}} -->
  <!-- wp:post-featured-image {"isLink":true} /-->
  <!-- wp:post-title {"isLink":true} /-->
  <!-- wp:post-excerpt /-->
<!-- /wp:post-template -->
<!-- /wp:query -->
```

### カテゴリC: functions.php 移行（サーバーサイドロジック）

テンプレートから除去し、functions.phpのフック/フィルター/カスタムブロックとして移行する。

```
対象:
- 条件分岐によるスクリプト/スタイル読み込み（wp_enqueue_scripts）
- リダイレクトロジック（template_redirect）
- アクセス制御・認証チェック
- カスタム投稿タイプ・タクソノミー登録
- REST APIエンドポイント
- ショートコード定義
- カスタムウォーカー（ナビゲーション用）
- データ加工・整形ロジック
- 独自のrender_callbackを持つダイナミックブロック登録
```

**例: 条件分岐スクリプト読み込みの移行**
```php
// Before: header.php 内
<?php if ( is_page('contact') ) : ?>
  <script src="<?php echo get_template_directory_uri(); ?>/js/form-validation.js"></script>
<?php endif; ?>

// After: functions.php
add_action( 'wp_enqueue_scripts', function() {
    if ( is_page( 'contact' ) ) {
        wp_enqueue_script(
            'theme-form-validation',
            get_template_directory_uri() . '/assets/js/form-validation.js',
            [],
            '1.0.0',
            true
        );
    }
});
```

**例: アクセス制御の移行**
```php
// Before: single-premium.php 内
<?php
if ( ! is_user_logged_in() ) {
    wp_redirect( wp_login_url( get_permalink() ) );
    exit;
}
?>

// After: functions.php
add_action( 'template_redirect', function() {
    if ( is_singular( 'premium' ) && ! is_user_logged_in() ) {
        wp_redirect( wp_login_url( get_permalink() ) );
        exit;
    }
});
```

**例: テンプレート内の複雑なロジックをダイナミックブロック化**
```php
// Before: sidebar.php 内に直接書かれたロジック
<?php
$recent = new WP_Query([
    'posts_per_page' => 5,
    'meta_key' => 'views_count',
    'orderby' => 'meta_value_num',
    'order' => 'DESC',
]);
if ( $recent->have_posts() ) :
    while ( $recent->have_posts() ) : $recent->the_post();
        // 表示ロジック...
    endwhile;
    wp_reset_postdata();
endif;
?>

// After: functions.php にダイナミックブロック登録
add_action( 'init', function() {
    register_block_type( 'theme-name/popular-posts', [
        'render_callback' => 'theme_name_render_popular_posts',
        'attributes' => [
            'count' => [ 'type' => 'number', 'default' => 5 ],
        ],
    ]);
});

function theme_name_render_popular_posts( $attributes ) {
    $query = new WP_Query([
        'posts_per_page' => $attributes['count'],
        'meta_key'       => 'views_count',
        'orderby'        => 'meta_value_num',
        'order'          => 'DESC',
    ]);

    ob_start();
    if ( $query->have_posts() ) {
        echo '<ul class="wp-block-theme-name-popular-posts">';
        while ( $query->have_posts() ) {
            $query->the_post();
            printf(
                '<li><a href="%s">%s</a> (%s views)</li>',
                esc_url( get_permalink() ),
                esc_html( get_the_title() ),
                esc_html( get_post_meta( get_the_ID(), 'views_count', true ) )
            );
        }
        echo '</ul>';
        wp_reset_postdata();
    }
    return ob_get_clean();
}

// テンプレート内では:
// <!-- wp:theme-name/popular-posts {"count":5} /-->
```

### カテゴリD: 変換不可・要手動対応

自動変換が困難で、手動対応が必要なもの。CONVERSION_REPORT.mdに詳細を記録する。

```
対象:
- 外部APIとの密結合処理
- 独自のDBテーブルアクセス（$wpdb直接操作）
- 複雑なAJAXハンドラーとフロントエンド連携
- サードパーティプラグインとの深い統合
- eval() や動的include等のメタプログラミング
- グローバル変数に強く依存した処理チェーン
```

---

## 条件分岐の変換ルール

### WordPressテンプレート条件タグ → FSEテンプレート階層

テンプレート内の `is_*()` 条件分岐は、FSEのテンプレート階層で自然に解決できるケースが多い。

| 条件分岐 | FSE対応 |
|----------|---------|
| `is_front_page()` | `templates/front-page.html` |
| `is_home()` | `templates/home.html` |
| `is_single()` | `templates/single.html` |
| `is_page()` | `templates/page.html` |
| `is_page('about')` | `templates/page-about.html` |
| `is_archive()` | `templates/archive.html` |
| `is_category()` | `templates/category.html` |
| `is_category('news')` | `templates/category-news.html` |
| `is_tag()` | `templates/tag.html` |
| `is_author()` | `templates/author.html` |
| `is_search()` | `templates/search.html` |
| `is_404()` | `templates/404.html` |
| `is_singular('product')` | `templates/single-product.html` |
| `is_post_type_archive('product')` | `templates/archive-product.html` |
| `is_tax('genre')` | `templates/taxonomy-genre.html` |

### テンプレート階層で解決できない条件分岐

以下のパターンは別途対応が必要:

| 条件分岐 | 対応方針 |
|----------|----------|
| `is_user_logged_in()` | functions.php の `template_redirect` フックに移行 |
| `current_user_can()` | functions.php の `template_redirect` フックに移行 |
| `is_active_sidebar()` | パーツ/パターン内で処理、またはブロック可視性で対応 |
| `has_post_thumbnail()` | ブロック側が自動処理（画像なければ非表示） |
| `is_customize_preview()` | 削除（FSEでは不要） |
| `wp_is_mobile()` | CSS レスポンシブで対応 |
| `is_page_template()` | FSEテンプレート分割で対応 |
| カスタム条件（独自関数） | カテゴリC/Dとして個別判断 |

---

## theme.json 生成ルール

### functions.php からの変換マッピング

```php
// add_theme_support → theme.json
add_theme_support('editor-color-palette', [...])     → settings.color.palette
add_theme_support('editor-font-sizes', [...])         → settings.typography.fontSizes
add_theme_support('custom-spacing')                   → settings.spacing
add_theme_support('custom-line-height')               → settings.typography.lineHeight: true
add_theme_support('custom-units', [...])               → settings.spacing.units
add_theme_support('editor-gradient-presets', [...])    → settings.color.gradients
add_theme_support('responsive-embeds')                → 削除（デフォルト有効）
add_theme_support('align-wide')                       → settings.layout.contentSize / wideSize
add_theme_support('wp-block-styles')                  → 削除（デフォルト有効）
add_theme_support('appearance-tools')                 → settings.appearanceTools: true
```

### CSSカスタムプロパティ → theme.json

```css
/* Before */
:root {
  --primary-color: #1a73e8;
  --font-family-base: 'Noto Sans JP', sans-serif;
  --content-width: 1200px;
}

/* After: theme.json */
{
  "settings": {
    "color": {
      "palette": [
        { "slug": "primary", "color": "#1a73e8", "name": "Primary" }
      ]
    },
    "typography": {
      "fontFamilies": [
        {
          "fontFamily": "'Noto Sans JP', sans-serif",
          "slug": "base",
          "name": "Base"
        }
      ]
    },
    "layout": {
      "contentSize": "1200px",
      "wideSize": "1400px"
    }
  }
}
```

### theme.json テンプレート構造

```jsonc
{
  "$schema": "https://schemas.wp.org/wp/6.7/theme.json",
  "version": 3,
  "settings": {
    "appearanceTools": true,
    "color": {
      "palette": [],
      "gradients": [],
      "custom": true,
      "defaultPalette": false
    },
    "typography": {
      "fontFamilies": [],
      "fontSizes": [],
      "lineHeight": true,
      "customFontSize": true
    },
    "spacing": {
      "units": ["px", "em", "rem", "%", "vw"],
      "padding": true,
      "margin": true
    },
    "layout": {
      "contentSize": "",
      "wideSize": ""
    },
    "blocks": {}
  },
  "styles": {
    "color": {},
    "typography": {},
    "spacing": {},
    "elements": {
      "link": {},
      "heading": {},
      "button": {}
    },
    "blocks": {}
  },
  "templateParts": [
    { "name": "header", "title": "Header", "area": "header" },
    { "name": "footer", "title": "Footer", "area": "footer" },
    { "name": "sidebar", "title": "Sidebar", "area": "uncategorized" }
  ],
  "customTemplates": []
}
```

---

## CSS移行ルール

### 移行優先順位

1. **theme.json styles** に移行: グローバルスタイル、要素スタイル、ブロックスタイル
2. **theme.json settings** に移行: カラーパレット、フォント、スペーシング単位
3. **style.css に残す**: theme.jsonで表現できない複雑なCSS（アニメーション、複雑なセレクタ、メディアクエリの一部）
4. **assets/css/ に分離**: プラグイン互換用、印刷用、エディタ用スタイル

### wp_enqueue_styles の整理

```php
// functions.php で残すべきエンキュー
add_action( 'wp_enqueue_scripts', function() {
    // Google Fonts → theme.json fontFamilies に移行推奨
    // ただし可変フォントやfont-display制御が必要な場合は残す

    // 外部ライブラリCSS（Swiper, Lightbox等）
    wp_enqueue_style( 'swiper', 'https://cdn.jsdelivr.net/npm/swiper/swiper-bundle.min.css' );

    // theme.jsonで表現できないCSS
    wp_enqueue_style(
        'theme-custom',
        get_template_directory_uri() . '/assets/css/custom.css',
        [],
        '1.0.0'
    );
});
```

---

## 変換実行ステップ（エージェントのワークフロー）

### Phase 1: 解析

1. テーマディレクトリ全体をスキャンし、ファイル一覧を作成
2. `style.css` のテーマヘッダーを抽出・保持
3. `functions.php` を解析:
   - `add_theme_support()` 呼び出しを収集
   - `register_nav_menus()` を収集
   - `register_sidebar()` / `register_widget()` を収集
   - `wp_enqueue_script()` / `wp_enqueue_style()` を収集
   - カスタマイザー設定を収集
   - カスタム投稿タイプ・タクソノミー登録を収集
4. 各テンプレートファイルのPHPロジックをカテゴリA〜Dに分類
5. CSSファイルからカスタムプロパティ・主要スタイルを抽出
6. 依存プラグイン・外部ライブラリを検出

### Phase 2: theme.json 生成

1. `add_theme_support()` → settings マッピング
2. CSS変数 → パレット/フォント/スペーシング
3. グローバルCSS → styles セクション
4. テンプレートパーツ・カスタムテンプレート宣言

### Phase 3: テンプレート変換（難易度順）

1. `header.php` → `parts/header.html`
   - PHPロジック抽出 → カテゴリ判定 → 移行
2. `footer.php` → `parts/footer.html`
3. `sidebar.php` → `parts/sidebar.html` or パターン化
4. `index.php` → `templates/index.html`
5. `single.php` → `templates/single.html`
6. `page.php` → `templates/page.html`
7. `archive.php` → `templates/archive.html`
8. `search.php` → `templates/search.html`
9. `404.php` → `templates/404.html`
10. その他テンプレート（`front-page.php`, `home.php`, カスタムテンプレート等）
11. `template-parts/` → `patterns/` or `parts/`

### Phase 4: PHPロジック移行

1. カテゴリB（パターン）のPHPコードを `patterns/*.php` に配置
2. カテゴリC（functions.php移行）のコードを整理して `functions.php` に統合
   - 適切なフック/フィルターにアタッチ
   - ダイナミックブロック登録が必要な場合は `register_block_type()` で実装
3. `functions.php` から不要になった処理を削除:
   - `add_theme_support('title-tag')` → FSEデフォルト
   - `add_theme_support('automatic-feed-links')` → FSEデフォルト
   - カスタマイザー関連（FSEではサイトエディタに置換）

### Phase 5: アセット整理

1. CSS/JS/画像/フォントを `assets/` ディレクトリに再配置
2. エンキュー処理のパス更新
3. 未使用アセットの検出・レポート

### Phase 6: レポート生成

`CONVERSION_REPORT.md` に以下を出力:
- 変換サマリー（成功数/部分変換数/未変換数）
- ファイル別変換マッピング（元ファイル → 出力先）
- カテゴリ別PHPロジック処理結果
- 未変換項目の詳細と推奨対応
- テスト推奨項目チェックリスト
- 既知の制限事項

---

## 変換時の注意事項

### やるべきこと
- `wp_head()`, `wp_footer()`, `wp_body_open()`, `body_class()`, `language_attributes()` は削除する（FSEが自動出力）
- `get_header()`, `get_footer()`, `get_sidebar()` はテンプレートパーツ参照に変換
- `get_template_part()` はテンプレートパーツまたはパターン参照に変換
- ブロックマークアップのコメント構文を正確に記述（スペース、属性JSON、自己閉じ）
- `theme.json` の `$schema` と `version` を最新に設定

### やってはいけないこと
- テンプレートHTML内に `<?php` を記述しない（patterns/*.php は例外）
- `the_post()` を `templates/*.html` 内で使わない
- ブロックマークアップのネスト構造を壊さない
- 元テーマのライセンス情報を削除しない
- `wp_enqueue_*` の依存関係を無視しない

### エッジケース対応
- **子テーマの場合**: 親テーマの構造も考慮し、オーバーライドのみを変換
- **マルチサイト対応コード**: `switch_to_blog()` 等はfunctions.phpに移行
- **WooCommerce統合**: `woocommerce.php`, `wc-template-hooks` はプラグイン側のFSE対応を優先案内
- **ページビルダー依存**: Elementor/WPBakeryのショートコードは別途WP Migration Studioを案内
