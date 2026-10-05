<?php
/**
 * Plugin Name: Caspian Games News Block
 * Description: Блок «Каспий ойындары – 2026»: заголовок-баннер и последние новости из рубрики или по тегу. Шорткод [caspian_news].
 * Version:     1.1.0
 * Author:      Yessenov University
 * Text Domain: caspian-games-news
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'CGN_VERSION', '1.1.0' );

/**
 * Styles are only enqueued on pages that actually render the block.
 */
function cgn_register_assets() {
	wp_register_style(
		'caspian-games-news',
		plugins_url( 'assets/style.css', __FILE__ ),
		array(),
		CGN_VERSION
	);
}
add_action( 'wp_enqueue_scripts', 'cgn_register_assets' );

/**
 * Current site language: Polylang, then WPML, then the WordPress locale.
 * Returns "kk", "ru" or "en".
 */
function cgn_current_lang() {
	$code = '';
	if ( function_exists( 'pll_current_language' ) ) {
		$code = (string) pll_current_language( 'slug' );
	} elseif ( defined( 'ICL_LANGUAGE_CODE' ) ) {
		$code = (string) ICL_LANGUAGE_CODE;
	} else {
		$code = substr( determine_locale(), 0, 2 );
	}
	$code = strtolower( $code );
	if ( 'kz' === $code ) {
		$code = 'kk';
	}
	return in_array( $code, array( 'kk', 'ru', 'en' ), true ) ? $code : 'kk';
}

/**
 * Per-language defaults: tag slug and texts.
 */
function cgn_defaults( $lang ) {
	$all = array(
		'kk' => array(
			'tag'       => 'kaspij-ojyndary',
			'title'     => 'Каспий ойындары – 2026',
			'subtitle'  => 'VIII халықаралық студенттік ойындар',
			'dates'     => '5–9 қазан · Ақтау',
			'more_text' => 'Барлық жаңалықтар',
			'site_url'  => 'https://sport.yu.edu.kz/?lang=kk',
			'site_text' => 'Ойындар сайты',
			'empty'     => 'Жаңалықтар әзірге жоқ.',
		),
		'ru' => array(
			'tag'       => 'kaspijskie-igry',
			'title'     => 'Каспийские игры – 2026',
			'subtitle'  => 'VIII Международные студенческие игры',
			'dates'     => '5–9 октября · Актау',
			'more_text' => 'Все новости',
			'site_url'  => 'https://sport.yu.edu.kz/?lang=ru',
			'site_text' => 'Сайт игр',
			'empty'     => 'Новостей пока нет.',
		),
		'en' => array(
			'tag'       => 'caspian-games',
			'title'     => 'Caspian Games 2026',
			'subtitle'  => 'VIII International Student Games',
			'dates'     => 'October 5–9 · Aktau',
			'more_text' => 'All news',
			'site_url'  => 'https://sport.yu.edu.kz/?lang=en',
			'site_text' => 'Games website',
			'empty'     => 'No news yet.',
		),
	);
	return $all[ $lang ];
}

/**
 * [caspian_news]
 *
 * Without attributes the block picks the tag and texts for the current
 * site language (kk: kaspij-ojyndary, ru: kaspijskie-igry, en: caspian-games).
 *
 * Attributes (all optional):
 *   lang      — force a language: kk, ru or en.
 *   tag       — tag slug. If no tag has this slug but a category does,
 *               the category is used.
 *   category  — category slug; used instead of tag when set.
 *   count     — number of posts (default 6).
 *   title     — block heading.
 *   subtitle  — small line above the heading.
 *   dates     — dates / place line under the heading.
 *   more_text — "all news" link text.
 *   site_url  — Games website link (empty to hide the button).
 *   site_text — Games website button text.
 */
function cgn_shortcode( $atts ) {
	$atts = (array) $atts;
	$lang = isset( $atts['lang'] ) && in_array( $atts['lang'], array( 'kk', 'ru', 'en' ), true )
		? $atts['lang']
		: cgn_current_lang();

	$atts = shortcode_atts(
		array_merge(
			cgn_defaults( $lang ),
			array(
				'lang'     => $lang,
				'category' => '',
				'count'    => 6,
			)
		),
		$atts,
		'caspian_news'
	);

	$query_args = array(
		'post_type'           => 'post',
		'post_status'         => 'publish',
		'posts_per_page'      => max( 1, min( 24, (int) $atts['count'] ) ),
		'ignore_sticky_posts' => true,
		'no_found_rows'       => true,
	);

	$term = null;
	if ( '' !== $atts['category'] ) {
		$query_args['category_name'] = sanitize_title( $atts['category'] );
		$term                        = get_category_by_slug( $query_args['category_name'] );
	} else {
		$slug = sanitize_title( $atts['tag'] );
		$term = get_term_by( 'slug', $slug, 'post_tag' );
		if ( $term ) {
			$query_args['tag'] = $slug;
		} else {
			$term = get_category_by_slug( $slug );
			if ( $term ) {
				$query_args['category_name'] = $slug;
			} else {
				$query_args['tag'] = $slug;
			}
		}
	}

	$more_url = ( $term && ! is_wp_error( $term ) ) ? get_term_link( $term ) : '';
	if ( is_wp_error( $more_url ) ) {
		$more_url = '';
	}

	$posts = new WP_Query( $query_args );

	wp_enqueue_style( 'caspian-games-news' );

	ob_start();
	?>
	<section class="cgn">
		<header class="cgn-head">
			<div class="cgn-head__text">
				<p class="cgn-head__eyebrow"><?php echo esc_html( $atts['subtitle'] ); ?></p>
				<h2 class="cgn-head__title"><?php echo esc_html( $atts['title'] ); ?></h2>
				<p class="cgn-head__dates"><?php echo esc_html( $atts['dates'] ); ?></p>
			</div>
			<div class="cgn-head__actions">
				<?php if ( $more_url ) : ?>
					<a class="cgn-btn cgn-btn--ghost" href="<?php echo esc_url( $more_url ); ?>"><?php echo esc_html( $atts['more_text'] ); ?> →</a>
				<?php endif; ?>
				<?php if ( '' !== $atts['site_url'] ) : ?>
					<a class="cgn-btn" href="<?php echo esc_url( $atts['site_url'] ); ?>" target="_blank" rel="noopener"><?php echo esc_html( $atts['site_text'] ); ?></a>
				<?php endif; ?>
			</div>
		</header>

		<?php if ( $posts->have_posts() ) : ?>
			<div class="cgn-grid">
				<?php
				while ( $posts->have_posts() ) :
					$posts->the_post();
					?>
					<article class="cgn-card">
						<a class="cgn-card__media" href="<?php the_permalink(); ?>" tabindex="-1" aria-hidden="true">
							<?php if ( has_post_thumbnail() ) : ?>
								<?php the_post_thumbnail( 'medium_large', array( 'loading' => 'lazy' ) ); ?>
							<?php else : ?>
								<span class="cgn-card__placeholder">CG</span>
							<?php endif; ?>
						</a>
						<div class="cgn-card__body">
							<time class="cgn-card__date" datetime="<?php echo esc_attr( get_the_date( 'c' ) ); ?>"><?php echo esc_html( get_the_date() ); ?></time>
							<h3 class="cgn-card__title"><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h3>
							<p class="cgn-card__excerpt"><?php echo esc_html( wp_trim_words( get_the_excerpt(), 18, '…' ) ); ?></p>
						</div>
					</article>
				<?php endwhile; ?>
			</div>
		<?php else : ?>
			<p class="cgn-empty"><?php echo esc_html( $atts['empty'] ); ?></p>
		<?php endif; ?>
	</section>
	<?php
	wp_reset_postdata();

	return ob_get_clean();
}
add_shortcode( 'caspian_news', 'cgn_shortcode' );
