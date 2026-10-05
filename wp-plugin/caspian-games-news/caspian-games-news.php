<?php
/**
 * Plugin Name: Caspian Games News Block
 * Description: Блок «Каспий ойындары – 2026»: заголовок-баннер и последние новости из рубрики или по тегу. Шорткод [caspian_news].
 * Version:     1.0.0
 * Author:      Yessenov University
 * Text Domain: caspian-games-news
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'CGN_VERSION', '1.0.0' );

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
 * [caspian_news]
 *
 * Attributes:
 *   tag       — tag slug (e.g. "kaspij-ojyndary").
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
	$atts = shortcode_atts(
		array(
			'tag'       => 'caspian-games',
			'category'  => '',
			'count'     => 6,
			'title'     => 'Каспий ойындары – 2026',
			'subtitle'  => 'VIII халықаралық студенттік ойындар',
			'dates'     => '5–9 қазан · Ақтау',
			'more_text' => 'Барлық жаңалықтар',
			'site_url'  => 'https://sport.yu.edu.kz',
			'site_text' => 'Ойындар сайты',
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
		$query_args['tag'] = sanitize_title( $atts['tag'] );
		$term              = get_term_by( 'slug', $query_args['tag'], 'post_tag' );
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
			<p class="cgn-empty">Жаңалықтар әзірге жоқ.</p>
		<?php endif; ?>
	</section>
	<?php
	wp_reset_postdata();

	return ob_get_clean();
}
add_shortcode( 'caspian_news', 'cgn_shortcode' );
