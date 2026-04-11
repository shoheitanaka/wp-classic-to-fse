<?php
/**
 * Plugin Name: FSE MCP Server
 * Plugin URI:  https://github.com/
 * Description: Model Context Protocol server for FSE theme conversion. Exposes WordPress DB data to Claude Code via JSON-RPC 2.0 over REST API.
 * Version:     1.0.0
 * Author:      Shohei Tanaka
 * License:     GPL-2.0+
 * Requires at least: 6.4
 * Requires PHP: 8.1
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'FSE_MCP_VERSION', '1.0.0' );
define( 'FSE_MCP_NAMESPACE', 'fse-mcp/mcp' );

add_action( 'rest_api_init', 'fse_mcp_register_routes' );

function fse_mcp_register_routes(): void {
	register_rest_route(
		'fse-mcp',
		'/mcp',
		array(
			'methods'             => array( 'GET', 'POST' ),
			'callback'            => 'fse_mcp_handle_request',
			'permission_callback' => 'fse_mcp_auth',
		)
	);
}

/** Basic Auth — WordPress Application Passwords */
function fse_mcp_auth(): bool {
	return current_user_can( 'manage_options' );
}

// ─── MCP Protocol Handler ───────────────────────────────────────────────────

function fse_mcp_handle_request( WP_REST_Request $request ): WP_REST_Response {
	$method = $request->get_method();

	// GET /mcp — server info (Streamable HTTP discovery)
	if ( 'GET' === $method ) {
		return new WP_REST_Response( fse_mcp_server_info(), 200 );
	}

	$body = $request->get_json_params();
	if ( empty( $body ) ) {
		return fse_mcp_error( null, -32700, 'Parse error' );
	}

	$id     = $body['id'] ?? null;
	$rpc    = $body['method'] ?? '';
	$params = $body['params'] ?? array();

	switch ( $rpc ) {
		case 'initialize':
			return fse_mcp_ok( $id, fse_mcp_server_info() );

		case 'tools/list':
			return fse_mcp_ok( $id, array( 'tools' => fse_mcp_tools_list() ) );

		case 'tools/call':
			return fse_mcp_dispatch_tool( $id, $params );

		default:
			return fse_mcp_error( $id, -32601, 'Method not found: ' . $rpc );
	}
}

function fse_mcp_ok( $id, $result ): WP_REST_Response {
	return new WP_REST_Response(
		array(
			'jsonrpc' => '2.0',
			'id'      => $id,
			'result'  => $result,
		),
		200
	);
}

function fse_mcp_error( $id, int $code, string $message ): WP_REST_Response {
	return new WP_REST_Response(
		array(
			'jsonrpc' => '2.0',
			'id'      => $id,
			'error'   => array( 'code' => $code, 'message' => $message ),
		),
		200 // MCP uses 200 even for errors
	);
}

function fse_mcp_server_info(): array {
	return array(
		'protocolVersion' => '2024-11-05',
		'serverInfo'      => array(
			'name'    => 'fse-mcp-server',
			'version' => FSE_MCP_VERSION,
		),
		'capabilities'    => array( 'tools' => array() ),
	);
}

// ─── Tool Dispatcher ────────────────────────────────────────────────────────

function fse_mcp_dispatch_tool( $id, array $params ): WP_REST_Response {
	$name = $params['name'] ?? '';
	$args = $params['arguments'] ?? array();

	$handlers = array(
		'get_site_info'                    => 'fse_mcp_tool_site_info',
		'get_customizer_section'           => 'fse_mcp_tool_customizer_section',
		'get_all_theme_mods_chunked'       => 'fse_mcp_tool_theme_mods_chunked',
		'get_customizer_to_theme_json'     => 'fse_mcp_tool_customizer_to_theme_json',
		'get_nav_menus'                    => 'fse_mcp_tool_nav_menus',
		'create_fse_navigation'            => 'fse_mcp_tool_create_fse_navigation',
		'get_fse_navigation_posts'         => 'fse_mcp_tool_fse_navigation_posts',
		'fix_navigation_ref_in_template'   => 'fse_mcp_tool_fix_nav_ref',
		'get_widgets'                      => 'fse_mcp_tool_widgets',
		'install_theme'                    => 'fse_mcp_tool_install_theme',
		'switch_theme'                     => 'fse_mcp_tool_switch_theme',
		'get_capture_urls'                 => 'fse_mcp_tool_capture_urls',
	);

	if ( ! isset( $handlers[ $name ] ) ) {
		return fse_mcp_error( $id, -32601, 'Unknown tool: ' . $name );
	}

	try {
		$result = call_user_func( $handlers[ $name ], $args );
		return fse_mcp_ok( $id, array( 'content' => array( array( 'type' => 'text', 'text' => wp_json_encode( $result ) ) ) ) );
	} catch ( Exception $e ) {
		return fse_mcp_error( $id, -32000, $e->getMessage() );
	}
}

// ─── Tool Implementations ───────────────────────────────────────────────────

function fse_mcp_tool_site_info( array $args ): array {
	$theme = wp_get_theme();
	return array(
		'wordpress_version' => get_bloginfo( 'version' ),
		'site_url'          => get_site_url(),
		'active_theme'      => array(
			'name'       => $theme->get( 'Name' ),
			'stylesheet' => get_stylesheet(),
			'template'   => get_template(),
			'version'    => $theme->get( 'Version' ),
			'is_block'   => wp_is_block_theme(),
		),
		'plugins'           => array_keys( get_option( 'active_plugins', array() ) ),
		'php_version'       => PHP_VERSION,
		'memory_limit'      => ini_get( 'memory_limit' ),
	);
}

/**
 * Get customizer settings for a single section (avoids OOM from loading all at once).
 *
 * @param array $args { section: string }
 */
function fse_mcp_tool_customizer_section( array $args ): array {
	$section = sanitize_key( $args['section'] ?? '' );
	if ( ! $section ) {
		throw new \InvalidArgumentException( 'section is required' );
	}

	// Bootstrap customizer in read-only mode
	require_once ABSPATH . 'wp-includes/class-wp-customize-manager.php';
	$wp_customize = new WP_Customize_Manager();
	$wp_customize->wp_loaded();
	do_action( 'customize_register', $wp_customize );

	$result = array();
	foreach ( $wp_customize->settings() as $setting ) {
		/** @var WP_Customize_Setting $setting */
		if ( $setting->section === $section ) {
			$result[ $setting->id ] = array(
				'value'   => $setting->value(),
				'default' => $setting->default,
				'type'    => $setting->type,
			);
		}
	}

	return array(
		'section'  => $section,
		'settings' => $result,
		'count'    => count( $result ),
	);
}

/**
 * Return all theme_mods in chunks of 50 to avoid OOM.
 *
 * @param array $args { page: int, per_page: int }
 */
function fse_mcp_tool_theme_mods_chunked( array $args ): array {
	$page     = max( 1, (int) ( $args['page'] ?? 1 ) );
	$per_page = min( 100, max( 1, (int) ( $args['per_page'] ?? 50 ) ) );

	$all_mods = get_theme_mods();
	if ( ! is_array( $all_mods ) ) {
		$all_mods = array();
	}

	$keys        = array_keys( $all_mods );
	$total       = count( $keys );
	$total_pages = (int) ceil( $total / $per_page );
	$offset      = ( $page - 1 ) * $per_page;
	$chunk_keys  = array_slice( $keys, $offset, $per_page );

	$chunk = array();
	foreach ( $chunk_keys as $k ) {
		$chunk[ $k ] = $all_mods[ $k ];
	}

	return array(
		'page'        => $page,
		'per_page'    => $per_page,
		'total'       => $total,
		'total_pages' => $total_pages,
		'mods'        => $chunk,
	);
}

/**
 * Map nbcore customizer options → theme.json equivalents.
 * Returns a diff of suggested theme.json changes.
 */
function fse_mcp_tool_customizer_to_theme_json( array $args ): array {
	$mods = get_theme_mods();

	$mapping = array();

	// Color palette mappings (nbcore convention)
	$color_keys = array(
		'nbcore_color_primary'    => 'primary',
		'nbcore_color_secondary'  => 'secondary',
		'nbcore_color_accent'     => 'accent',
		'nbcore_header_bg'        => 'header-bg',
		'nbcore_footer_bg'        => 'footer-bg',
		'primary_color'           => 'primary',
		'secondary_color'         => 'secondary',
		'header_bg_color'         => 'header-bg',
		'footer_bg_color'         => 'footer-bg',
	);

	$palette = array();
	foreach ( $color_keys as $mod_key => $slug ) {
		if ( isset( $mods[ $mod_key ] ) && $mods[ $mod_key ] ) {
			$palette[ $slug ] = array(
				'slug'  => $slug,
				'color' => sanitize_hex_color( $mods[ $mod_key ] ),
				'name'  => ucwords( str_replace( '-', ' ', $slug ) ),
			);
		}
	}

	// Typography mappings
	$font_keys = array(
		'nbcore_font_body'    => 'body',
		'nbcore_font_heading' => 'heading',
		'body_font_family'    => 'body',
		'heading_font_family' => 'heading',
	);

	$font_families = array();
	foreach ( $font_keys as $mod_key => $slug ) {
		if ( isset( $mods[ $mod_key ] ) && $mods[ $mod_key ] ) {
			$font_families[ $slug ] = array(
				'slug'       => $slug,
				'fontFamily' => sanitize_text_field( $mods[ $mod_key ] ),
				'name'       => ucfirst( $slug ),
			);
		}
	}

	// Layout mappings
	$layout = array();
	$width_keys = array(
		'nbcore_content_width' => 'contentSize',
		'content_width'        => 'contentSize',
		'nbcore_wide_width'    => 'wideSize',
	);
	foreach ( $width_keys as $mod_key => $json_key ) {
		if ( isset( $mods[ $mod_key ] ) && $mods[ $mod_key ] ) {
			$layout[ $json_key ] = (int) $mods[ $mod_key ] . 'px';
		}
	}

	return array(
		'suggested_theme_json_diff' => array(
			'settings' => array(
				'color'      => array( 'palette' => array_values( $palette ) ),
				'typography' => array( 'fontFamilies' => array_values( $font_families ) ),
				'layout'     => $layout,
			),
		),
		'raw_mods_count' => count( $mods ),
		'matched_mods'   => count( $palette ) + count( $font_families ) + count( $layout ),
		'note'           => 'Review and merge into converted-theme/theme.json manually or via apply_theme_json_diff tool',
	);
}

/**
 * Get all registered nav menus with their items.
 */
function fse_mcp_tool_nav_menus( array $args ): array {
	$locations  = get_nav_menu_locations();
	$registered = get_registered_nav_menus();
	$result     = array();

	foreach ( $registered as $location => $description ) {
		$menu_id = $locations[ $location ] ?? 0;
		$items   = array();
		if ( $menu_id ) {
			$raw = wp_get_nav_menu_items( $menu_id );
			if ( $raw ) {
				foreach ( $raw as $item ) {
					$items[] = array(
						'id'        => $item->ID,
						'title'     => $item->title,
						'url'       => $item->url,
						'parent'    => $item->menu_item_parent,
						'object'    => $item->object,
						'object_id' => $item->object_id,
					);
				}
			}
		}
		$result[ $location ] = array(
			'description' => $description,
			'menu_id'     => $menu_id,
			'items'       => $items,
		);
	}

	return $result;
}

/**
 * Create a wp_navigation post from a classic nav menu location.
 *
 * @param array $args { location: string }
 * @return array { navigation_id: int, ref: int }
 */
function fse_mcp_tool_create_fse_navigation( array $args ): array {
	$location = sanitize_key( $args['location'] ?? 'primary' );
	$locations = get_nav_menu_locations();
	$menu_id   = $locations[ $location ] ?? 0;

	if ( ! $menu_id ) {
		throw new \RuntimeException( "No menu assigned to location: $location" );
	}

	$menu  = wp_get_nav_menu_object( $menu_id );
	$items = wp_get_nav_menu_items( $menu_id );

	// Build inner blocks for wp:navigation-link
	$blocks = '';
	if ( $items ) {
		foreach ( $items as $item ) {
			if ( $item->menu_item_parent ) {
				continue; // Skip sub-items for now (top-level only)
			}
			$blocks .= sprintf(
				'<!-- wp:navigation-link {"label":"%s","url":"%s","kind":"custom"} /-->',
				esc_attr( $item->title ),
				esc_url( $item->url )
			);
		}
	}

	$nav_content = '<!-- wp:navigation -->' . $blocks . '<!-- /wp:navigation -->';

	// Check if a nav post already exists for this location
	$existing = get_posts( array(
		'post_type'   => 'wp_navigation',
		'post_status' => 'publish',
		'meta_key'    => '_fse_mcp_location',
		'meta_value'  => $location,
		'numberposts' => 1,
	) );

	if ( $existing ) {
		$nav_id = $existing[0]->ID;
		wp_update_post( array(
			'ID'           => $nav_id,
			'post_content' => $nav_content,
		) );
	} else {
		$nav_id = wp_insert_post( array(
			'post_type'    => 'wp_navigation',
			'post_status'  => 'publish',
			'post_title'   => $menu->name,
			'post_content' => $nav_content,
		), true );

		if ( is_wp_error( $nav_id ) ) {
			throw new \RuntimeException( $nav_id->get_error_message() );
		}

		update_post_meta( $nav_id, '_fse_mcp_location', $location );
	}

	return array(
		'navigation_id' => $nav_id,
		'ref'           => $nav_id,
		'menu_name'     => $menu->name,
		'location'      => $location,
		'items_count'   => count( $items ),
		'next_step'     => "Update wp:navigation {\"ref\":{$nav_id}} in parts/header.html",
	);
}

/**
 * List existing wp_navigation posts.
 */
function fse_mcp_tool_fse_navigation_posts( array $args ): array {
	$posts = get_posts( array(
		'post_type'   => 'wp_navigation',
		'post_status' => array( 'publish', 'draft' ),
		'numberposts' => 20,
	) );

	$result = array();
	foreach ( $posts as $post ) {
		$result[] = array(
			'id'       => $post->ID,
			'title'    => $post->post_title,
			'status'   => $post->post_status,
			'modified' => $post->post_modified,
			'location' => get_post_meta( $post->ID, '_fse_mcp_location', true ),
		);
	}

	return $result;
}

/**
 * Get all active widget areas and their widgets.
 */
function fse_mcp_tool_widgets( array $args ): array {
	global $wp_registered_sidebars, $wp_registered_widgets;

	$result = array();
	$sidebars_widgets = get_option( 'sidebars_widgets', array() );

	foreach ( $wp_registered_sidebars as $sidebar_id => $sidebar ) {
		if ( 'wp_inactive_widgets' === $sidebar_id ) {
			continue;
		}

		$widget_ids = $sidebars_widgets[ $sidebar_id ] ?? array();
		$widgets    = array();

		foreach ( $widget_ids as $widget_id ) {
			if ( ! isset( $wp_registered_widgets[ $widget_id ] ) ) {
				continue;
			}
			$widget         = $wp_registered_widgets[ $widget_id ];
			$widget_base_id = preg_replace( '/-\d+$/', '', $widget_id );
			$instance_num   = (int) preg_replace( '/^.*-(\d+)$/', '$1', $widget_id );

			$options    = get_option( 'widget_' . $widget_base_id, array() );
			$instance   = $options[ $instance_num ] ?? array();

			$widgets[] = array(
				'id'       => $widget_id,
				'name'     => $widget['name'],
				'instance' => $instance,
			);
		}

		$result[ $sidebar_id ] = array(
			'name'    => $sidebar['name'],
			'widgets' => $widgets,
		);
	}

	return $result;
}

/**
 * Install a theme from a URL or just return placeholder instructions.
 */
function fse_mcp_tool_install_theme( array $args ): array {
	// This tool is a proxy for the existing fse-conversion/v1/upload-theme endpoint.
	// Claude Code should use deploy.ts instead. This tool returns instructions.
	return array(
		'message' => 'Use npm run deploy from the local project to upload the theme ZIP.',
		'endpoint' => get_rest_url( null, 'fse-conversion/v1/upload-theme' ),
	);
}

/**
 * Switch active theme.
 *
 * @param array $args { stylesheet: string }
 */
function fse_mcp_tool_switch_theme( array $args ): array {
	$stylesheet = sanitize_text_field( $args['stylesheet'] ?? '' );
	if ( ! $stylesheet ) {
		throw new \InvalidArgumentException( 'stylesheet is required' );
	}

	$theme = wp_get_theme( $stylesheet );
	if ( ! $theme->exists() ) {
		throw new \RuntimeException( "Theme not found: $stylesheet" );
	}

	switch_theme( $stylesheet );

	return array(
		'switched_to' => $stylesheet,
		'theme_name'  => $theme->get( 'Name' ),
		'active_theme' => get_stylesheet(),
	);
}

/**
 * Return URLs to screenshot for visual comparison.
 */
function fse_mcp_tool_capture_urls( array $args ): array {
	$pages = get_pages( array( 'number' => 20 ) );
	$cats  = get_categories( array( 'number' => 5 ) );
	$posts = get_posts( array( 'numberposts' => 5 ) );

	$urls = array(
		'front_page' => get_home_url(),
		'search'     => get_home_url( null, '/?s=test' ),
		'search_empty' => get_home_url( null, '/?s=xyzzy_no_results_fse' ),
		'404'        => get_home_url( null, '/this-page-does-not-exist-fse-test/' ),
	);

	foreach ( $pages as $page ) {
		$urls[ 'page_' . $page->post_name ] = get_permalink( $page );
	}

	foreach ( $cats as $cat ) {
		$urls[ 'category_' . $cat->slug ] = get_category_link( $cat->term_id );
	}

	foreach ( $posts as $post ) {
		$urls[ 'post_' . $post->post_name ] = get_permalink( $post );
	}

	return $urls;
}

// ─── Tools Schema (for tools/list) ──────────────────────────────────────────

function fse_mcp_tools_list(): array {
	return array(
		array(
			'name'        => 'get_site_info',
			'description' => 'Get WordPress version, active theme, plugins, and server info.',
			'inputSchema' => array( 'type' => 'object', 'properties' => array() ),
		),
		array(
			'name'        => 'get_customizer_section',
			'description' => 'Get customizer settings for a single section (avoids OOM). Use get_site_info first to discover available sections.',
			'inputSchema' => array(
				'type'       => 'object',
				'properties' => array(
					'section' => array( 'type' => 'string', 'description' => 'Customizer section ID (e.g. "colors", "typography", "header_image")' ),
				),
				'required'   => array( 'section' ),
			),
		),
		array(
			'name'        => 'get_all_theme_mods_chunked',
			'description' => 'Get all theme_mods in paginated chunks to avoid OOM errors.',
			'inputSchema' => array(
				'type'       => 'object',
				'properties' => array(
					'page'     => array( 'type' => 'integer', 'default' => 1 ),
					'per_page' => array( 'type' => 'integer', 'default' => 50, 'maximum' => 100 ),
				),
			),
		),
		array(
			'name'        => 'get_customizer_to_theme_json',
			'description' => 'Analyze nbcore customizer settings and return suggested theme.json diff for colors, fonts, and layout.',
			'inputSchema' => array( 'type' => 'object', 'properties' => array() ),
		),
		array(
			'name'        => 'get_nav_menus',
			'description' => 'Get all registered navigation menu locations with their items from the database.',
			'inputSchema' => array( 'type' => 'object', 'properties' => array() ),
		),
		array(
			'name'        => 'create_fse_navigation',
			'description' => 'Create a wp_navigation post from a classic nav menu location. Returns the navigation post ID to use as ref in wp:navigation block.',
			'inputSchema' => array(
				'type'       => 'object',
				'properties' => array(
					'location' => array( 'type' => 'string', 'description' => 'Nav menu location slug (e.g. "primary", "footer")' ),
				),
				'required'   => array( 'location' ),
			),
		),
		array(
			'name'        => 'get_fse_navigation_posts',
			'description' => 'List all existing wp_navigation posts (FSE menus).',
			'inputSchema' => array( 'type' => 'object', 'properties' => array() ),
		),
		array(
			'name'        => 'get_widgets',
			'description' => 'Get all active widget areas with their widget configurations.',
			'inputSchema' => array( 'type' => 'object', 'properties' => array() ),
		),
		array(
			'name'        => 'switch_theme',
			'description' => 'Switch the active WordPress theme.',
			'inputSchema' => array(
				'type'       => 'object',
				'properties' => array(
					'stylesheet' => array( 'type' => 'string', 'description' => 'Theme stylesheet slug' ),
				),
				'required'   => array( 'stylesheet' ),
			),
		),
		array(
			'name'        => 'get_capture_urls',
			'description' => 'Get a list of URLs to use for visual screenshot capture.',
			'inputSchema' => array( 'type' => 'object', 'properties' => array() ),
		),
	);
}
