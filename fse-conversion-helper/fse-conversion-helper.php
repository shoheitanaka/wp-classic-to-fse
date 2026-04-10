<?php
/**
 * Plugin Name: FSE Conversion Helper
 * Plugin URI: https://github.com/artisanworkshop/fse-conversion-helper
 * Description: ステージング環境でのクラシック→FSEテーマ変換を支援するREST APIプラグイン。テーマ切替、カスタマイザー設定エクスポート、サイト情報取得を提供。
 * Version: 1.0.0
 * Author: ShinobiashiAI
 * Author URI: https://artisanworkshop.net
 * License: GPL-2.0-or-later
 * Text Domain: fse-conversion-helper
 * Requires at least: 6.0
 * Requires PHP: 8.0
 */

namespace Saai\FseConversionHelper;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'FCH_VERSION', '1.0.0' );
define( 'FCH_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );

// REST API 登録
add_action( 'rest_api_init', __NAMESPACE__ . '\\register_rest_routes' );

/**
 * REST API ルート登録
 */
function register_rest_routes(): void {
	$namespace = 'fse-conversion/v1';

	// サイト情報取得
	register_rest_route( $namespace, '/site-info', [
		'methods'             => 'GET',
		'callback'            => __NAMESPACE__ . '\\get_site_info',
		'permission_callback' => __NAMESPACE__ . '\\check_admin_permission',
	] );

	// カスタマイザー設定エクスポート
	register_rest_route( $namespace, '/customizer-export', [
		'methods'             => 'GET',
		'callback'            => __NAMESPACE__ . '\\export_customizer',
		'permission_callback' => __NAMESPACE__ . '\\check_admin_permission',
	] );

	// テーマ一覧取得
	register_rest_route( $namespace, '/themes', [
		'methods'             => 'GET',
		'callback'            => __NAMESPACE__ . '\\get_themes',
		'permission_callback' => __NAMESPACE__ . '\\check_admin_permission',
	] );

	// テーマ切替
	register_rest_route( $namespace, '/switch-theme', [
		'methods'             => 'POST',
		'callback'            => __NAMESPACE__ . '\\switch_theme_handler',
		'permission_callback' => __NAMESPACE__ . '\\check_admin_permission',
		'args'                => [
			'stylesheet' => [
				'required'          => true,
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_text_field',
			],
		],
	] );

	// テーマアップロード（ZIPファイル）
	register_rest_route( $namespace, '/upload-theme', [
		'methods'             => 'POST',
		'callback'            => __NAMESPACE__ . '\\upload_theme',
		'permission_callback' => __NAMESPACE__ . '\\check_admin_permission',
	] );

	// ウィジェット設定エクスポート
	register_rest_route( $namespace, '/widgets-export', [
		'methods'             => 'GET',
		'callback'            => __NAMESPACE__ . '\\export_widgets',
		'permission_callback' => __NAMESPACE__ . '\\check_admin_permission',
	] );

	// メニュー構造エクスポート
	register_rest_route( $namespace, '/menus-export', [
		'methods'             => 'GET',
		'callback'            => __NAMESPACE__ . '\\export_menus',
		'permission_callback' => __NAMESPACE__ . '\\check_admin_permission',
	] );

	// 登録済みサイドバー情報
	register_rest_route( $namespace, '/sidebars-export', [
		'methods'             => 'GET',
		'callback'            => __NAMESPACE__ . '\\export_sidebars',
		'permission_callback' => __NAMESPACE__ . '\\check_admin_permission',
	] );

	// theme_mods 全取得
	register_rest_route( $namespace, '/theme-mods', [
		'methods'             => 'GET',
		'callback'            => __NAMESPACE__ . '\\get_theme_mods',
		'permission_callback' => __NAMESPACE__ . '\\check_admin_permission',
	] );

	// キャプチャ対象URL一覧生成
	register_rest_route( $namespace, '/capture-urls', [
		'methods'             => 'GET',
		'callback'            => __NAMESPACE__ . '\\get_capture_urls',
		'permission_callback' => __NAMESPACE__ . '\\check_admin_permission',
	] );

	// Computed Style 取得用インラインスクリプト注入の切替
	register_rest_route( $namespace, '/computed-style-injection', [
		'methods'             => 'POST',
		'callback'            => __NAMESPACE__ . '\\toggle_style_injection',
		'permission_callback' => __NAMESPACE__ . '\\check_admin_permission',
		'args'                => [
			'enabled' => [
				'required' => true,
				'type'     => 'boolean',
			],
		],
	] );
}

/**
 * 管理者権限チェック
 */
function check_admin_permission(): bool {
	// Application Password 対応
	return current_user_can( 'manage_options' );
}

/**
 * サイト情報取得
 */
function get_site_info(): \WP_REST_Response {
	$theme = wp_get_theme();

	return new \WP_REST_Response( [
		'site_url'       => site_url(),
		'home_url'       => home_url(),
		'wp_version'     => get_bloginfo( 'version' ),
		'php_version'    => phpversion(),
		'active_theme'   => [
			'name'       => $theme->get( 'Name' ),
			'stylesheet' => get_stylesheet(),
			'template'   => get_template(),
			'version'    => $theme->get( 'Version' ),
			'is_block'   => $theme->is_block_theme(),
		],
		'active_plugins' => get_option( 'active_plugins', [] ),
		'site_title'     => get_bloginfo( 'name' ),
		'tagline'        => get_bloginfo( 'description' ),
		'permalink'      => get_option( 'permalink_structure' ),
		'posts_per_page' => (int) get_option( 'posts_per_page' ),
		'show_on_front'  => get_option( 'show_on_front' ),
		'page_on_front'  => (int) get_option( 'page_on_front' ),
		'page_for_posts' => (int) get_option( 'page_for_posts' ),
	] );
}

/**
 * カスタマイザー設定エクスポート
 *
 * テーマの add_theme_support + カスタマイザーで設定された値をすべて取得。
 * theme.json 生成のインプットとなる。
 */
function export_customizer(): \WP_REST_Response {
	$theme_mods = get_theme_mods();
	$theme      = wp_get_theme();

	// カスタムCSS
	$custom_css = wp_get_custom_css();

	// テーマサポート情報
	$supports = [];
	$features = [
		'title-tag',
		'post-thumbnails',
		'custom-header',
		'custom-background',
		'custom-logo',
		'menus',
		'automatic-feed-links',
		'html5',
		'editor-styles',
		'wp-block-styles',
		'responsive-embeds',
		'align-wide',
		'custom-spacing',
		'custom-line-height',
		'custom-units',
		'editor-color-palette',
		'editor-gradient-presets',
		'editor-font-sizes',
		'appearance-tools',
	];
	foreach ( $features as $feature ) {
		$support = get_theme_support( $feature );
		if ( false !== $support ) {
			$supports[ $feature ] = true === $support ? true : $support;
		}
	}

	// カスタムヘッダー設定
	$custom_header = [];
	if ( current_theme_supports( 'custom-header' ) ) {
		$custom_header = [
			'image'  => get_header_image(),
			'width'  => get_custom_header()->width,
			'height' => get_custom_header()->height,
		];
	}

	// カスタムロゴ設定
	$custom_logo = [];
	if ( has_custom_logo() ) {
		$logo_id     = get_theme_mod( 'custom_logo' );
		$logo_data   = wp_get_attachment_image_src( $logo_id, 'full' );
		$custom_logo = [
			'id'     => $logo_id,
			'url'    => $logo_data[0] ?? '',
			'width'  => $logo_data[1] ?? 0,
			'height' => $logo_data[2] ?? 0,
		];
	}

	// カスタム背景設定
	$custom_bg = [];
	if ( current_theme_supports( 'custom-background' ) ) {
		$custom_bg = [
			'color'      => get_background_color(),
			'image'      => get_background_image(),
			'repeat'     => get_theme_mod( 'background_repeat', 'repeat' ),
			'position_x' => get_theme_mod( 'background_position_x', 'left' ),
			'position_y' => get_theme_mod( 'background_position_y', 'top' ),
			'size'       => get_theme_mod( 'background_size', 'auto' ),
			'attachment' => get_theme_mod( 'background_attachment', 'scroll' ),
		];
	}

	return new \WP_REST_Response( [
		'theme_name'      => $theme->get( 'Name' ),
		'theme_mods'      => $theme_mods,
		'theme_supports'  => $supports,
		'custom_css'      => $custom_css,
		'custom_header'   => $custom_header,
		'custom_logo'     => $custom_logo,
		'custom_background' => $custom_bg,
	] );
}

/**
 * テーマ一覧
 */
function get_themes(): \WP_REST_Response {
	$themes = wp_get_themes();
	$result = [];

	foreach ( $themes as $stylesheet => $theme ) {
		$result[] = [
			'stylesheet' => $stylesheet,
			'name'       => $theme->get( 'Name' ),
			'version'    => $theme->get( 'Version' ),
			'is_block'   => $theme->is_block_theme(),
			'is_active'  => ( get_stylesheet() === $stylesheet ),
		];
	}

	return new \WP_REST_Response( $result );
}

/**
 * テーマ切替
 */
function switch_theme_handler( \WP_REST_Request $request ): \WP_REST_Response {
	$stylesheet = $request->get_param( 'stylesheet' );
	$theme      = wp_get_theme( $stylesheet );

	if ( ! $theme->exists() ) {
		return new \WP_REST_Response(
			[ 'error' => "Theme '{$stylesheet}' not found." ],
			404
		);
	}

	switch_theme( $stylesheet );

	// 切替後の確認
	$active = wp_get_theme();

	return new \WP_REST_Response( [
		'success'    => true,
		'switched_to' => [
			'name'       => $active->get( 'Name' ),
			'stylesheet' => get_stylesheet(),
			'is_block'   => $active->is_block_theme(),
		],
	] );
}

/**
 * テーマZIPアップロード
 */
function upload_theme( \WP_REST_Request $request ): \WP_REST_Response {
	$files = $request->get_file_params();

	if ( empty( $files['theme'] ) ) {
		return new \WP_REST_Response(
			[ 'error' => 'No theme file uploaded. Send as "theme" field.' ],
			400
		);
	}

	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/theme.php';
	require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';

	$file = $files['theme'];

	// WP のテーマインストーラーを使用
	$skin     = new \WP_Ajax_Upgrader_Skin();
	$upgrader = new \Theme_Upgrader( $skin );
	$result   = $upgrader->install( $file['tmp_name'], [ 'overwrite_package' => true ] );

	if ( is_wp_error( $result ) ) {
		return new \WP_REST_Response(
			[ 'error' => $result->get_error_message() ],
			500
		);
	}

	if ( ! $result ) {
		return new \WP_REST_Response(
			[ 'error' => 'Theme installation failed.', 'messages' => $skin->get_upgrade_messages() ],
			500
		);
	}

	$stylesheet = $upgrader->theme_info()->get_stylesheet();

	return new \WP_REST_Response( [
		'success'    => true,
		'stylesheet' => $stylesheet,
		'name'       => $upgrader->theme_info()->get( 'Name' ),
	] );
}

/**
 * ウィジェット設定エクスポート
 */
function export_widgets(): \WP_REST_Response {
	global $wp_registered_sidebars;

	$sidebars_widgets = wp_get_sidebars_widgets();
	$result           = [];

	foreach ( $sidebars_widgets as $sidebar_id => $widgets ) {
		if ( 'wp_inactive_widgets' === $sidebar_id || ! is_array( $widgets ) ) {
			continue;
		}

		$sidebar_data = [
			'id'      => $sidebar_id,
			'name'    => $wp_registered_sidebars[ $sidebar_id ]['name'] ?? $sidebar_id,
			'widgets' => [],
		];

		foreach ( $widgets as $widget_id ) {
			// ウィジェットタイプとインスタンス番号を分離
			preg_match( '/^(.+)-(\d+)$/', $widget_id, $matches );
			if ( ! $matches ) {
				continue;
			}

			$widget_type    = $matches[1];
			$widget_number  = (int) $matches[2];
			$widget_options = get_option( "widget_{$widget_type}" );
			$instance       = $widget_options[ $widget_number ] ?? [];

			$sidebar_data['widgets'][] = [
				'id'       => $widget_id,
				'type'     => $widget_type,
				'instance' => $instance,
			];
		}

		$result[] = $sidebar_data;
	}

	return new \WP_REST_Response( $result );
}

/**
 * メニュー構造エクスポート
 */
function export_menus(): \WP_REST_Response {
	$locations = get_nav_menu_locations();
	$result    = [];

	foreach ( $locations as $location => $menu_id ) {
		if ( ! $menu_id ) {
			continue;
		}

		$menu  = wp_get_nav_menu_object( $menu_id );
		$items = wp_get_nav_menu_items( $menu_id );

		if ( ! $menu || ! $items ) {
			continue;
		}

		$menu_data = [
			'location' => $location,
			'menu_id'  => $menu_id,
			'name'     => $menu->name,
			'items'    => [],
		];

		foreach ( $items as $item ) {
			$menu_data['items'][] = [
				'id'        => $item->ID,
				'title'     => $item->title,
				'url'       => $item->url,
				'type'      => $item->type,
				'object'    => $item->object,
				'object_id' => (int) $item->object_id,
				'parent'    => (int) $item->menu_item_parent,
				'classes'   => array_filter( $item->classes ),
				'target'    => $item->target,
			];
		}

		$result[] = $menu_data;
	}

	return new \WP_REST_Response( $result );
}

/**
 * サイドバー情報エクスポート
 */
function export_sidebars(): \WP_REST_Response {
	global $wp_registered_sidebars;

	$result = [];
	foreach ( $wp_registered_sidebars as $id => $sidebar ) {
		$result[] = [
			'id'            => $id,
			'name'          => $sidebar['name'],
			'description'   => $sidebar['description'],
			'before_widget' => $sidebar['before_widget'],
			'after_widget'  => $sidebar['after_widget'],
			'before_title'  => $sidebar['before_title'],
			'after_title'   => $sidebar['after_title'],
		];
	}

	return new \WP_REST_Response( $result );
}

/**
 * theme_mods 全取得
 */
function get_theme_mods(): \WP_REST_Response {
	return new \WP_REST_Response( get_theme_mods() ?: [] );
}

/**
 * キャプチャ対象URL一覧を動的生成
 *
 * サイトの実コンテンツに基づいて、テストすべきURLを自動検出する。
 */
function get_capture_urls(): \WP_REST_Response {
	$urls = [];

	// フロントページ
	$urls[] = [
		'name' => 'front-page',
		'url'  => home_url( '/' ),
		'type' => 'front-page',
	];

	// 投稿一覧（ブログページ）
	$page_for_posts = (int) get_option( 'page_for_posts' );
	if ( $page_for_posts ) {
		$urls[] = [
			'name' => 'blog',
			'url'  => get_permalink( $page_for_posts ),
			'type' => 'home',
		];
	}

	// 最新の個別投稿（アイキャッチあり/なし各1件）
	$posts_with_thumb = get_posts( [
		'posts_per_page' => 1,
		'meta_key'       => '_thumbnail_id',
		'post_status'    => 'publish',
	] );
	if ( $posts_with_thumb ) {
		$urls[] = [
			'name' => 'single-with-thumbnail',
			'url'  => get_permalink( $posts_with_thumb[0] ),
			'type' => 'single',
		];
	}

	$posts_without_thumb = get_posts( [
		'posts_per_page'  => 1,
		'post_status'     => 'publish',
		'meta_query'      => [ // phpcs:ignore WordPress.DB.SlowDBQuery
			[
				'key'     => '_thumbnail_id',
				'compare' => 'NOT EXISTS',
			],
		],
	] );
	if ( $posts_without_thumb ) {
		$urls[] = [
			'name' => 'single-no-thumbnail',
			'url'  => get_permalink( $posts_without_thumb[0] ),
			'type' => 'single',
		];
	}

	// 固定ページ（最大3件、テンプレート違いを含む）
	$pages = get_pages( [
		'number'  => 10,
		'sort_column' => 'menu_order',
	] );
	$page_templates_seen = [];
	foreach ( $pages as $page ) {
		$template = get_page_template_slug( $page->ID ) ?: 'default';
		if ( isset( $page_templates_seen[ $template ] ) ) {
			continue;
		}
		$page_templates_seen[ $template ] = true;
		$urls[] = [
			'name' => 'page-' . $page->post_name,
			'url'  => get_permalink( $page->ID ),
			'type' => 'page',
			'template' => $template,
		];
		if ( count( $page_templates_seen ) >= 3 ) {
			break;
		}
	}

	// カテゴリアーカイブ（最大2件）
	$categories = get_categories( [ 'number' => 2, 'hide_empty' => true ] );
	foreach ( $categories as $cat ) {
		$urls[] = [
			'name' => 'category-' . $cat->slug,
			'url'  => get_category_link( $cat->term_id ),
			'type' => 'category',
		];
	}

	// タグアーカイブ
	$tags = get_tags( [ 'number' => 1, 'hide_empty' => true ] );
	foreach ( $tags as $tag ) {
		$urls[] = [
			'name' => 'tag-' . $tag->slug,
			'url'  => get_tag_link( $tag->term_id ),
			'type' => 'tag',
		];
	}

	// 著者アーカイブ
	$authors = get_users( [ 'number' => 1, 'has_published_posts' => true ] );
	foreach ( $authors as $author ) {
		$urls[] = [
			'name' => 'author-' . $author->user_nicename,
			'url'  => get_author_posts_url( $author->ID ),
			'type' => 'author',
		];
	}

	// 月別アーカイブ
	$latest_post = get_posts( [ 'posts_per_page' => 1 ] );
	if ( $latest_post ) {
		$year  = get_the_date( 'Y', $latest_post[0] );
		$month = get_the_date( 'm', $latest_post[0] );
		$urls[] = [
			'name' => "archive-{$year}-{$month}",
			'url'  => get_month_link( $year, $month ),
			'type' => 'date',
		];
	}

	// 検索結果
	$urls[] = [
		'name' => 'search-results',
		'url'  => home_url( '/?s=' . rawurlencode( get_bloginfo( 'name' ) ) ),
		'type' => 'search',
	];
	$urls[] = [
		'name' => 'search-empty',
		'url'  => home_url( '/?s=xyznonexistent99999' ),
		'type' => 'search-empty',
	];

	// 404
	$urls[] = [
		'name' => '404',
		'url'  => home_url( '/this-page-does-not-exist-fse-test/' ),
		'type' => '404',
	];

	// カスタム投稿タイプ
	$cpts = get_post_types( [ 'public' => true, '_builtin' => false ], 'objects' );
	foreach ( $cpts as $cpt ) {
		// WooCommerce product は除外（別途対応）
		if ( 'product' === $cpt->name ) {
			continue;
		}

		$cpt_posts = get_posts( [
			'post_type'      => $cpt->name,
			'posts_per_page' => 1,
			'post_status'    => 'publish',
		] );
		if ( $cpt_posts ) {
			$urls[] = [
				'name' => 'single-' . $cpt->name,
				'url'  => get_permalink( $cpt_posts[0] ),
				'type' => 'single-' . $cpt->name,
			];
		}

		if ( $cpt->has_archive ) {
			$urls[] = [
				'name' => 'archive-' . $cpt->name,
				'url'  => get_post_type_archive_link( $cpt->name ),
				'type' => 'archive-' . $cpt->name,
			];
		}
	}

	return new \WP_REST_Response( [
		'total' => count( $urls ),
		'urls'  => $urls,
	] );
}

/**
 * Computed Style 注入スクリプトの切替
 *
 * 有効にすると、フロントエンドに全ページで window.__FCH_STYLES にComputed Styleを出力する
 * JavaScriptを注入する。Playwrightから page.evaluate(() => window.__FCH_STYLES) で取得可能。
 */
function toggle_style_injection( \WP_REST_Request $request ): \WP_REST_Response {
	$enabled = $request->get_param( 'enabled' );
	update_option( 'fch_style_injection', $enabled ? '1' : '0' );

	return new \WP_REST_Response( [
		'success' => true,
		'enabled' => $enabled,
	] );
}

// Computed Style 注入スクリプト
add_action( 'wp_footer', function() {
	if ( '1' !== get_option( 'fch_style_injection', '0' ) ) {
		return;
	}
	?>
	<script id="fch-computed-style-collector">
	(function() {
		const SELECTORS = [
			'body','header','.site-header','#masthead',
			'footer','.site-footer','#colophon',
			'main','.site-main','#primary',
			'aside','.widget-area','#secondary',
			'nav','.main-navigation','.nav-menu',
			'h1','h2','h3','h4','h5','h6',
			'p','a','blockquote','pre','code',
			'.entry-title','.post-title',
			'.entry-content','.post-content',
			'.entry-meta','.post-meta',
			'.widget','.widget-title',
			'button','.wp-block-button__link',
			'input[type="text"]','input[type="search"]','textarea',
			'.wp-block-group','.wp-block-columns','.wp-block-column',
			'.wp-block-navigation','.wp-block-site-title',
		];
		const PROPS = [
			'font-family','font-size','font-weight','line-height','letter-spacing',
			'color','background-color',
			'margin-top','margin-right','margin-bottom','margin-left',
			'padding-top','padding-right','padding-bottom','padding-left',
			'border-top-width','border-right-width','border-bottom-width','border-left-width',
			'border-top-color','border-right-color','border-bottom-color','border-left-color',
			'width','max-width','min-width','height','max-height',
			'display','position','flex-direction','justify-content','align-items','gap',
			'text-align','text-decoration','text-transform',
			'box-shadow','border-radius','opacity','z-index','overflow',
		];

		const results = {};
		for (const sel of SELECTORS) {
			const el = document.querySelector(sel);
			if (!el) continue;
			const cs = getComputedStyle(el);
			const s = {};
			for (const p of PROPS) s[p] = cs.getPropertyValue(p);
			const r = el.getBoundingClientRect();
			s.__rect_x = Math.round(r.x);
			s.__rect_y = Math.round(r.y);
			s.__rect_width = Math.round(r.width);
			s.__rect_height = Math.round(r.height);
			results[sel] = s;
		}
		window.__FCH_STYLES = results;
	})();
	</script>
	<?php
} );
