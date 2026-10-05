/* Yessenov University · Caspian Games 2026 · news block script (KK/RU/EN).
   Woody snippet type: JavaScript, run everywhere (site-wide). It does nothing on
   pages without a .yucgn block. */
(function () {
  var TEXTS = {
    "kk": {
      "slug": "kaspij-ojyndary",
      "locale": "kk-KZ",
      "read": "Толығырақ →",
      "tag": "Caspian Games",
      "empty": "Жаңалықтар әзірге жоқ.",
      "error": "Жаңалықтарды жүктеу мүмкін болмады."
    },
    "ru": {
      "slug": "kaspijskie-igry",
      "locale": "ru-RU",
      "read": "Подробнее →",
      "tag": "Caspian Games",
      "empty": "Новостей пока нет.",
      "error": "Не удалось загрузить новости."
    },
    "en": {
      "slug": "caspian-games",
      "locale": "en-GB",
      "read": "Read more →",
      "tag": "Caspian Games",
      "empty": "No news yet.",
      "error": "Could not load news."
    }
  };
  var LOGO = "https://global.yu.edu.kz/wp-content/uploads/2026/02/blue_logo.png";

  // Escaping without HTML-entity literals in the source, so WordPress editors cannot decode them.
  var A = String.fromCharCode(38);
  function esc(s) {
    return String(s)
      .split(A).join(A + "amp;")
      .split("<").join(A + "lt;")
      .split(">").join(A + "gt;")
      .split('"').join(A + "quot;");
  }
  function text(html) {
    var d = document.createElement("div");
    d.innerHTML = html || "";
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  }
  function trimWords(s, n) {
    var w = s.split(" ");
    return w.length > n ? w.slice(0, n).join(" ") + "…" : s;
  }
  function getJSON(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
      return r.json();
    });
  }

  function init(root) {
    if (root.getAttribute("data-ready")) return;
    root.setAttribute("data-ready", "1");

    var lang = root.getAttribute("data-lang") || "kk";
    var T = TEXTS[lang] || TEXTS.kk;
    var API = root.getAttribute("data-api") || "/wp-json/wp/v2/";
    var COUNT = parseInt(root.getAttribute("data-count"), 10) || 6;
    var SLUG = root.getAttribute("data-slug") || T.slug;
    var grid = root.querySelector(".yucgn-grid");
    var moreBtn = root.querySelector(".yucgn-btn--outline");

    function api(path) {
      return API + path.replace("?", API.indexOf("?") === -1 ? "?" : A);
    }
    function fmtDate(iso) {
      try { return new Date(iso).toLocaleDateString(T.locale, { day: "numeric", month: "long", year: "numeric" }); }
      catch (e) { return iso.slice(0, 10); }
    }
    function message(msg) {
      grid.outerHTML = '<p class="yucgn-empty">' + esc(msg) + "<\/p>";
    }

    getJSON(api("tags?slug=" + encodeURIComponent(SLUG)))
      .then(function (tags) {
        if (tags.length) return { tax: "tags", term: tags[0] };
        return getJSON(api("categories?slug=" + encodeURIComponent(SLUG))).then(function (cats) {
          return cats.length ? { tax: "categories", term: cats[0] } : null;
        });
      })
      .then(function (found) {
        if (!found) {
          console.warn("[yucgn] no tag or category with slug", SLUG);
          return [];
        }
        moreBtn.href = found.term.link;
        moreBtn.hidden = false;
        return getJSON(api("posts?" + found.tax + "=" + found.term.id + A + "per_page=" + COUNT + A + "_embed=wp:featuredmedia"));
      })
      .then(function (posts) {
        if (!posts.length) return message(T.empty);
        grid.innerHTML = posts.map(function (p) {
          var m = ((p._embedded || {})["wp:featuredmedia"] || [])[0];
          var img;
          if ((m || {}).source_url) {
            var s = (m.media_details || {}).sizes || {};
            var src = (s.medium_large || s.large || s.medium || {}).source_url || m.source_url;
            img = '<img src="' + esc(src) + '" alt="" loading="lazy">';
          } else {
            img = '<span class="yucgn-ph"><img src="' + LOGO + '" alt=""><\/span>';
          }
          return '<article class="yucgn-card">' +
            '<a class="yucgn-media" href="' + esc(p.link) + '" tabindex="-1" aria-hidden="true">' + img +
              '<span class="yucgn-tag">' + esc(T.tag) + "<\/span><\/a>" +
            '<div class="yucgn-body">' +
              '<time class="yucgn-date" datetime="' + esc(p.date) + '">' + esc(fmtDate(p.date)) + "<\/time>" +
              '<h3><a href="' + esc(p.link) + '">' + esc(text((p.title || {}).rendered)) + "<\/a><\/h3>" +
              '<p class="yucgn-excerpt">' + esc(trimWords(text((p.excerpt || {}).rendered), 20)) + "<\/p>" +
              '<a class="yucgn-more" href="' + esc(p.link) + '">' + esc(T.read) + "<\/a>" +
            "<\/div><\/article>";
        }).join("");
      })
      .catch(function (e) {
        console.error("[yucgn]", e);
        message(T.error);
      });
  }

  function run() {
    var blocks = document.querySelectorAll(".yucgn[data-lang]");
    for (var i = 0; i < blocks.length; i++) init(blocks[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
