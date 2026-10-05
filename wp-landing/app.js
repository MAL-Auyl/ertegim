(function () {
  "use strict";

  var root = document.getElementById("cg");
  if (!root) return;

  // Aktau time is UTC+5 all year.
  var TZ_OFFSET_H = 5;
  var YEAR = 2026;
  var MONTH = 9; // October (0-based)
  var DAYS = [5, 6, 7, 8, 9];

  // Ampersand built at runtime: WordPress editors decode HTML entities written in the source.
  var A = String.fromCharCode(38);

  // ===== Venues =====
  var VENUES = {
    ysc: {
      name: { kk: "Yessenov Sports Complex", ru: "Yessenov Sports Complex", en: "Yessenov Sports Complex" },
      addr: { kk: "32 шағын аудан", ru: "32 мкр.", en: "32nd Microdistrict" },
      q: "Yessenov University спорт кешені Ақтау"
    },
    ys: {
      name: { kk: "Yessenov Stadium", ru: "Yessenov Stadium", en: "Yessenov Stadium" },
      addr: { kk: "32 шағын аудан", ru: "32 мкр.", en: "32nd Microdistrict" },
      q: "Yessenov University стадион Ақтау"
    },
    atrium: {
      name: { kk: "Yessenov Атриум", ru: "Атриум Yessenov", en: "Yessenov Atrium" },
      addr: { kk: "32 шағын аудан", ru: "32 мкр.", en: "32nd Microdistrict" },
      q: "Yessenov University Ақтау"
    },
    techno: {
      name: { kk: "Yessenov Технопарк", ru: "Технопарк Yessenov", en: "Yessenov Technopark" },
      addr: { kk: "32 шағын аудан", ru: "32 мкр.", en: "32nd Microdistrict" },
      q: "Yessenov University технопарк Ақтау"
    },
    khalyk: {
      name: { kk: "Халық Арена", ru: "Халык Арена", en: "Khalyk Arena" },
      addr: { kk: "17 шағын аудан", ru: "17 мкр.", en: "17th Microdistrict" },
      q: "Халык Арена Актау"
    },
    mangystau: {
      name: { kk: "Маңғыстау Арена", ru: "Мангистау Арена", en: "Mangystau Arena" },
      addr: { kk: "33 шағын аудан", ru: "33 мкр.", en: "33rd Microdistrict" },
      q: "Мангистау Арена Актау"
    },
    bs: {
      name: { kk: "BS Arena", ru: "BS Arena", en: "BS Arena" },
      addr: { kk: "40 шағын аудан", ru: "40 мкр.", en: "40th Microdistrict" },
      q: "BS Arena Актау"
    },
    volna: {
      name: { kk: "«Волна» спорт кешені", ru: "Спорткомплекс «Волна»", en: "Volna Sports Complex" },
      addr: { kk: "5 шағын аудан", ru: "5 мкр.", en: "5th Microdistrict" },
      q: "спорткомплекс Волна Актау"
    },
    caspian: {
      name: { kk: "«Каспий» спорт кешені", ru: "Спорткомплекс «Каспий»", en: "Caspian Sports Complex" },
      addr: { kk: "4а шағын аудан, 47", ru: "4а мкр., 47", en: "4a Microdistrict, 47" },
      q: "спорткомплекс Каспий Актау 4а мкр 47"
    }
  };

  // ===== Sports (search = word used to find news about the sport) =====
  var SPORTS = [
    { id: "swimming",   icon: "🏊", from: 5, to: 5, time: "10:00", venue: "ysc",       name: { kk: "Жүзу", ru: "Плавание", en: "Swimming" },              search: { kk: "Жүзу", ru: "Плаван", en: "Swim" } },
    { id: "boxing",     icon: "🥊", from: 5, to: 8, time: "10:00", venue: "khalyk",    name: { kk: "Бокс", ru: "Бокс", en: "Boxing" },                    search: { kk: "Бокс", ru: "Бокс", en: "Box" } },
    { id: "basketball", icon: "🏀", from: 5, to: 6, time: "15:00", venue: "ysc",       name: { kk: "Баскетбол", ru: "Баскетбол", en: "Basketball" },      search: { kk: "Баскетбол", ru: "Баскетбол", en: "Basketball" } },
    { id: "volleyball", icon: "🏐", from: 6, to: 7, time: "10:00", venue: "mangystau", name: { kk: "Волейбол", ru: "Волейбол", en: "Volleyball" },        search: { kk: "Волейбол", ru: "Волейбол", en: "Volleyball" } },
    { id: "athletics",  icon: "🏃", from: 6, to: 7, time: "10:00", venue: "ys",        name: { kk: "Жеңіл атлетика", ru: "Лёгкая атлетика", en: "Athletics" }, search: { kk: "атлетика", ru: "атлетик", en: "Athletic" } },
    { id: "futsal",     icon: "⚽", from: 6, to: 7, time: "10:00", venue: "bs",        name: { kk: "Футзал", ru: "Футзал", en: "Futsal" },                search: { kk: "Футзал", ru: "Футзал", en: "Futsal" } },
    { id: "chess",      icon: "♟️", from: 6, to: 6, time: "10:00", venue: "atrium",    name: { kk: "Шахмат", ru: "Шахматы", en: "Chess" },                search: { kk: "Шахмат", ru: "Шахмат", en: "Chess" } },
    { id: "esports",    icon: "🎮", from: 6, to: 6, time: "10:00", venue: "techno",    name: { kk: "Киберспорт", ru: "Киберспорт", en: "E-Sports" },      search: { kk: "Киберспорт", ru: "Киберспорт", en: "sport" } },
    { id: "karate",     icon: "🥋", from: 8, to: 8, time: "10:00", venue: "volna",     name: { kk: "Каратэ-до", ru: "Каратэ-до", en: "Karate-Do" },       search: { kk: "Каратэ", ru: "Каратэ", en: "Karate" } },
    { id: "sambo",      icon: "🤼", from: 8, to: 8, time: "10:00", venue: "caspian",   name: { kk: "Самбо", ru: "Самбо", en: "Sambo" },                   search: { kk: "Самбо", ru: "Самбо", en: "Sambo" } }
  ];

  var CEREMONIES = [
    { day: 5, time: "14:00", venue: "ysc", key: "cer.open", icon: "🎉" },
    { day: 9, time: "17:00", venue: "ys",  key: "cer.close", icon: "🏆" }
  ];

  // ===== Countries =====
  var COUNTRIES = {
    kz: { flag: "🇰🇿", name: { kk: "Қазақстан", ru: "Казахстан", en: "Kazakhstan" } },
    az: { flag: "🇦🇿", name: { kk: "Әзербайжан", ru: "Азербайджан", en: "Azerbaijan" } },
    ir: { flag: "🇮🇷", name: { kk: "Иран", ru: "Иран", en: "Iran" } },
    ru: { flag: "🇷🇺", name: { kk: "Ресей", ru: "Россия", en: "Russia" } },
    tm: { flag: "🇹🇲", name: { kk: "Түрікменстан", ru: "Туркменистан", en: "Turkmenistan" } }
  };

  // ===== News source per language: tag (or category) slug and the "all news" page =====
  var NEWS = {
    kk: { slug: "kaspij-ojyndary", page: "https://yu.edu.kz/kaspij-ojyndary-2026/", locale: "kk-KZ" },
    ru: { slug: "kaspijskie-igry", page: "https://yu.edu.kz/ru/kaspijskie-igry-2026/", locale: "ru-RU" },
    en: { slug: "caspian-games",   page: "https://yu.edu.kz/en/caspian-games-2026/", locale: "en-GB" }
  };
  var CG_LOGO = "https://yu.edu.kz/wp-content/uploads/2026/10/whatsapp-image-2026-10-05-at-11.34.19.jpeg";

  // ===== Translations =====
  var I18N = {
    kk: {
      "nav.about": "Ойындар туралы", "nav.results": "Нәтижелер", "nav.news": "Жаңалықтар",
      "nav.schedule": "Кесте", "nav.sports": "Спорт түрлері", "nav.venues": "Орындар", "nav.gallery": "Афишалар",
      "hero.eyebrow": "VIII халықаралық студенттік ойындар",
      "hero.title": "Каспий ойындары – 2026", "hero.dates": "5–9 қазан, 2026", "hero.city": "Ақтау, Yessenov University",
      "hero.sub": "Қазақстан, Әзербайжан, Иран, Ресей және Түрікменстан студенттері 10 спорт түрі бойынша бақ сынайды.",
      "hero.cta": "Кестені көру", "hero.cta2": "Нәтижелер",
      "cd.d": "күн", "cd.h": "сағат", "cd.m": "минут", "cd.s": "секунд",
      "status.before": "Ашылу салтанатына дейін:",
      "status.live": "Ойындар жүріп жатыр!",
      "status.after": "Ойындар аяқталды. Барлық қатысушыларға рахмет!",
      "stats.countries": "ел", "stats.sports": "спорт түрі", "stats.venues": "спорт нысаны", "stats.days": "күн",
      "month": "қазан",
      "about.eyebrow": "Ойындар туралы", "about.title": "Каспий маңы жастарының спорт мерекесі",
      "about.lead": "5–9 қазан аралығында Ақтау қаласында Каспий маңы елдерінің жоғары оқу орындары студенттері арасында VIII халықаралық «Каспий ойындары – 2026» өтеді!",
      "about.p1": "Қазақстан, Әзербайжан, Иран, Ресей және Түрікменстан студенттері спорттың 10 түрі бойынша бақ сынап, жеңіс пен командалық рухтың жарқын үлгісін көрсетеді.",
      "about.sportsLabel": "Спорт түрлері:",
      "about.sports": "жеңіл атлетика, волейбол, футзал, баскетбол, жүзу, каратэ-до, бокс, шахмат, киберспорт және самбо.",
      "about.p2": "Каспий маңы елдерінің жастарын біріктіретін үлкен спорт мерекесінің куәсі болыңыз!",
      "cer.open": "Ашылу салтанаты", "cer.close": "Жабылу салтанаты",
      "venue.ysc": "Yessenov Sports Complex, 32 ш/а", "venue.ys": "Yessenov Stadium, 32 ш/а",
      "res.eyebrow": "Тікелей нәтижелер", "res.title": "Нәтижелер мен медальдар",
      "res.table": "Медаль кестесі", "res.byCountry": "Елдер", "res.byUniv": "Университеттер",
      "res.bySport": "Спорт түрлері бойынша", "res.updated": "Жаңартылды:",
      "kpi.done": "Аяқталған жарыстар", "kpi.medals": "Берілген медальдар", "kpi.leader": "Көшбасшы", "kpi.today": "Бүгін",
      "kpi.todayHint": "жарыс бүгін өтеді", "kpi.noLeader": "Әзірге жоқ", "kpi.notToday": "Бүгін жарыс жоқ",
      "col.team": "Команда", "col.g": "Алтын", "col.s": "Күміс", "col.b": "Қола", "col.t": "Барлығы",
      "st.done": "Аяқталды", "st.live": "Жүріп жатыр", "st.soon": "Алда",
      "res.empty": "Медальдар жарыстар аяқталғаннан кейін пайда болады.",
      "res.wait": "Нәтижелер жарыс аяқталғаннан кейін жарияланады.",
      "news.eyebrow": "Жаңалықтар", "news.title": "Ойындардың соңғы жаңалықтары",
      "news.all": "Барлығы", "news.allNews": "Барлық жаңалықтар", "news.read": "Толығырақ →",
      "news.empty": "Бұл тақырып бойынша жаңалықтар әзірге жоқ.", "news.error": "Жаңалықтарды жүктеу мүмкін болмады.",
      "schedule.eyebrow": "Бағдарлама", "schedule.title": "Жарыстар кестесі",
      "schedule.lead": "Күнді таңдаңыз — сол күні өтетін жарыстар көрсетіледі.",
      "sports.eyebrow": "10 спорт түрі", "sports.title": "Спорт түрлері",
      "venues.eyebrow": "Ақтау қаласы", "venues.title": "Өтетін орындар",
      "venues.lead": "Картадан ашу үшін нысанды басыңыз.",
      "gallery.eyebrow": "Медиа", "gallery.title": "Афишалар",
      "cta.eyebrow": "Caspian Games 2026", "cta.title": "Каспий маңы елдерінің жастарын біріктіретін үлкен спорт мерекесінің куәсі болыңыз!",
      "footer.games": "VIII «Каспий ойындары – 2026»",
      "footer.address": "Ақтау, 32 шағын аудан, Yessenov University",
      "tag.ceremony": "Салтанат", "tag.final": "Соңғы күн", "tag.day": "{n}-күн",
      "weekdays": ["Жс", "Дс", "Сс", "Ср", "Бс", "Жм", "Сб"]
    },
    ru: {
      "nav.about": "Об Играх", "nav.results": "Результаты", "nav.news": "Новости",
      "nav.schedule": "Расписание", "nav.sports": "Виды спорта", "nav.venues": "Площадки", "nav.gallery": "Афиши",
      "hero.eyebrow": "VIII Международные студенческие игры",
      "hero.title": "Каспийские игры – 2026", "hero.dates": "5–9 октября 2026", "hero.city": "Актау, Yessenov University",
      "hero.sub": "Студенты вузов Казахстана, Азербайджана, Ирана, России и Туркменистана поборются за победу в 10 видах спорта.",
      "hero.cta": "Смотреть расписание", "hero.cta2": "Результаты",
      "cd.d": "дней", "cd.h": "часов", "cd.m": "минут", "cd.s": "секунд",
      "status.before": "До церемонии открытия:",
      "status.live": "Игры идут прямо сейчас!",
      "status.after": "Игры завершены. Спасибо всем участникам!",
      "stats.countries": "стран", "stats.sports": "видов спорта", "stats.venues": "площадок", "stats.days": "дней",
      "month": "октября",
      "about.eyebrow": "Об Играх", "about.title": "Спортивный праздник молодёжи Каспия",
      "about.lead": "С 5 по 9 октября в Актау пройдут VIII Международные студенческие «Каспийские игры – 2026»!",
      "about.p1": "Студенты вузов Казахстана, Азербайджана, Ирана, России и Туркменистана встретятся на одной спортивной площадке и поборются за победу в 10 видах спорта.",
      "about.sportsLabel": "Виды спорта:",
      "about.sports": "лёгкая атлетика, волейбол, футзал, баскетбол, плавание, каратэ-до, бокс, шахматы, киберспорт и самбо.",
      "about.p2": "Станьте частью большого спортивного события, объединяющего молодёжь стран Каспийского региона!",
      "cer.open": "Церемония открытия", "cer.close": "Церемония закрытия",
      "venue.ysc": "Yessenov Sports Complex, 32 мкр.", "venue.ys": "Yessenov Stadium, 32 мкр.",
      "res.eyebrow": "Результаты онлайн", "res.title": "Результаты и медали",
      "res.table": "Медальный зачёт", "res.byCountry": "Страны", "res.byUniv": "Университеты",
      "res.bySport": "По видам спорта", "res.updated": "Обновлено:",
      "kpi.done": "Завершено соревнований", "kpi.medals": "Вручено медалей", "kpi.leader": "Лидер", "kpi.today": "Сегодня",
      "kpi.todayHint": "соревнований сегодня", "kpi.noLeader": "Пока нет", "kpi.notToday": "Сегодня соревнований нет",
      "col.team": "Команда", "col.g": "Золото", "col.s": "Серебро", "col.b": "Бронза", "col.t": "Всего",
      "st.done": "Завершено", "st.live": "Идёт", "st.soon": "Впереди",
      "res.empty": "Медали появятся после завершения соревнований.",
      "res.wait": "Результаты будут опубликованы после завершения соревнований.",
      "news.eyebrow": "Новости", "news.title": "Последние новости Игр",
      "news.all": "Все", "news.allNews": "Все новости", "news.read": "Подробнее →",
      "news.empty": "Новостей по этой теме пока нет.", "news.error": "Не удалось загрузить новости.",
      "schedule.eyebrow": "Программа", "schedule.title": "Расписание соревнований",
      "schedule.lead": "Выберите день — покажем соревнования, которые пройдут в этот день.",
      "sports.eyebrow": "10 видов спорта", "sports.title": "Виды спорта",
      "venues.eyebrow": "Город Актау", "venues.title": "Площадки",
      "venues.lead": "Нажмите на площадку, чтобы открыть её на карте.",
      "gallery.eyebrow": "Медиа", "gallery.title": "Афиши",
      "cta.eyebrow": "Caspian Games 2026", "cta.title": "Станьте частью большого спортивного события, объединяющего молодёжь стран Каспийского региона!",
      "footer.games": "VIII «Каспийские игры – 2026»",
      "footer.address": "Актау, 32 микрорайон, Yessenov University",
      "tag.ceremony": "Церемония", "tag.final": "Финальный день", "tag.day": "{n}-й день",
      "weekdays": ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]
    },
    en: {
      "nav.about": "About", "nav.results": "Results", "nav.news": "News",
      "nav.schedule": "Schedule", "nav.sports": "Sports", "nav.venues": "Venues", "nav.gallery": "Posters",
      "hero.eyebrow": "VIII International Student Games",
      "hero.title": "Caspian Games 2026", "hero.dates": "October 5–9, 2026", "hero.city": "Aktau, Yessenov University",
      "hero.sub": "University students from Kazakhstan, Azerbaijan, Iran, Russia and Turkmenistan compete for victory in 10 sports.",
      "hero.cta": "View schedule", "hero.cta2": "Results",
      "cd.d": "days", "cd.h": "hours", "cd.m": "min", "cd.s": "sec",
      "status.before": "Until the opening ceremony:",
      "status.live": "The Games are on now!",
      "status.after": "The Games are over. Thank you to all participants!",
      "stats.countries": "countries", "stats.sports": "sports", "stats.venues": "venues", "stats.days": "days",
      "month": "October",
      "about.eyebrow": "About the Games", "about.title": "A sports festival of Caspian youth",
      "about.lead": "From October 5 to 9, Aktau hosts the VIII International Student Caspian Games 2026!",
      "about.p1": "University students from Kazakhstan, Azerbaijan, Iran, Russia and Turkmenistan meet on one sporting stage to compete for victory in 10 sports.",
      "about.sportsLabel": "Sports:",
      "about.sports": "athletics, volleyball, futsal, basketball, swimming, karate-do, boxing, chess, e-sports and sambo.",
      "about.p2": "Be part of a major sporting event that brings together young people from across the Caspian region!",
      "cer.open": "Opening Ceremony", "cer.close": "Closing Ceremony",
      "venue.ysc": "Yessenov Sports Complex, 32nd Micr.", "venue.ys": "Yessenov Stadium, 32nd Micr.",
      "res.eyebrow": "Live results", "res.title": "Results and medals",
      "res.table": "Medal table", "res.byCountry": "Countries", "res.byUniv": "Universities",
      "res.bySport": "By sport", "res.updated": "Updated:",
      "kpi.done": "Events completed", "kpi.medals": "Medals awarded", "kpi.leader": "Leader", "kpi.today": "Today",
      "kpi.todayHint": "events today", "kpi.noLeader": "None yet", "kpi.notToday": "No events today",
      "col.team": "Team", "col.g": "Gold", "col.s": "Silver", "col.b": "Bronze", "col.t": "Total",
      "st.done": "Finished", "st.live": "In progress", "st.soon": "Upcoming",
      "res.empty": "Medals will appear once events are finished.",
      "res.wait": "Results will be published after the event.",
      "news.eyebrow": "News", "news.title": "Latest from the Games",
      "news.all": "All", "news.allNews": "All news", "news.read": "Read more →",
      "news.empty": "No news on this topic yet.", "news.error": "Could not load news.",
      "schedule.eyebrow": "Program", "schedule.title": "Competition schedule",
      "schedule.lead": "Pick a day to see the competitions held on it.",
      "sports.eyebrow": "10 sports", "sports.title": "Sports",
      "venues.eyebrow": "Aktau", "venues.title": "Venues",
      "venues.lead": "Tap a venue to open it on the map.",
      "gallery.eyebrow": "Media", "gallery.title": "Posters",
      "cta.eyebrow": "Caspian Games 2026", "cta.title": "Be part of a major sporting event that brings together the youth of the Caspian region!",
      "footer.games": "VIII Caspian Games 2026",
      "footer.address": "Aktau, 32nd Microdistrict, Yessenov University",
      "tag.ceremony": "Ceremony", "tag.final": "Final day", "tag.day": "Day {n}",
      "weekdays": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    }
  };

  var LANGS = ["kk", "ru", "en"];
  var lang = LANGS.indexOf(root.getAttribute("data-lang")) !== -1 ? root.getAttribute("data-lang") : "kk";
  var selectedDay = null;

  // ===== Helpers =====
  function $(sel) { return root.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function t(key) { return I18N[lang][key]; }

  function esc(s) {
    return String(s)
      .split(A).join(A + "amp;")
      .split("<").join(A + "lt;")
      .split(">").join(A + "gt;")
      .split('"').join(A + "quot;");
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
    $$("[data-i18n]").forEach(function (el) {
      var v = t(el.getAttribute("data-i18n"));
      if (typeof v === "string") el.textContent = v;
    });
  }

  // ===== Render: day tabs =====
  function renderDays() {
    var today = aktauToday();
    var wd = t("weekdays");
    $("#days").innerHTML = DAYS.map(function (d) {
      var w = wd[new Date(Date.UTC(YEAR, MONTH, d)).getUTCDay()];
      var cls = "day" + (d === today ? " is-today" : "");
      var sel = d === selectedDay;
      return '<button type="button" role="tab" class="' + cls + '" data-day="' + d + '" aria-selected="' + sel +
        '" aria-controls="timeline" tabindex="' + (sel ? 0 : -1) + '">' +
        "<b>" + d + "<\/b><span>" + esc(w) + " · " + esc(t("month")) + "<\/span><\/button>";
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
        '<div class="event__time">' + esc(it.time) + "<\/div>" +
        '<div class="event__icon" aria-hidden="true">' + it.icon + "<\/div>" +
        '<div class="event__info"><h3 class="event__name">' + esc(it.name) + "<\/h3>" +
        '<p class="event__venue"><i class="fa-solid fa-location-dot"><\/i>' + esc(venueText(it.venue)) + "<\/p><\/div>" +
        '<span class="event__tag">' + esc(it.tag) + "<\/span><\/article>";
    }).join("");
  }

  // ===== Render: sports grid =====
  function renderSports() {
    $("#sports-grid").innerHTML = SPORTS.map(function (s) {
      return '<article class="sport">' +
        '<div class="sport__icon" aria-hidden="true">' + s.icon + "<\/div>" +
        "<h3>" + esc(s.name[lang]) + "<\/h3>" +
        '<p class="sport__dates">' + esc(dateRange(s)) + "<small>" + esc(s.time) + "<\/small><\/p>" +
        '<p class="sport__venue">' + esc(venueText(s.venue)) + "<\/p><\/article>";
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
        '<span class="venue__pin" aria-hidden="true"><i class="fa-solid fa-location-dot"><\/i><\/span><div class="venue__body">' +
        "<h3>" + esc(v.name[lang]) + '<\/h3><p class="venue__addr">' + esc(v.addr[lang]) + "<\/p>" +
        '<div class="venue__sports">' + used.map(function (n) { return "<span>" + esc(n) + "<\/span>"; }).join("") + "<\/div>" +
        '<\/div><i class="fa-solid fa-arrow-up-right-from-square venue__go" aria-hidden="true"><\/i><\/a>';
    }).join("");
  }

  // ===== Render: countries (About) =====
  function renderCountries() {
    $("#countries").innerHTML = Object.keys(COUNTRIES).map(function (c) {
      var k = COUNTRIES[c];
      return '<div class="country"><span class="country__flag">' + k.flag + "<\/span>" +
        '<span class="country__name">' + esc(k.name[lang]) + "<\/span>" +
        '<span class="country__code">' + c.toUpperCase() + "<\/span><\/div>";
    }).join("");
  }

  // ===== Results dashboard =====
  var DATA = window.CG_RESULTS || { sports: {} };
  var medalMode = "country";
  var MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" };

  function sportResult(s) {
    var r = DATA.sports[s.id] || {};
    var podium = (r.podium || []).filter(function (p) { return p ? p.place : false; })
      .sort(function (a, b) { return a.place - b.place; });
    var status = r.status;
    if (!status) {
      var today = aktauToday();
      if (podium.length) status = "done";
      else if (today ? today >= s.from ? today <= s.to : false : false) status = "live";
      else if (Date.now() > aktauTime(s.to, "23:59")) status = "done";
      else status = "soon";
    }
    return { status: status, podium: podium, note: r.note };
  }

  function medalRows() {
    var rows = {};
    function row(key, label, country) {
      if (!rows[key]) rows[key] = { key: key, label: label, country: country, g: 0, s: 0, b: 0 };
      return rows[key];
    }
    if (medalMode === "country") {
      Object.keys(COUNTRIES).forEach(function (c) { row(c, COUNTRIES[c].name[lang], c); });
    }
    SPORTS.forEach(function (s) {
      sportResult(s).podium.forEach(function (p) {
        var r = medalMode === "country"
          ? (COUNTRIES[p.country] ? row(p.country, COUNTRIES[p.country].name[lang], p.country) : null)
          : row(p.univ || p.name, p.univ || p.name, p.country);
        if (!r) return;
        if (p.place === 1) r.g++; else if (p.place === 2) r.s++; else if (p.place === 3) r.b++;
      });
    });
    return Object.keys(rows).map(function (k) { return rows[k]; })
      .sort(function (a, b) { return (b.g - a.g) || (b.s - a.s) || (b.b - a.b) || a.label.localeCompare(b.label); });
  }

  function renderKpis() {
    var done = 0, medals = { g: 0, s: 0, b: 0 }, today = aktauToday(), todayCount = 0;
    SPORTS.forEach(function (s) {
      var r = sportResult(s);
      if (r.status === "done") done++;
      r.podium.forEach(function (p) {
        if (p.place === 1) medals.g++; else if (p.place === 2) medals.s++; else if (p.place === 3) medals.b++;
      });
      if (today) { if (today >= s.from) { if (today <= s.to) todayCount++; } }
    });
    var total = medals.g + medals.s + medals.b;

    var saved = medalMode; medalMode = "country";
    var top = medalRows()[0];
    medalMode = saved;
    var hasLeader = top ? (top.g + top.s + top.b) > 0 : false;

    var pct = Math.round(done / SPORTS.length * 100);
    $("#kpis").innerHTML =
      '<div class="kpi"><p class="kpi__label">' + esc(t("kpi.done")) + "<\/p>" +
        '<p class="kpi__value">' + done + "<small> / " + SPORTS.length + "<\/small><\/p>" +
        '<div class="kpi__bar" role="img" aria-label="' + pct + '%"><span style="width:' + pct + '%"><\/span><\/div><\/div>' +
      '<div class="kpi"><p class="kpi__label">' + esc(t("kpi.medals")) + "<\/p>" +
        '<p class="kpi__value">' + total + "<\/p>" +
        '<p class="kpi__hint"><span class="dot dot--1"><\/span> ' + medals.g + ' · <span class="dot dot--2"><\/span> ' + medals.s +
        ' · <span class="dot dot--3"><\/span> ' + medals.b + "<\/p><\/div>" +
      '<div class="kpi"><p class="kpi__label">' + esc(t("kpi.leader")) + "<\/p>" +
        (hasLeader
          ? '<p class="kpi__value">' + COUNTRIES[top.key].flag + '<\/p><p class="kpi__hint">' + esc(top.label) + " · " + top.g + " 🥇<\/p>"
          : '<p class="kpi__value">—<\/p><p class="kpi__hint">' + esc(t("kpi.noLeader")) + "<\/p>") + "<\/div>" +
      '<div class="kpi"><p class="kpi__label">' + esc(t("kpi.today")) + "<\/p>" +
        (today
          ? '<p class="kpi__value">' + todayCount + '<\/p><p class="kpi__hint">' + esc(t("kpi.todayHint")) + "<\/p>"
          : '<p class="kpi__value">—<\/p><p class="kpi__hint">' + esc(t("kpi.notToday")) + "<\/p>") + "<\/div>";

    var up = $("#res-updated");
    if (DATA.updated) {
      up.innerHTML = '<i class="fa-regular fa-clock"><\/i>' + esc(t("res.updated")) + " " + esc(DATA.updated);
      up.hidden = false;
    } else {
      up.hidden = true;
    }
  }

  function renderMedalTable() {
    $$("#medal-mode button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-mode") === medalMode));
    });
    var rows = medalRows();
    var any = rows.some(function (r) { return r.g + r.s + r.b > 0; });
    if (!any) {
      if (medalMode === "univ") {
        $("#medal-table").innerHTML = '<p class="empty"><i class="fa-solid fa-medal"><\/i>' + esc(t("res.empty")) + "<\/p>";
        return;
      }
    }
    var max = Math.max.apply(null, rows.map(function (r) { return r.g + r.s + r.b; }).concat([1]));
    var html = '<table class="medals"><thead><tr><th>#<\/th><th>' + esc(t("col.team")) + "<\/th>" +
      '<th><span class="dot dot--1"><\/span><span class="sr">' + esc(t("col.g")) + "<\/span><\/th>" +
      '<th><span class="dot dot--2"><\/span><span class="sr">' + esc(t("col.s")) + "<\/span><\/th>" +
      '<th><span class="dot dot--3"><\/span><span class="sr">' + esc(t("col.b")) + "<\/span><\/th>" +
      "<th>" + esc(t("col.t")) + "<\/th><\/tr><\/thead><tbody>";
    rows.forEach(function (r, i) {
      var tot = r.g + r.s + r.b;
      var flag = COUNTRIES[r.country] ? COUNTRIES[r.country].flag : "🏳️";
      var sub = (medalMode === "univ" ? COUNTRIES[r.country] : null) ? "<small>" + esc(COUNTRIES[r.country].name[lang]) + "<\/small>" : "";
      var bar = tot ? '<div class="medalbar">' +
        (r.g ? '<i class="g" style="width:' + (r.g / max * 100) + '%"><\/i>' : "") +
        (r.s ? '<i class="s" style="width:' + (r.s / max * 100) + '%"><\/i>' : "") +
        (r.b ? '<i class="b" style="width:' + (r.b / max * 100) + '%"><\/i>' : "") + "<\/div>" : "";
      html += '<tr><td class="rank">' + (tot ? i + 1 : "–") + "<\/td>" +
        '<td class="team"><span>' + flag + "<\/span>" + esc(r.label) + sub + bar + "<\/td>" +
        "<td>" + r.g + "<\/td><td>" + r.s + "<\/td><td>" + r.b + '<\/td><td class="total">' + tot + "<\/td><\/tr>";
    });
    html += "<\/tbody><\/table>";
    if (!any) html += '<p class="empty" style="margin-top:16px"><i class="fa-solid fa-medal"><\/i>' + esc(t("res.empty")) + "<\/p>";
    $("#medal-table").innerHTML = html;
  }

  function renderSportResults() {
    var order = { live: 0, done: 1, soon: 2 };
    var list = SPORTS.map(function (s) { return { s: s, r: sportResult(s) }; })
      .sort(function (a, b) { return (order[a.r.status] - order[b.r.status]) || (a.s.from - b.s.from); });

    $("#sport-results").innerHTML = list.map(function (x) {
      var s = x.s, r = x.r;
      var icon = { done: "fa-circle-check", live: "fa-circle-dot", soon: "fa-clock" }[r.status];
      var body;
      if (r.podium.length) {
        body = '<ol class="podium">' + r.podium.map(function (p) {
          var c = COUNTRIES[p.country];
          var two = p.name ? (p.univ ? p.name !== p.univ : false) : false;
          var who = two ? esc(p.name) + " <small>· " + esc(p.univ) + "<\/small>" : esc(p.name || p.univ || "");
          return "<li><em>" + (MEDAL[p.place] || "") + "<\/em><b>" + who + "<\/b><span>" + (c ? c.flag : "") + "<\/span><\/li>";
        }).join("") + "<\/ol>";
      } else if (r.status !== "soon") {
        body = '<p class="result__note">' + esc(t("res.wait")) + "<\/p>";
      } else {
        body = "";
      }
      var note = (r.note ? r.note[lang] : "") ? '<p class="result__note">' + esc(r.note[lang]) + "<\/p>" : "";
      return '<article class="result"><div class="result__head">' +
        '<span class="result__icon" aria-hidden="true">' + s.icon + "<\/span>" +
        '<div><p class="result__name">' + esc(s.name[lang]) + '<\/p><p class="result__when">' + esc(dateRange(s)) + " · " + esc(s.time) + "<\/p><\/div>" +
        '<span class="status status--' + r.status + '"><i class="fa-solid ' + icon + '"><\/i>' + esc(t("st." + r.status)) + "<\/span>" +
        "<\/div>" + body + note + "<\/article>";
    }).join("");
  }

  function renderResults() {
    renderKpis();
    renderMedalTable();
    renderSportResults();
  }

  // ===== News (WordPress REST API, tag or category by slug) =====
  var NEWS_PER = 6;
  var news = { term: null, sport: "", token: 0 };

  function plain(html) {
    var d = document.createElement("div");
    d.innerHTML = html || "";
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  }
  function trimWords(s, n) {
    var w = s.split(" ");
    return w.length > n ? w.slice(0, n).join(" ") + "…" : s;
  }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString(NEWS[lang].locale, { day: "numeric", month: "long", year: "numeric" }); }
    catch (e) { return iso.slice(0, 10); }
  }
  function getJSON(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
      return r.json();
    });
  }
  function wp(path) {
    return "/wp-json/wp/v2/" + path;
  }

  function newsCard(p, big) {
    var m = ((p._embedded || {})["wp:featuredmedia"] || [])[0];
    var img;
    if ((m || {}).source_url) {
      var s = (m.media_details || {}).sizes || {};
      var src = (s.large || s.medium_large || s.medium || {}).source_url || m.source_url;
      img = '<img src="' + esc(src) + '" alt="" loading="lazy">';
    } else {
      img = '<img class="ncard__logo" src="' + CG_LOGO + '" alt="">';
    }
    return '<article class="ncard' + (big ? " ncard--big" : "") + '">' +
      '<a class="ncard__media" href="' + esc(p.link) + '" tabindex="-1" aria-hidden="true">' + img + "<\/a>" +
      '<div class="ncard__body">' +
        '<time class="ncard__date" datetime="' + esc(p.date) + '">' + esc(fmtDate(p.date)) + "<\/time>" +
        '<h3 class="ncard__title"><a href="' + esc(p.link) + '">' + esc(plain((p.title || {}).rendered)) + "<\/a><\/h3>" +
        '<p class="ncard__excerpt">' + esc(trimWords(plain((p.excerpt || {}).rendered), big ? 34 : 18)) + "<\/p>" +
        '<a class="ncard__more" href="' + esc(p.link) + '">' + esc(t("news.read")) + "<\/a>" +
      "<\/div><\/article>";
  }

  function renderNewsChips() {
    var chips = '<button type="button" class="nchip" data-q="" aria-pressed="' + (news.sport === "") + '">' + esc(t("news.all")) + "<\/button>";
    SPORTS.forEach(function (s) {
      var q = s.search[lang];
      chips += '<button type="button" class="nchip" data-q="' + esc(q) + '" aria-pressed="' + (news.sport === q) + '">' +
        s.icon + " " + esc(s.name[lang]) + "<\/button>";
    });
    $("#news-chips").innerHTML = chips;
    $("#news-all").href = NEWS[lang].page;
  }

  function loadNews() {
    var grid = $("#news-grid");
    var my = ++news.token;
    grid.innerHTML = '<div class="nskel nskel--big"><\/div><div class="nskel"><\/div><div class="nskel"><\/div>';
    var q = "posts?" + news.term.tax + "=" + news.term.id + A + "per_page=" + NEWS_PER + A + "_embed=wp:featuredmedia";
    if (news.sport) q += A + "search=" + encodeURIComponent(news.sport);
    getJSON(wp(q)).then(function (posts) {
      if (my !== news.token) return;
      if (!posts.length) {
        grid.innerHTML = '<p class="empty"><i class="fa-regular fa-newspaper"><\/i>' + esc(t("news.empty")) + "<\/p>";
        return;
      }
      grid.innerHTML = posts.map(function (p, i) { return newsCard(p, i === 0); }).join("");
    }).catch(function (e) {
      if (my !== news.token) return;
      console.error("[cg news]", e);
      grid.innerHTML = '<p class="empty">' + esc(t("news.error")) + "<\/p>";
    });
  }

  function initNews() {
    renderNewsChips();
    var slug = NEWS[lang].slug;
    getJSON(wp("tags?slug=" + encodeURIComponent(slug)))
      .then(function (tags) {
        if (tags.length) return { tax: "tags", id: tags[0].id };
        return getJSON(wp("categories?slug=" + encodeURIComponent(slug))).then(function (cats) {
          return cats.length ? { tax: "categories", id: cats[0].id } : null;
        });
      })
      .then(function (term) {
        if (!term) {
          $("#news-grid").innerHTML = '<p class="empty">' + esc(t("news.empty")) + "<\/p>";
          return;
        }
        news.term = term;
        loadNews();
      })
      .catch(function (e) {
        console.error("[cg news]", e);
        $("#news-grid").innerHTML = '<p class="empty">' + esc(t("news.error")) + "<\/p>";
      });
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
  root.addEventListener("click", function (e) {
    var dayBtn = e.target.closest(".day");
    if (dayBtn) {
      selectedDay = +dayBtn.getAttribute("data-day");
      renderDays();
      renderTimeline();
      return;
    }
    var modeBtn = e.target.closest("#medal-mode button");
    if (modeBtn) {
      medalMode = modeBtn.getAttribute("data-mode");
      renderMedalTable();
      return;
    }
    var chip = e.target.closest(".nchip");
    if (chip) {
      if (!news.term) return;
      news.sport = chip.getAttribute("data-q");
      $$(".nchip").forEach(function (b) { b.setAttribute("aria-pressed", String(b === chip)); });
      loadNews();
    }
  });

  // Day tabs: arrow keys / Home / End (WAI-ARIA tabs pattern, roving tabindex)
  $("#days").addEventListener("keydown", function (e) {
    var keys = { ArrowLeft: -1, ArrowRight: 1, Home: "first", End: "last" };
    if (!(e.key in keys)) return;
    if (!e.target.closest(".day")) return;
    e.preventDefault();
    var i = DAYS.indexOf(selectedDay);
    var k = keys[e.key];
    i = k === "first" ? 0 : k === "last" ? DAYS.length - 1 : (i + k + DAYS.length) % DAYS.length;
    selectedDay = DAYS[i];
    renderDays();
    renderTimeline();
    var btn = $('#days [data-day="' + selectedDay + '"]');
    btn.focus({ preventScroll: true });
    scrollIntoRow(btn);
  });

  // Keep an element visible inside a horizontal scroller without moving the page
  function scrollIntoRow(el) {
    var row = el.parentElement;
    var left = el.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + el.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollTo({ left: left - (row.clientWidth - el.offsetWidth) / 2, behavior: "smooth" });
    }
  }

  // Scroll-spy: highlight the nav link of the section currently in view
  var navLinks = $$(".nav__links a");
  if ("IntersectionObserver" in window) {
    var visible = {};
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { visible[en.target.id] = en.isIntersecting; });
      var current = null;
      navLinks.forEach(function (a) {
        var id = a.getAttribute("href").slice(1);
        if (!current) { if (visible[id]) current = a; }
      });
      navLinks.forEach(function (a) {
        if (a === current) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
      if (current) scrollIntoRow(current);
    }, { rootMargin: "-45% 0px -50% 0px" });
    navLinks.forEach(function (a) {
      var sec = document.getElementById(a.getAttribute("href").slice(1));
      if (sec) spy.observe(sec);
    });
  }

  selectedDay = aktauToday() || DAYS[0];
  applyStatic();
  renderDays();
  renderTimeline();
  renderSports();
  renderVenues();
  renderCountries();
  renderResults();
  initNews();
  tick();
  timer = setInterval(tick, 1000);
})();
