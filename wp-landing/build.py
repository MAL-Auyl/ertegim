import re, pathlib
here = pathlib.Path(__file__).parent
base = (here/'base.html').read_text(encoding='utf-8')
app = (here/'app.js').read_text(encoding='utf-8')
CG_LOGO = "https://yu.edu.kz/wp-content/uploads/2026/10/whatsapp-image-2026-10-05-at-11.34.19.jpeg"

NEWS_CSS = r'''
/* ===== Brand: Caspian Games logo ===== */
#cg .nav__cg {
  height: 40px; width: auto; max-width: 120px; object-fit: contain;
  padding-left: 12px; margin-left: 2px; border-left: 1px solid var(--border);
}
#cg .hero__logo {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--white); border-radius: 18px; padding: 10px 14px; margin-bottom: 22px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
}
#cg .hero__logo img { height: 72px; width: auto; max-width: 220px; object-fit: contain; }

/* ===== News ===== */
#cg .news__chips {
  display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none;
  padding: 4px 2px 8px; margin-bottom: 24px;
}
#cg .news__chips::-webkit-scrollbar { display: none; }
#cg .nchip {
  flex: none; border: 1px solid var(--border); background: var(--white); color: var(--navy);
  font: 600 13px/1 var(--font); min-height: 40px; padding: 10px 16px; border-radius: 30px; cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--t) var(--ease), color var(--t) var(--ease), border-color var(--t) var(--ease), transform var(--t-fast) var(--ease-out);
}
#cg .nchip:hover { border-color: var(--accent); }
#cg .nchip:active { transform: scale(0.95); }
#cg .nchip[aria-pressed="true"] { background: var(--blue); border-color: var(--blue); color: var(--white); }

#cg .news__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}
#cg .news__grid > .empty { grid-column: 1 / -1; }
#cg .ncard {
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--white); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow-sm);
  transition: transform var(--t) var(--ease-out), box-shadow var(--t) var(--ease), border-color var(--t) var(--ease);
}
@media (hover: hover) {
  #cg .ncard:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: rgba(0, 170, 255, 0.5); }
  #cg .ncard:hover .ncard__media img:not(.ncard__logo) { transform: scale(1.04); }
}
#cg .ncard--big { grid-column: span 2; grid-row: span 2; }
#cg .ncard__media {
  position: relative; display: block; aspect-ratio: 16 / 10; overflow: hidden;
  background: linear-gradient(135deg, var(--light), #e3ecf7);
}
#cg .ncard--big .ncard__media { aspect-ratio: auto; flex: 1; min-height: 280px; }
#cg .ncard__media img {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.5s var(--ease-out);
}
#cg .ncard__media img.ncard__logo {
  inset: 0; margin: auto; width: 46%; height: 70%; object-fit: contain; mix-blend-mode: multiply;
}
#cg .ncard__body { display: flex; flex-direction: column; gap: 10px; padding: 20px 22px 22px; }
#cg .ncard--big .ncard__body { padding: 26px 28px 28px; }
#cg .ncard__date {
  align-self: flex-start; font-family: var(--mono); font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
  color: var(--navy); background: var(--light); border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px;
}
#cg .ncard__title { font-size: 17px; font-weight: 800; line-height: 1.35; color: var(--navy); }
#cg .ncard--big .ncard__title { font-size: clamp(20px, 2.2vw, 26px); line-height: 1.25; letter-spacing: -0.01em; }
#cg .ncard__title a { color: inherit; }
#cg .ncard__title a:hover { color: var(--accent-ink); }
#cg .ncard__excerpt { font-size: 14px; line-height: 1.65; color: var(--muted); }
#cg .ncard--big .ncard__excerpt { font-size: 15px; }
#cg .ncard__more { font-family: var(--mono); font-size: 12px; font-weight: 700; color: var(--accent-ink); }
#cg .ncard__more:hover { color: var(--navy); }
#cg .nskel {
  min-height: 300px; border-radius: 16px; border: 1px solid var(--border);
  background: linear-gradient(90deg, var(--light) 25%, #f8fbfe 50%, var(--light) 75%);
  background-size: 200% 100%; animation: cg-shimmer 1.2s infinite;
}
#cg .nskel--big { grid-column: span 2; grid-row: span 2; }
@keyframes cg-shimmer { to { background-position: -200% 0; } }

@media (max-width: 900px) {
  #cg .news__grid { grid-template-columns: 1fr 1fr; gap: 18px; }
  #cg .ncard--big, #cg .nskel--big { grid-row: auto; }
  #cg .nav__cg { height: 34px; }
}
@media (max-width: 600px) {
  #cg .news__grid { grid-template-columns: 1fr; }
  #cg .ncard--big, #cg .nskel--big { grid-column: auto; }
  #cg .ncard--big .ncard__media { aspect-ratio: 16 / 10; min-height: 0; flex: none; }
  #cg .nskel:nth-child(n+2) { display: none; }
  #cg .hero__logo img { height: 56px; }
  #cg .news__head .btn { width: 100%; }
}
'''

NEWS_HTML = '''  <!-- ===== News (рубрика/тег) ===== -->
  <section class="section" id="news">
    <div class="wrap">
      <div class="section__head section__head--row news__head">
        <div>
          <p class="eyebrow" data-i18n="news.eyebrow">Жаңалықтар</p>
          <h2 class="section__title" data-i18n="news.title">Ойындардың соңғы жаңалықтары</h2>
        </div>
        <a class="btn btn--outline" id="news-all" href="#"><span data-i18n="news.allNews">Барлық жаңалықтар</span> →</a>
      </div>
      <div class="news__chips" id="news-chips" role="group"></div>
      <div class="news__grid" id="news-grid"></div>
    </div>
  </section>
'''

RESULTS_SCRIPT = '''<script>
/* =====================================================================
   НӘТИЖЕЛЕР / РЕЗУЛЬТАТЫ — меняйте только этот блок.
   updated: когда обновили, например "5.10.2026, 18:30".
   podium: { place: 1|2|3, name: "Команда или спортсмен", univ: "Университет", country: "kz|az|ir|ru|tm" }
   status (необязательно): "soon" | "live" | "done".
   note (необязательно): { kk: "...", ru: "...", en: "..." }
   ===================================================================== */
window.CG_RESULTS = {
  updated: "",
  sports: {
    swimming:   { podium: [] },
    boxing:     { podium: [] },
    basketball: { podium: [] },
    volleyball: { podium: [] },
    athletics:  { podium: [] },
    futsal:     { podium: [] },
    chess:      { podium: [] },
    esports:    { podium: [] },
    karate:     { podium: [] },
    sambo:      { podium: [] }
  }
};
</script>
'''

NAV_OLD = '''        <img src="https://global.yu.edu.kz/wp-content/uploads/2026/02/blue_logo.png" alt="" width="36" height="36">
        <span>YESSENOV UNIVERSITY</span>
      </a>'''
NAV_NEW = '''        <img src="https://global.yu.edu.kz/wp-content/uploads/2026/02/blue_logo.png" alt="" width="36" height="36">
        <span>YESSENOV UNIVERSITY</span>
        <img class="nav__cg" src="%s" alt="Caspian Games 2026">
      </a>''' % CG_LOGO
HERO_OLD = '''      <div class="hero__text">
        <p class="eyebrow eyebrow--pill"'''
HERO_NEW = '''      <div class="hero__text">
        <div class="hero__logo"><img src="%s" alt="Caspian Games 2026"></div>
        <p class="eyebrow eyebrow--pill"''' % CG_LOGO

LANGS = {'kk': ('Қазақша (kk)', 'kaspij-ojyndary', 'landing_caspian_games.html'),
         'ru': ('Русский (ru)', 'kaspijskie-igry', 'landing_caspian_games_ru.html'),
         'en': ('English (en)', 'caspian-games', 'landing_caspian_games_en.html')}

for lang, (name, slug, fname) in LANGS.items():
    s = base
    for a, b in [(NAV_OLD, NAV_NEW), (HERO_OLD, HERO_NEW), ('/*__NEWS_CSS__*/', NEWS_CSS.strip()),
                 ('<!--__NEWS_HTML__-->', NEWS_HTML), ('__LANGNAME__', name), ('__SLUG__', slug), ('__LANG__', lang)]:
        assert a in s, a[:40]
        s = s.replace(a, b)
    s = s.rstrip() + '\n\n' + RESULTS_SCRIPT + '<script>\n' + app + '</script>\n'
    (here/fname).write_text(s, encoding='utf-8')
    print(fname, len(s))
