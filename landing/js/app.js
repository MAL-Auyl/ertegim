(function () {
  "use strict";

  // Aktau time is UTC+5 all year.
  var TZ_OFFSET_H = 5;
  var YEAR = 2026;
  var MONTH = 9; // October (0-based)
  var DAYS = [5, 6, 7, 8, 9];

  // ===== Venues =====
  var VENUES = {
    ysc: {
      icon: "🏟️",
      name: { kk: "Yessenov Спорт кешені", ru: "Спорткомплекс Yessenov", en: "Yessenov Sports Complex" },
      addr: { kk: "32 шағын аудан", ru: "32 мкр.", en: "32nd Microdistrict" },
      q: "Yessenov University спорт кешені Ақтау"
    },
    ys: {
      icon: "🏟️",
      name: { kk: "Yessenov Stadium", ru: "Yessenov Stadium", en: "Yessenov Stadium" },
      addr: { kk: "32 шағын аудан", ru: "32 мкр.", en: "32nd Microdistrict" },
      q: "Yessenov University стадион Ақтау"
    },
    atrium: {
      icon: "🏛️",
      name: { kk: "Yessenov Атриум", ru: "Атриум Yessenov", en: "Yessenov Atrium" },
      addr: { kk: "32 шағын аудан", ru: "32 мкр.", en: "32nd Microdistrict" },
      q: "Yessenov University Ақтау"
    },
    techno: {
      icon: "💻",
      name: { kk: "Yessenov Технопарк", ru: "Технопарк Yessenov", en: "Yessenov Technopark" },
      addr: { kk: "32 шағын аудан", ru: "32 мкр.", en: "32nd Microdistrict" },
      q: "Yessenov University технопарк Ақтау"
    },
    khalyk: {
      icon: "🥊",
      name: { kk: "Халық Арена", ru: "Халык Арена", en: "Khalyk Arena" },
      addr: { kk: "17 шағын аудан", ru: "17 мкр.", en: "17th Microdistrict" },
      q: "Халык Арена Актау"
    },
    mangystau: {
      icon: "🏐",
      name: { kk: "Маңғыстау Арена", ru: "Мангистау Арена", en: "Mangystau Arena" },
      addr: { kk: "33 шағын аудан", ru: "33 мкр.", en: "33rd Microdistrict" },
      q: "Мангистау Арена Актау"
    },
    bs: {
      icon: "⚽",
      name: { kk: "BS Arena", ru: "BS Arena", en: "BS Arena" },
      addr: { kk: "40 шағын аудан", ru: "40 мкр.", en: "40th Microdistrict" },
      q: "BS Arena Актау"
    },
    volna: {
      icon: "🌊",
      name: { kk: "«Волна» спорт кешені", ru: "Спорткомплекс «Волна»", en: "Volna Sports Complex" },
      addr: { kk: "5 шағын аудан", ru: "5 мкр.", en: "5th Microdistrict" },
      q: "спорткомплекс Волна Актау"
    },
    caspian: {
      icon: "🌊",
      name: { kk: "«Каспий» спорт кешені", ru: "Спорткомплекс «Каспий»", en: "Caspian Sports Complex" },
      addr: { kk: "4а шағын аудан, 47", ru: "4а мкр., 47", en: "4a Microdistrict, 47" },
      q: "спорткомплекс Каспий Актау 4а мкр 47"
    }
  };

  // ===== Sports =====
  var SPORTS = [
    { id: "swimming",   icon: "🏊", from: 5, to: 5, time: "10:00", venue: "ysc",       name: { kk: "Жүзу", ru: "Плавание", en: "Swimming" } },
    { id: "boxing",     icon: "🥊", from: 5, to: 8, time: "10:00", venue: "khalyk",    name: { kk: "Бокс", ru: "Бокс", en: "Boxing" } },
    { id: "basketball", icon: "🏀", from: 5, to: 6, time: "15:00", venue: "ysc",       name: { kk: "Баскетбол", ru: "Баскетбол", en: "Basketball" } },
    { id: "volleyball", icon: "🏐", from: 6, to: 7, time: "10:00", venue: "mangystau", name: { kk: "Волейбол", ru: "Волейбол", en: "Volleyball" } },
    { id: "athletics",  icon: "🏃", from: 6, to: 7, time: "10:00", venue: "ys",        name: { kk: "Жеңіл атлетика", ru: "Лёгкая атлетика", en: "Athletics" } },
    { id: "futsal",     icon: "⚽", from: 6, to: 7, time: "10:00", venue: "bs",        name: { kk: "Футзал", ru: "Футзал", en: "Futsal" } },
    { id: "chess",      icon: "♟️", from: 6, to: 6, time: "10:00", venue: "atrium",    name: { kk: "Шахмат", ru: "Шахматы", en: "Chess" } },
    { id: "esports",    icon: "🎮", from: 6, to: 6, time: "10:00", venue: "techno",    name: { kk: "Киберспорт", ru: "Киберспорт", en: "E-Sports" } },
    { id: "karate",     icon: "🥋", from: 8, to: 8, time: "10:00", venue: "volna",     name: { kk: "Каратэ-до", ru: "Каратэ-до", en: "Karate-Do" } },
    { id: "sambo",      icon: "🤼", from: 8, to: 8, time: "10:00", venue: "caspian",   name: { kk: "Самбо", ru: "Самбо", en: "Sambo" } }
  ];

  var CEREMONIES = [
    { day: 5, time: "14:00", venue: "ysc", key: "cer.open", icon: "🎉" },
    { day: 9, time: "17:00", venue: "ys",  key: "cer.close", icon: "🏆" }
  ];

  // ===== Translations =====
  var I18N = {
    kk: {
      "nav.schedule": "Кесте", "nav.sports": "Спорт түрлері", "nav.venues": "Орындар", "nav.gallery": "Афишалар",
      "hero.eyebrow": "VIII халықаралық студенттік ойындар",
      "hero.dates": "5–9 қазан", "hero.city": "Ақтау, Yessenov University",
      "hero.cta": "Кестені көру",
      "cd.d": "күн", "cd.h": "сағат", "cd.m": "минут", "cd.s": "секунд",
      "status.before": "Ашылу салтанатына дейін:",
      "status.live": "Ойындар жүріп жатыр!",
      "status.after": "Ойындар аяқталды. Барлық қатысушыларға рахмет!",
      "stats.countries": "ел", "stats.sports": "спорт түрі", "stats.venues": "спорт нысаны", "stats.days": "күн",
      "month": "қазан",
      "cer.open": "Ашылу салтанаты", "cer.close": "Жабылу салтанаты",
      "venue.ysc": "Yessenov Спорт кешені, 32 ш/а", "venue.ys": "Yessenov Stadium, 32 ш/а",
      "schedule.title": "Жарыстар кестесі",
      "schedule.lead": "Күнді таңдаңыз — сол күні өтетін жарыстар көрсетіледі.",
      "sports.title": "Спорт түрлері",
      "venues.title": "Өтетін орындар",
      "venues.lead": "Картадан ашу үшін нысанды басыңыз.",
      "gallery.title": "Афишалар",
      "footer.cta": "Трибунаға келіп, студенттерді қолдаңыз! 🏆",
      "tag.ceremony": "Салтанат", "tag.final": "Соңғы күн", "tag.day": "{n}-күн",
      "weekdays": ["Жс", "Дс", "Сс", "Ср", "Бс", "Жм", "Сб"],
      "title": "Caspian Games 2026 — Ақтау"
    },
    ru: {
      "nav.schedule": "Расписание", "nav.sports": "Виды спорта", "nav.venues": "Площадки", "nav.gallery": "Афиши",
      "hero.eyebrow": "VIII Международные студенческие игры",
      "hero.dates": "5–9 октября", "hero.city": "Актау, Yessenov University",
      "hero.cta": "Смотреть расписание",
      "cd.d": "дней", "cd.h": "часов", "cd.m": "минут", "cd.s": "секунд",
      "status.before": "До церемонии открытия:",
      "status.live": "Игры идут прямо сейчас!",
      "status.after": "Игры завершены. Спасибо всем участникам!",
      "stats.countries": "стран", "stats.sports": "видов спорта", "stats.venues": "площадок", "stats.days": "дней",
      "month": "октября",
      "cer.open": "Церемония открытия", "cer.close": "Церемония закрытия",
      "venue.ysc": "Спорткомплекс Yessenov, 32 мкр.", "venue.ys": "Yessenov Stadium, 32 мкр.",
      "schedule.title": "Расписание соревнований",
      "schedule.lead": "Выберите день — покажем соревнования, которые пройдут в этот день.",
      "sports.title": "Виды спорта",
      "venues.title": "Площадки",
      "venues.lead": "Нажмите на площадку, чтобы открыть её на карте.",
      "gallery.title": "Афиши",
      "footer.cta": "Приходите на трибуны и поддержите студентов! 🏆",
      "tag.ceremony": "Церемония", "tag.final": "Финальный день", "tag.day": "{n}-й день",
      "weekdays": ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
      "title": "Caspian Games 2026 — Актау"
    },
    en: {
      "nav.schedule": "Schedule", "nav.sports": "Sports", "nav.venues": "Venues", "nav.gallery": "Posters",
      "hero.eyebrow": "VIII International Student Games",
      "hero.dates": "October 5–9", "hero.city": "Aktau, Yessenov University",
      "hero.cta": "View schedule",
      "cd.d": "days", "cd.h": "hours", "cd.m": "min", "cd.s": "sec",
      "status.before": "Until the opening ceremony:",
      "status.live": "The Games are on now!",
      "status.after": "The Games are over. Thank you to all participants!",
      "stats.countries": "countries", "stats.sports": "sports", "stats.venues": "venues", "stats.days": "days",
      "month": "October",
      "cer.open": "Opening Ceremony", "cer.close": "Closing Ceremony",
      "venue.ysc": "Yessenov Sports Complex, 32nd Micr.", "venue.ys": "Yessenov Stadium, 32nd Micr.",
      "schedule.title": "Competition schedule",
      "schedule.lead": "Pick a day to see the competitions held on it.",
      "sports.title": "Sports",
      "venues.title": "Venues",
      "venues.lead": "Tap a venue to open it on the map.",
      "gallery.title": "Posters",
      "footer.cta": "Come to the stands and cheer for the students! 🏆",
      "tag.ceremony": "Ceremony", "tag.final": "Final day", "tag.day": "Day {n}",
      "weekdays": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      "title": "Caspian Games 2026 — Aktau"
    }
  };

  var LANGS = ["kk", "ru", "en"];
  var lang = pickLang();
  var selectedDay = null;

  // ===== Helpers =====
  function $(sel) { return document.querySelector(sel); }
  function t(key) { return I18N[lang][key]; }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  function pickLang() {
    var p = new URLSearchParams(location.search).get("lang");
    if (LANGS.indexOf(p) !== -1) return p;
    var s = storageGet("cg-lang");
    if (LANGS.indexOf(s) !== -1) return s;
    var nav = (navigator.language || "").slice(0, 2);
    if (nav === "ru") return "ru";
    if (nav === "en") return "en";
    return "kk";
  }

  // Date in Aktau for a given day of October 2026 at HH:MM, as a UTC timestamp.
  function aktauTime(day, hhmm) {
    var p = hhmm.split(":");
    return Date.UTC(YEAR, MONTH, day, +p[0] - TZ_OFFSET_H, +p[1]);
  }

  // Current day-of-month in Aktau if it falls inside the Games, else null.
  function aktauToday() {
    var d = new Date(Date.now() + TZ_OFFSET_H * 3600 * 1000);
    if (d.getUTCFullYear() !== YEAR || d.getUTCMonth() !== MONTH) return null;
    var day = d.getUTCDate();
    return DAYS.indexOf(day) !== -1 ? day : null;
  }

  function dateRange(s) {
    var m = t("month");
    if (s.from === s.to) return lang === "en" ? m + " " + s.from : s.from + " " + m;
    return lang === "en" ? m + " " + s.from + "–" + s.to : s.from + "–" + s.to + " " + m;
  }

  function venueText(id) {
    var v = VENUES[id];
    return v.name[lang] + ", " + v.addr[lang];
  }

  // ===== Render: static texts =====
  function applyStatic() {
    document.documentElement.lang = lang;
    document.title = t("title");
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var v = t(el.getAttribute("data-i18n"));
      if (typeof v === "string") el.textContent = v;
    });
    document.querySelectorAll(".lang button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === lang));
    });
  }

  // ===== Render: day tabs =====
  function renderDays() {
    var today = aktauToday();
    var wd = t("weekdays");
    $("#days").innerHTML = DAYS.map(function (d) {
      var w = wd[new Date(Date.UTC(YEAR, MONTH, d)).getUTCDay()];
      var cls = "day" + (d === today ? " is-today" : "");
      return '<button type="button" role="tab" class="' + cls + '" data-day="' + d + '" aria-selected="' + (d === selectedDay) + '">' +
        "<b>" + d + "</b><span>" + esc(w) + " · " + esc(t("month")) + "</span></button>";
    }).join("");
  }

  // ===== Render: timeline for a day =====
  function renderTimeline() {
    var d = selectedDay;
    var items = [];

    CEREMONIES.forEach(function (c) {
      if (c.day === d) items.push({ ceremony: true, time: c.time, icon: c.icon, name: t(c.key), venue: c.venue, tag: t("tag.ceremony") });
    });

    SPORTS.forEach(function (s) {
      if (d < s.from || d > s.to) return;
      var tag;
      if (s.from === s.to) tag = dateRange(s);
      else if (d === s.to) tag = t("tag.final");
      else tag = t("tag.day").replace("{n}", d - s.from + 1);
      items.push({ time: s.time, icon: s.icon, name: s.name[lang], venue: s.venue, tag: tag });
    });

    items.sort(function (a, b) { return a.time.localeCompare(b.time); });

    $("#timeline").innerHTML = items.map(function (it) {
      return '<article class="event' + (it.ceremony ? " event--ceremony" : "") + '">' +
        '<div class="event__time">' + esc(it.time) + "</div>" +
        '<div class="event__icon" aria-hidden="true">' + it.icon + "</div>" +
        '<div class="event__info"><h3 class="event__name">' + esc(it.name) + "</h3>" +
        '<p class="event__venue">📍 ' + esc(venueText(it.venue)) + "</p></div>" +
        '<span class="event__tag">' + esc(it.tag) + "</span></article>";
    }).join("");
  }

  // ===== Render: sports grid =====
  function renderSports() {
    $("#sports-grid").innerHTML = SPORTS.map(function (s) {
      return '<article class="sport">' +
        '<div class="sport__icon" aria-hidden="true">' + s.icon + "</div>" +
        "<h3>" + esc(s.name[lang]) + "</h3>" +
        '<p class="sport__dates">' + esc(dateRange(s)) + "<small>" + esc(s.time) + "</small></p>" +
        '<p class="sport__venue">' + esc(venueText(s.venue)) + "</p></article>";
    }).join("");
  }

  // ===== Render: venues =====
  function renderVenues() {
    $("#venues-list").innerHTML = Object.keys(VENUES).map(function (id) {
      var v = VENUES[id];
      var used = SPORTS.filter(function (s) { return s.venue === id; }).map(function (s) { return s.name[lang]; });
      CEREMONIES.forEach(function (c) { if (c.venue === id) used.push(t(c.key)); });
      var url = "https://2gis.kz/aktau/search/" + encodeURIComponent(v.q);
      return '<a class="venue" href="' + url + '" target="_blank" rel="noopener">' +
        '<span class="venue__pin" aria-hidden="true">📍</span><div>' +
        "<h3>" + esc(v.name[lang]) + "</h3><p>" + esc(v.addr[lang]) + "</p>" +
        '<div class="venue__sports">' + used.map(function (n) { return "<span>" + esc(n) + "</span>"; }).join("") + "</div>" +
        "</div></a>";
    }).join("");
  }

  // ===== Status / countdown =====
  var OPEN = aktauTime(5, "14:00");
  var CLOSE_END = aktauTime(9, "20:00");
  var timer = null;

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function tick() {
    var now = Date.now();
    var label = $("#status-label");
    var cd = $("#countdown");
    label.classList.remove("is-live");

    if (now < OPEN) {
      var diff = Math.floor((OPEN - now) / 1000);
      label.textContent = t("status.before");
      cd.hidden = false;
      $("#cd-d").textContent = Math.floor(diff / 86400);
      $("#cd-h").textContent = pad(Math.floor(diff % 86400 / 3600));
      $("#cd-m").textContent = pad(Math.floor(diff % 3600 / 60));
      $("#cd-s").textContent = pad(diff % 60);
    } else if (now < CLOSE_END) {
      label.textContent = t("status.live");
      label.classList.add("is-live");
      cd.hidden = true;
    } else {
      label.textContent = t("status.after");
      cd.hidden = true;
      clearInterval(timer);
    }
  }

  // ===== Wiring =====
  function renderAll() {
    applyStatic();
    renderDays();
    renderTimeline();
    renderSports();
    renderVenues();
    tick();
  }

  document.addEventListener("click", function (e) {
    var dayBtn = e.target.closest(".day");
    if (dayBtn) {
      selectedDay = +dayBtn.getAttribute("data-day");
      renderDays();
      renderTimeline();
      return;
    }
    var langBtn = e.target.closest(".lang button");
    if (langBtn) {
      lang = langBtn.getAttribute("data-lang");
      storageSet("cg-lang", lang);
      renderAll();
    }
  });

  selectedDay = aktauToday() || DAYS[0];
  renderAll();
  timer = setInterval(tick, 1000);
})();
