import { makeZip } from '#lib/server/zip.ts';
import type { RequestHandler } from './$types';

/**
 * Downloadable WordPress plugin. This status site's address is baked in as the default,
 * so after Upload → Activate, [gg_seats] works with no setup.
 */
function pluginPhp(origin: string) {
	return `<?php
/**
 * Plugin Name:       GG Live Seats
 * Plugin URI:        ${origin}
 * Description:       Live PC availability from the GG Status board. Add [gg_seats] to any page for the full card, or [gg_seats style="compact"] for a one-line badge.
 * Version:           1.1.0
 * Requires at least: 5.0
 * Requires PHP:      7.0
 * Author:            GG Gaming Lounge
 * License:           GPL-2.0-or-later
 * Text Domain:       gg-seats
 */

if (!defined('ABSPATH')) {
	exit;
}

define('GG_SEATS_VERSION', '1.1.0');
define('GG_SEATS_DEFAULT_URL', '${origin}');

/** Address of the live status site (Settings → GG Live Seats). */
function gg_seats_url() {
	$url = get_option('gg_seats_url', GG_SEATS_DEFAULT_URL);
	if (!$url) {
		$url = GG_SEATS_DEFAULT_URL;
	}
	return untrailingslashit(esc_url_raw($url));
}

/**
 * [gg_seats]                       full live card
 * [gg_seats style="compact"]       one-line badge
 * [gg_seats theme="light"]         for light backgrounds
 * [gg_seats map="no"]              card without the mini seat map
 */
function gg_seats_shortcode($atts) {
	$a = shortcode_atts(
		array(
			'style' => 'card',
			'theme' => 'dark',
			'map'   => 'yes',
			'url'   => '',
		),
		$atts,
		'gg_seats'
	);

	$custom = $a['url'] ? untrailingslashit(esc_url_raw($a['url'])) : '';
	$url    = $custom ? $custom : gg_seats_url(); // a bad url="" falls back to the saved address
	$style = $a['style'] === 'compact' ? 'compact' : 'card';
	$theme = $a['theme'] === 'light' ? 'light' : 'dark';
	$map   = $a['map'] === 'no' ? 'no' : 'yes';

	wp_enqueue_script('gg-seats', $url . '/widget.js', array(), GG_SEATS_VERSION, true);

	return sprintf(
		'<div class="gg-seats" data-src="%s" data-style="%s" data-theme="%s" data-map="%s"></div>',
		esc_attr($url),
		esc_attr($style),
		esc_attr($theme),
		esc_attr($map)
	);
}
add_shortcode('gg_seats', 'gg_seats_shortcode');

/* ---------- Settings → GG Live Seats ---------- */

function gg_seats_register_settings() {
	register_setting(
		'gg_seats',
		'gg_seats_url',
		array(
			'type'              => 'string',
			'sanitize_callback' => 'esc_url_raw',
			'default'           => GG_SEATS_DEFAULT_URL,
		)
	);
}
add_action('admin_init', 'gg_seats_register_settings');

function gg_seats_menu() {
	add_options_page('GG Live Seats', 'GG Live Seats', 'manage_options', 'gg-seats', 'gg_seats_settings_page');
}
add_action('admin_menu', 'gg_seats_menu');

function gg_seats_settings_link($links) {
	array_unshift($links, '<a href="' . esc_url(admin_url('options-general.php?page=gg-seats')) . '">Settings</a>');
	return $links;
}
add_filter('plugin_action_links_' . plugin_basename(__FILE__), 'gg_seats_settings_link');

function gg_seats_settings_page() {
	if (!current_user_can('manage_options')) {
		return;
	}
	$url   = gg_seats_url();
	$codes = array(
		array('[gg_seats]', 'Full live card: PCs free, mini seat map of both floors, sims and consoles, and a button to the seat map.'),
		array('[gg_seats style="compact"]', 'One-line badge, e.g. "41 PCs free right now". Good for the homepage hero, header or sidebar.'),
		array('[gg_seats theme="light"]', 'The full card for light-coloured sections.'),
		array('[gg_seats map="no"]', 'The full card without the mini seat map.'),
	);
	?>
	<div class="wrap">
		<h1>GG Live Seats</h1>
		<p style="font-size:14px;max-width:720px">Shows live PC availability from the GG Status board. Paste a shortcode into any page, post or widget area (in the block editor, use a <strong>Shortcode</strong> block). It updates by itself every 30 seconds.</p>

		<h2>Shortcodes</h2>
		<table class="widefat striped" style="max-width:860px">
			<thead><tr><th style="width:280px">Shortcode</th><th>What it shows</th><th style="width:90px"></th></tr></thead>
			<tbody>
			<?php foreach ($codes as $c) : ?>
				<tr>
					<td><code style="font-size:13px"><?php echo esc_html($c[0]); ?></code></td>
					<td><?php echo esc_html($c[1]); ?></td>
					<td><button type="button" class="button gg-copy" data-code="<?php echo esc_attr($c[0]); ?>">Copy</button></td>
				</tr>
			<?php endforeach; ?>
			</tbody>
		</table>

		<h2 style="margin-top:28px">Live preview</h2>
		<div style="background:#000;padding:28px;max-width:860px;box-sizing:border-box">
			<div class="gg-seats" data-src="<?php echo esc_attr($url); ?>"></div>
			<div style="height:20px"></div>
			<div class="gg-seats" data-src="<?php echo esc_attr($url); ?>" data-style="compact"></div>
		</div>
		<script src="<?php echo esc_url($url . '/widget.js?ver=' . GG_SEATS_VERSION); ?>" defer></script>

		<h2 style="margin-top:28px">Settings</h2>
		<form method="post" action="options.php">
			<?php settings_fields('gg_seats'); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="gg_seats_url">Status board address</label></th>
					<td>
						<input name="gg_seats_url" id="gg_seats_url" type="url" class="regular-text" value="<?php echo esc_attr($url); ?>" />
						<p class="description">Only change this if the live status board moves to a new address.</p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<script>
	document.querySelectorAll('.gg-copy').forEach(function (b) {
		b.addEventListener('click', function () {
			navigator.clipboard.writeText(b.dataset.code).then(function () {
				var t = b.textContent;
				b.textContent = 'Copied ✓';
				setTimeout(function () { b.textContent = t; }, 1500);
			});
		});
	});
	</script>
	<?php
}
`;
}

function readme(origin: string) {
	return `=== GG Live Seats ===
Stable tag: 1.1.0

Live PC availability from the GG Status board (${origin}).

== Installation ==
1. WordPress admin → Plugins → Add New → Upload Plugin → choose gg-seats.zip → Install Now → Activate.
2. Add a Shortcode block to any page with:  [gg_seats]
3. More options and a live preview: Settings → GG Live Seats.

== Shortcodes ==
[gg_seats]                    Full live card
[gg_seats style="compact"]    One-line badge
[gg_seats theme="light"]      For light backgrounds
[gg_seats map="no"]           Card without the mini seat map
`;
}

export const GET: RequestHandler = ({ url }) => {
	const zip = makeZip([
		{ name: 'gg-seats/gg-seats.php', content: pluginPhp(url.origin) },
		{ name: 'gg-seats/readme.txt', content: readme(url.origin) }
	]);
	return new Response(zip as unknown as BodyInit, {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': 'attachment; filename="gg-seats.zip"',
			'cache-control': 'no-store'
		}
	});
};
