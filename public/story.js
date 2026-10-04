// Story state machine data — «Түлкі інісін іздейді» (the fox cub looks for
// his little brother). Mirrors docs/story-script.md; node ids there are the
// keys here.
//
// Node kinds:
//   narration — hero speaks, auto-advances to `next` after the line.
//   question  — hero speaks, then the child answers by voice.
//     mode "exact"  : one right answer (count / rhyme)     → onCorrect
//     mode "open"   : any on-topic speech counts (empathy) → onCorrect
//     mode "branch" : the answer picks the route           → onAnswer[route]
//     every question has onReask (one re-ask) and onReveal (hero answers
//     himself after the second miss and moves on).
//   end       — parent report.
// Every node also carries character/pose (who is on stage, how) and bg
// (which scene look), so characters.js/app.js never need a second table.

const NUM_KK = ["", "бір", "екі", "үш", "төрт", "бес"];
const NUM_RU = ["", "один", "два", "три", "четыре", "пять"];

function ruTrackWord(n) {
  if (n === 1) return "след";
  if (n >= 2 && n <= 4) return "следа";
  return "следов";
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Randomised per session (app.js rerollTracks): the reveal line and the LLM
// criterion for q_tracks depend on the rolled count.
function trackLines(n) {
  const kk = [], ru = [];
  for (let i = 1; i <= n; i++) { kk.push(NUM_KK[i]); ru.push(NUM_RU[i]); }
  return {
    revealKk: `Ештеңе етпейді! Бірге санайық: ${kk.join(", ")}! ${cap(NUM_KK[n])} із екен!`,
    revealRu: `Не страшно! Давай посчитаем вместе: ${ru.join(", ")}! ${cap(NUM_RU[n])} ${ruTrackWord(n)}!`,
    criterion:
      `Правильный ответ — число ${NUM_RU[n]} (${n}). Засчитывай верным любое произношение ` +
      `этого числа на казахском («${NUM_KK[n]}») или русском («${NUM_RU[n]}», «${n}»). ` +
      `Другое число, молчание или посторонний ответ — unclear.`,
  };
}

// Both real Kazakh words ending in -ық, same rhyme family as the reveal
// example «қасық», so echo_reveal never needs to change.
const BROTHER_NAMES = [
  { kk: "Балық", kkLower: "балық", ru: "Балык (рыбка)", slug: "balyq" },
  { kk: "Мысық", kkLower: "мысық", ru: "Мысык (котик)", slug: "mysyq" },
];

function echoLines(b) {
  return {
    kk: `Үңгірде жаңғырық бар. Інімнің аты — ${b.kk}. Осыған ұйқас сөз айтшы, ол бізді естісін!`,
    ru: `В пещере эхо. Братика зовут ${b.kkLower}. Скажи похожее по звучанию слово, чтобы он нас услышал!`,
    criterion:
      `Правильный ответ — любое существующее казахское или русское слово, фонетически похожее на ` +
      `«${b.kkLower}» (например, оканчивается на «-ық»/«-ик», как «қасық»). Любая настоящая рифма/созвучие ` +
      `засчитывается верной. Слово без созвучия или посторонний ответ — unclear.`,
  };
}

const FOX = "Түлкі (лисёнок)";
const OWL = "Үкі (совёнок)";
const BEAR = "Аю (медведь)";

const STORY = {
  // ---- пролог -----------------------------------------------------------
  intro: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "night",
    kk: "Сәлем! Мен — түлкі. Кішкентай інім жоғалып кетті... Таң атқанша оны тауып алуымыз керек. Маған көмектесесің бе?",
    ru: "Привет! Я лисёнок. Мой младший братик потерялся… Надо найти его до рассвета. Поможешь мне?",
    next: "q_tracks",
  },
  intro_again: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "night",
    kk: "Сен қайта келдің! Есіңде ме, інімді бірге іздегенбіз? Ол тағы да қашып кетті... Маған тағы көмектесесің бе?",
    ru: "Ты вернулся! Помнишь, как мы искали братика? Он опять убежал… Поможешь мне снова?",
    next: "q_tracks",
  },

  // ---- следы: счёт --------------------------------------------------------
  q_tracks: {
    kind: "question", mode: "exact", skill: "count",
    speaker: FOX, character: "fox", pose: "talk", bg: "night",
    kk: "Қара, жолда іздер бар! Неше із бар? Санап көрші!",
    ru: "Смотри, на тропинке следы! Сколько следов? Посчитай!",
    criterion: trackLines(3).criterion, // overwritten per session by rerollTracks()
    onCorrect: "tracks_ok", onReask: "tracks_reask", onReveal: "tracks_reveal",
  },
  tracks_reask: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "night",
    kk: "Тағы бір рет қарайықшы. Іздерді бірінен соң бірін санап көр.",
    ru: "Давай посмотрим ещё раз. Посчитай следы по одному.",
    next: "q_tracks",
  },
  tracks_reveal: {
    kind: "narration", speaker: FOX, character: "fox", pose: "think", bg: "night",
    kk: trackLines(3).revealKk, ru: trackLines(3).revealRu, // overwritten per session
    next: "fork_intro",
  },
  tracks_ok: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "night",
    kk: "Дұрыс! Бұл інімнің іздері! Кеттік!",
    ru: "Правильно! Это следы моего братика! Идём!",
    next: "fork_intro",
  },

  // ---- развилка: выбор пути -----------------------------------------------
  fork_intro: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "night",
    kk: "Міне, жол екіге бөлінеді. Сол жақта — өзен, оң жақта — орман.",
    ru: "Вот дорога раздваивается. Слева — река, справа — лес.",
    next: "q_fork",
  },
  q_fork: {
    kind: "question", mode: "branch", skill: "choice",
    speaker: FOX, character: "fox", pose: "talk", bg: "night",
    kk: "Қайда барамыз: солға, өзенге ме, әлде оңға, орманға ма?",
    ru: "Куда пойдём: налево к реке или направо в лес?",
    criterion:
      "Ребёнок выбирает дорогу. Если он выбрал реку/налево (өзен, солға, налево, река) — верни " +
      'label "correct" и reason ровно "river". Если лес/направо (орман, оңға, направо, лес) — ' +
      'label "correct" и reason ровно "forest". Если направление не понятно — "unclear".',
    onAnswer: { river: "owl_meet", forest: "bear_meet" },
    onReask: "fork_reask", onReveal: "fork_reveal",
  },
  fork_reask: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "night",
    kk: "Мен естімедім. Солға ма, оңға ма? Өзен бе, орман ба?",
    ru: "Я не расслышал. Налево или направо? Река или лес?",
    next: "q_fork",
  },
  fork_reveal: {
    kind: "narration", speaker: FOX, character: "fox", pose: "think", bg: "night",
    kk: "Жарайды, мен өзім таңдаймын!",
    ru: "Ладно, я выберу сам!",
    next: "owl_meet", // app.js overrides with a random route at runtime
  },
  owl_meet: {
    kind: "narration", speaker: OWL, character: "owl", pose: "talk", bg: "river",
    kk: "Сәлем, түлкі! Мен — үкі. Сенің ініңді көрдім — ол үңгірге қарай жүгірді. Мен сендермен бірге ұшамын!",
    ru: "Привет, лисёнок! Я совёнок. Я видел твоего братика — он побежал к пещере. Я полечу с вами!",
    next: "cave_arrive",
  },
  bear_meet: {
    kind: "narration", speaker: BEAR, character: "bear", pose: "talk", bg: "forest",
    kk: "Уф, сәлем, түлкі! Мен — аю. Інің осы жақпен өтті — үңгірге қарай. Мен жолды көрсетемін!",
    ru: "Уф, привет, лисёнок! Я медведь. Твой братик прошёл здесь — к пещере. Я покажу дорогу!",
    next: "cave_arrive",
  },

  // ---- пещера: страх и ободрение --------------------------------------------
  cave_arrive: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "cave",
    kk: "Міне, үңгір. Інім осында болуы керек.",
    ru: "Вот пещера. Братик должен быть здесь.",
    next: "cave_fear",
  },
  cave_fear: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "cave",
    kk: "Бірақ... ішінде қап-қараңғы. Мен қараңғыдан қорқамын...",
    ru: "Но… внутри совсем темно. Я боюсь темноты…",
    next: "q_courage",
  },
  q_courage: {
    kind: "question", mode: "open", skill: "empathy",
    speaker: FOX, character: "fox", pose: "confused", bg: "cave",
    kk: "Маған бірдеңе айтшы, қорықпауым үшін. Сен менімен біргесің бе?",
    ru: "Скажи мне что-нибудь, чтобы я не боялся. Ты со мной?",
    criterion:
      "Лисёнок боится темноты и просит ребёнка его подбодрить. Верно (correct) — любая фраза, в которой " +
      "ребёнок поддерживает, успокаивает, обещает быть рядом, говорит «не бойся», «я с тобой», «ты смелый», " +
      "«давай вместе» и т.п., на любом языке, даже с ошибками распознавания. Будь щедрым: цель — чтобы " +
      "ребёнок заговорил. unclear — только пустой ответ или явно не по теме.",
    onCorrect: "cave_enter", onReask: "courage_reask", onReveal: "courage_reveal",
  },
  courage_reask: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "cave",
    kk: "Тағы бір рет айтшы, мен жақсы естімедім. Маған сенің дауысың керек.",
    ru: "Скажи ещё раз, я плохо расслышал. Мне нужен твой голос.",
    next: "q_courage",
  },
  courage_reveal: {
    kind: "narration", speaker: FOX, character: "fox", pose: "think", bg: "cave",
    kk: "Жарайды... Сен қасымдасың, мен білемін. Терең дем аламын да, кіремін!",
    ru: "Ладно… Ты рядом, я знаю. Глубокий вдох — и вхожу!",
    next: "q_echo",
  },
  cave_enter: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "cave",
    kk: "Рахмет! Сенімен бірге мен қорықпаймын. Кеттік!",
    ru: "Спасибо! С тобой мне не страшно. Идём!",
    next: "q_echo",
  },

  // ---- эхо: рифма -----------------------------------------------------------
  q_echo: {
    kind: "question", mode: "exact", skill: "rhyme",
    speaker: FOX, character: "fox", pose: "talk", bg: "cave",
    kk: echoLines(BROTHER_NAMES[0]).kk, ru: echoLines(BROTHER_NAMES[0]).ru, // overwritten per session
    criterion: echoLines(BROTHER_NAMES[0]).criterion,
    onCorrect: "found", onReask: "echo_reask", onReveal: "echo_reveal",
  },
  echo_reask: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "cave",
    kk: "Тағы да ойлан. Соңы «-ық» болатын сөз бар ма?",
    ru: "Подумай ещё раз. Есть слово, оканчивающееся на «-ық»?",
    next: "q_echo",
  },
  echo_reveal: {
    kind: "narration", speaker: FOX, character: "fox", pose: "think", bg: "cave",
    kk: "Ештеңе етпейді! Мысалы, «қасық»! Қа-сық! Естідің бе, жаңғырық!",
    ru: "Ничего страшного! Например, «қасық»! Ка-сык! Слышишь, эхо!",
    next: "found",
  },

  // ---- финал ------------------------------------------------------------------
  found: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "dawn", showBrother: true,
    kk: "Міне ол! Інім! Таптық! Қара, таң атып келеді — біз үлгердік!",
    ru: "Вот он! Братик! Нашли! Смотри, светает — мы успели!",
    next: "thanks", // app.js switches to thanks_again on a repeat run
  },
  thanks: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "dawn", showBrother: true,
    kk: "Үңгірде мені тастап кетпегенің үшін рахмет. Сен нағыз доссың! Сау бол!",
    ru: "Спасибо, что не бросил меня в пещере. Ты настоящий друг! До встречи!",
    next: "parent_report",
  },
  thanks_again: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "dawn", showBrother: true,
    kk: "Сен маған екінші рет көмектестің! Мен сені ешқашан ұмытпаймын. Сау бол!",
    ru: "Ты помог мне уже второй раз! Я тебя никогда не забуду. До встречи!",
    next: "parent_report",
  },
  // ---- уроки (index.html?lesson=letters | ?lesson=count) ------------------
  // Two short, separate paths through the same state machine; the fox is the
  // teacher. `overlay` is what app.js draws on the scene for the node;
  // `forms` / `count` are the fixed right answers (nothing is re-rolled).

  // Урок «Әріптер»: буква А. The child repeats «А — алма», not a bare «А»:
  // one short vowel is exactly what Whisper drops or hallucinates on.
  la_intro: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "dawn",
    kk: "Сәлем! Мен — түлкі. Бүгін біз бірінші әріпті үйренеміз. Кеттік!",
    ru: "Привет! Я лисёнок. Сегодня мы выучим первую букву. Поехали!",
    next: "la_show",
  },
  la_show: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "dawn",
    overlay: { letter: "А", apples: 1 },
    kk: "Қара, мынау — А әрпі. А! Алма деген сөз А әрпінен басталады.",
    ru: "Смотри, это буква А. А! Слово «алма» — яблоко — начинается с буквы А.",
    next: "q_letter_a",
  },
  q_letter_a: {
    kind: "question", mode: "exact", skill: "letter",
    speaker: FOX, character: "fox", pose: "talk", bg: "dawn",
    overlay: { letter: "А", apples: 1 },
    forms: ["а"], // matched as a prefix: «а», «алма», «а-а-а» all count
    kk: "Енді менімен бірге айтшы: А — алма!",
    ru: "А теперь скажи вместе со мной: А — алма!",
    criterion:
      "Ребёнок учит букву А и должен повторить «А — алма». Верно (correct) — если он произнёс звук/букву «А» " +
      "или любое слово, начинающееся на «а» (алма, ата, ана, апа, арбуз), на казахском или русском, даже с " +
      "ошибками распознавания. Молчание или слово не на «а» — unclear.",
    onCorrect: "la_ok", onReask: "la_reask", onReveal: "la_reveal",
  },
  la_reask: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "dawn",
    overlay: { letter: "А", apples: 1 },
    kk: "Тағы бір рет айтшы: А — алма!",
    ru: "Скажи ещё раз: А — алма!",
    next: "q_letter_a",
  },
  la_reveal: {
    kind: "narration", speaker: FOX, character: "fox", pose: "think", bg: "dawn",
    overlay: { letter: "А", apples: 1 },
    kk: "Ештеңе етпейді! Бірге айтайық: А! Алма! Бұл — А әрпі.",
    ru: "Ничего страшного! Скажем вместе: А! Алма! Это буква А.",
    next: "la_done",
  },
  la_ok: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "dawn",
    overlay: { letter: "А", apples: 1 },
    kk: "Жарайсың! Бұл — А әрпі!",
    ru: "Молодец! Это буква А!",
    next: "la_done",
  },
  la_done: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "dawn",
    overlay: { letter: "А", apples: 1 },
    kk: "Бүгін сен А әрпін үйрендің. Алма, ата, ана — бәрі А әрпінен басталады. Сау бол!",
    ru: "Сегодня ты выучил букву А. Алма, ата, ана — всё начинается на А. До встречи!",
    next: "parent_report",
  },

  // Урок «Санау»: счёт до пяти на яблоках.
  lc_intro: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "dawn",
    kk: "Сәлем! Мен — түлкі. Бүгін біз беске дейін санауды үйренеміз. Кеттік!",
    ru: "Привет! Я лисёнок. Сегодня мы научимся считать до пяти. Поехали!",
    next: "lc_show",
  },
  lc_show: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "dawn",
    overlay: { apples: 5, slow: true },
    kk: "Алмаларды бірге санайық! Тыңда: бір, екі, үш, төрт, бес!",
    ru: "Посчитаем яблоки вместе! Слушай: один, два, три, четыре, пять!",
    next: "q_count5",
  },
  q_count5: {
    kind: "question", mode: "exact", skill: "count", count: 5,
    speaker: FOX, character: "fox", pose: "talk", bg: "dawn",
    overlay: { apples: 5 },
    kk: "Қара, неше алма бар? Санап көрші!",
    ru: "Смотри, сколько яблок? Посчитай!",
    criterion:
      "Правильный ответ — число пять (5). Засчитывай верным любое произношение этого числа на казахском " +
      "(«бес») или русском («пять», «5»), в том числе если ребёнок считает вслух и заканчивает на пяти " +
      "(«бір, екі, үш, төрт, бес»). Другое число, молчание или посторонний ответ — unclear.",
    onCorrect: "lc_ok", onReask: "lc_reask", onReveal: "lc_reveal",
  },
  lc_reask: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "dawn",
    overlay: { apples: 5 },
    kk: "Алмаларды тағы бір рет санап көрші.",
    ru: "Посчитай яблоки ещё раз.",
    next: "q_count5",
  },
  lc_reveal: {
    kind: "narration", speaker: FOX, character: "fox", pose: "think", bg: "dawn",
    overlay: { apples: 5, slow: true },
    kk: "Ештеңе етпейді! Бірге санайық: бір, екі, үш, төрт, бес! Бес алма екен!",
    ru: "Не страшно! Давай посчитаем вместе: один, два, три, четыре, пять! Пять яблок!",
    next: "lc_done",
  },
  lc_ok: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "dawn",
    overlay: { apples: 5 },
    kk: "Дұрыс! Бес алма! Сен өте ақылдысың!",
    ru: "Правильно! Пять яблок! Ты очень умный!",
    next: "lc_done",
  },
  lc_done: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "dawn",
    overlay: { apples: 5 },
    kk: "Бүгін сен беске дейін санауды үйрендің: бір, екі, үш, төрт, бес. Жарайсың! Сау бол!",
    ru: "Сегодня ты научился считать до пяти: один, два, три, четыре, пять. Молодец! До встречи!",
    next: "parent_report",
  },

  // Урок «Қосу»: 2 + 1 на яблоках. Ответ — число, проверяется как счёт.
  lp_intro: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "dawn",
    kk: "Сәлем! Мен — түлкі. Бүгін біз қосуды үйренеміз. Кеттік!",
    ru: "Привет! Я лисёнок. Сегодня мы научимся складывать. Поехали!",
    next: "lp_show",
  },
  lp_show: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "dawn",
    overlay: { apples: 2, plus: 1, slow: true },
    kk: "Қара, менде екі алма бар. Тағы бір алма қостым. Екіге бірді қосамыз!",
    ru: "Смотри, у меня два яблока. Я добавил ещё одно. К двум прибавляем один!",
    next: "q_plus",
  },
  q_plus: {
    kind: "question", mode: "exact", skill: "plus", count: 3,
    speaker: FOX, character: "fox", pose: "talk", bg: "dawn",
    overlay: { apples: 2, plus: 1 },
    kk: "Екі алмаға бір алма қостық. Барлығы неше алма болды?",
    ru: "К двум яблокам добавили одно. Сколько всего яблок стало?",
    criterion:
      "Задача 2 + 1. Правильный ответ — число три (3). Засчитывай верным любое произношение этого числа на " +
      "казахском («үш») или русском («три», «3»), в том числе если ребёнок считает вслух и заканчивает на трёх " +
      "(«бір, екі, үш»). Другое число, молчание или посторонний ответ — unclear.",
    onCorrect: "lp_ok", onReask: "lp_reask", onReveal: "lp_reveal",
  },
  lp_reask: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "dawn",
    overlay: { apples: 2, plus: 1 },
    kk: "Барлық алманы санап көрші.",
    ru: "Посчитай все яблоки.",
    next: "q_plus",
  },
  lp_reveal: {
    kind: "narration", speaker: FOX, character: "fox", pose: "think", bg: "dawn",
    overlay: { apples: 2, plus: 1, slow: true },
    kk: "Ештеңе етпейді! Бірге санайық: бір, екі, үш! Екіге бірді қоссақ, үш болады!",
    ru: "Не страшно! Посчитаем вместе: один, два, три! Два плюс один будет три!",
    next: "lp_done",
  },
  lp_ok: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "dawn",
    overlay: { apples: 2, plus: 1 },
    kk: "Дұрыс! Екіге бірді қоссақ, үш болады! Жарайсың!",
    ru: "Правильно! Два плюс один будет три! Молодец!",
    next: "lp_done",
  },
  lp_done: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "dawn",
    overlay: { apples: 2, plus: 1 },
    kk: "Бүгін сен қосуды үйрендің: екіге бірді қоссақ — үш. Сау бол!",
    ru: "Сегодня ты научился складывать: два плюс один — три. До встречи!",
    next: "parent_report",
  },

  // Урок «Азайту»: 4 − 1, лисёнок «съедает» одно яблоко.
  lm_intro: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "dawn",
    kk: "Сәлем! Мен — түлкі. Бүгін біз азайтуды үйренеміз. Кеттік!",
    ru: "Привет! Я лисёнок. Сегодня мы научимся вычитать. Поехали!",
    next: "lm_show",
  },
  lm_show: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "dawn",
    overlay: { apples: 4, minus: 1, slow: true },
    kk: "Қара, менде төрт алма бар еді. Бір алманы жеп қойдым!",
    ru: "Смотри, у меня было четыре яблока. Одно яблоко я съел!",
    next: "q_minus",
  },
  q_minus: {
    kind: "question", mode: "exact", skill: "minus", count: 3,
    speaker: FOX, character: "fox", pose: "talk", bg: "dawn",
    overlay: { apples: 4, minus: 1 },
    kk: "Төрт алма бар еді, біреуін жедім. Неше алма қалды?",
    ru: "Было четыре яблока, одно я съел. Сколько яблок осталось?",
    criterion:
      "Задача 4 − 1. Правильный ответ — число три (3). Засчитывай верным любое произношение этого числа на " +
      "казахском («үш») или русском («три», «3»), в том числе если ребёнок считает вслух и заканчивает на трёх " +
      "(«бір, екі, үш»). Другое число, молчание или посторонний ответ — unclear.",
    onCorrect: "lm_ok", onReask: "lm_reask", onReveal: "lm_reveal",
  },
  lm_reask: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "dawn",
    overlay: { apples: 4, minus: 1 },
    kk: "Қалған алмаларды санап көрші.",
    ru: "Посчитай яблоки, которые остались.",
    next: "q_minus",
  },
  lm_reveal: {
    kind: "narration", speaker: FOX, character: "fox", pose: "think", bg: "dawn",
    overlay: { apples: 4, minus: 1 },
    kk: "Ештеңе етпейді! Бірге санайық: бір, екі, үш! Төрттен бірді алсақ, үш қалады!",
    ru: "Не страшно! Посчитаем вместе: один, два, три! Четыре минус один — останется три!",
    next: "lm_done",
  },
  lm_ok: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "dawn",
    overlay: { apples: 4, minus: 1 },
    kk: "Дұрыс! Төрттен бірді алсақ, үш қалады! Жарайсың!",
    ru: "Правильно! Четыре минус один — останется три! Молодец!",
    next: "lm_done",
  },
  lm_done: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "dawn",
    overlay: { apples: 4, minus: 1 },
    kk: "Бүгін сен азайтуды үйрендің: төрттен бірді алсақ — үш. Сау бол!",
    ru: "Сегодня ты научился вычитать: четыре минус один — три. До встречи!",
    next: "parent_report",
  },

  // Урок «Жазу»: обвести букву А пальцем. `trace` — не голосовой вопрос:
  // app.js рисует контур и сам решает, когда буква обведена (onCorrect) или
  // ребёнок давно не трогает экран (onReveal).
  lw_intro: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "dawn",
    kk: "Сәлем! Мен — түлкі. Бүгін біз А әрпін жазуды үйренеміз. Кеттік!",
    ru: "Привет! Я лисёнок. Сегодня мы научимся писать букву А. Поехали!",
    next: "lw_trace",
  },
  lw_trace: {
    kind: "trace", skill: "write", letter: "А",
    speaker: FOX, character: "fox", pose: "talk", bg: "dawn",
    kk: "Саусағыңмен сызықтардың үстінен жүргіз. А әрпін жазып көр!",
    ru: "Проведи пальцем по линиям. Попробуй написать букву А!",
    onCorrect: "lw_ok", onReveal: "lw_reveal",
  },
  lw_reveal: {
    kind: "narration", speaker: FOX, character: "fox", pose: "think", bg: "dawn",
    overlay: { letter: "А" },
    kk: "Ештеңе етпейді! Қара, А әрпі осылай жазылады. Келесі жолы бірге жазамыз.",
    ru: "Ничего страшного! Смотри, буква А пишется вот так. В следующий раз напишем вместе.",
    next: "lw_done",
  },
  lw_ok: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "dawn",
    overlay: { letter: "А" },
    kk: "Керемет! Сен А әрпін жаздың!",
    ru: "Здорово! Ты написал букву А!",
    next: "lw_done",
  },
  lw_done: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "dawn",
    overlay: { letter: "А" },
    kk: "Бүгін сен А әрпін жазуды үйрендің. Жарайсың! Сау бол!",
    ru: "Сегодня ты научился писать букву А. Молодец! До встречи!",
    next: "parent_report",
  },

  parent_report: { kind: "end", speaker: "", kk: "", ru: "" },
};

const START_STATE = "intro";
const START_STATE_AGAIN = "intro_again";
const FINAL_IDS = new Set(["found", "thanks", "thanks_again", "parent_report"]);
// ?lesson=<key>: each lesson has its own start and its own finale (the node
// the session cap jumps to instead of the story's `found`).
const LESSONS = {
  letters: { start: "la_intro", done: "la_done", title: "Әріптер: А", kk: "Түлкімен бірге А әрпін үйрен — дауыспен қайтала", ru: "Учим букву А вместе с лисёнком — повторяй голосом" },
  count: { start: "lc_intro", done: "lc_done", title: "Санау: беске дейін", kk: "Алмаларды түлкімен бірге сана — дауыспен жауап бер", ru: "Считаем яблоки с лисёнком — отвечай голосом" },
  plus: { start: "lp_intro", done: "lp_done", title: "Қосу: 2 + 1", kk: "Алмаларды қосып көр — дауыспен жауап бер", ru: "Складываем яблоки — отвечай голосом" },
  minus: { start: "lm_intro", done: "lm_done", title: "Азайту: 4 − 1", kk: "Неше алма қалды? Дауыспен жауап бер", ru: "Сколько яблок осталось? Отвечай голосом" },
  write: { start: "lw_intro", done: "lw_done", title: "Жазу: А әрпі", kk: "А әрпін саусағыңмен жазып көр", ru: "Обведи букву А пальцем" },
};

// ---- Урок «А әрпі» (буква А) ---------------------------------------------
// A 3-5 minute letter lesson for children with speech delay / dysarthria /
// ASD — mirrors docs/lesson-letter-a.md the same way STORY mirrors
// docs/story-script.md. Same node kinds as STORY plus:
//   mode "imitate" : the child repeats a sound/word after the hero. `accept`
//                    lists the surface forms a 3-7-year-old (and Whisper on
//                    one) actually produce; `acceptPrefix` accepts any word
//                    starting with the target sound, because the lesson is
//                    about the SOUND, not the exact word.
//   mode "pick"    : two big picture cards on stage; the child says the word
//                    OR taps the card. `choices` draws the cards, `onAnswer`
//                    maps the right card(s), `onOther` the wrong-but-not-
//                    failed ones (the hero corrects gently and asks again
//                    without spending a re-ask).
// Every node may carry `letter` (big Аа kept on screen) and `picture`
// (one non-interactive card beside the hero).
// The lesson can never be failed: two gentle re-asks, then the hero shows
// the answer himself and praises the attempt — exactly STORY's ladder.
const LESSON_A_SOUND_FORMS = ["а", "аа", "ааа", "ах", "аһ", "эа", "ай"];
const LESSON_A_ALMA_FORMS = ["алма", "ама", "альма", "амма", "аба", "алта", "яблоко", "ябоко", "яблако", "ябко"];
const LESSON_A_PICK_FORMS = {
  alma: ["алма", "ама", "альма", "яблоко", "ябоко", "яблако"],
  dop: ["доп", "топ", "мяч", "мячик", "мяс"],
};
const LESSON_A_ANA_FORMS = ["ана", "анам", "анашым", "мама", "мам", "апа", "әже"];

const LESSON_A = {
  // ---- пролог -----------------------------------------------------------
  a_intro: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "lesson", letter: "Аа",
    kk: "Сәлем! Мен — түлкі. Бүгін мен сені бір әріппен таныстырамын. Ол — ең бірінші әріп!",
    ru: "Привет! Я лисёнок. Сегодня я познакомлю тебя с одной буквой. Это самая первая буква!",
    next: "a_show",
  },
  a_intro_again: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "lesson", letter: "Аа",
    kk: "Сен қайта келдің! Есіңде ме, А әрпі? Бүгін тағы ойнайық!",
    ru: "Ты вернулся! Помнишь букву А? Давай сегодня поиграем ещё!",
    next: "a_show",
  },
  a_show: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "lesson", letter: "Аа",
    kk: "Міне, А әрпі! Қара, қандай үлкен! А-а-а!",
    ru: "Вот буква А! Смотри, какая большая! А-а-а!",
    next: "a_mouth",
  },
  a_mouth: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "lesson", letter: "Аа", picture: "mouth",
    kk: "А дегенде ауызды кең ашамыз. Қара маған: А-а-а!",
    ru: "Когда говорим А — широко открываем рот. Смотри на меня: А-а-а!",
    next: "q_a_sound",
  },

  // ---- звук: имитация -----------------------------------------------------
  q_a_sound: {
    kind: "question", mode: "imitate", skill: "sound_a",
    speaker: FOX, character: "fox", pose: "talk", bg: "lesson", letter: "Аа", picture: "mouth",
    kk: "Енді сен! Менімен бірге: А-а-а!",
    ru: "Теперь ты! Вместе со мной: А-а-а!",
    accept: LESSON_A_SOUND_FORMS, acceptPrefix: ["а", "я"],
    criterion:
      "Ребёнок должен произнести протяжный звук [а] («А-а-а»). Засчитывай верным (correct) любой ответ, " +
      "в котором есть открытый гласный «а»: «а», «аа», «а-а-а», «ах», а также любое слово, начинающееся на " +
      "«а» или «я» — цель урока звук, не слово. Кашель, тишина, посторонний шум без гласного «а» — unclear.",
    onCorrect: "a_sound_ok", onReask: "a_sound_reask", onReveal: "a_sound_reveal",
  },
  a_sound_reask: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "lesson", letter: "Аа", picture: "mouth",
    kk: "Ауызды кеңірек аш. Қолыңды иегіңе қойшы... А-а-а!",
    ru: "Открой рот пошире. Положи руку на подбородок… А-а-а!",
    next: "q_a_sound",
  },
  a_sound_reveal: {
    kind: "narration", speaker: FOX, character: "fox", pose: "think", bg: "lesson", letter: "Аа",
    kk: "А-а-а! Міне, солай! Сен тырыстың — жарайсың!",
    ru: "А-а-а! Вот так! Ты старался — молодец!",
    next: "a_words",
  },
  a_sound_ok: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "lesson", letter: "Аа",
    kk: "Жарайсың! Нағыз А!",
    ru: "Молодец! Настоящая А!",
    next: "a_words",
  },

  // ---- слово: алма --------------------------------------------------------
  a_words: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "lesson", letter: "Аа",
    kk: "А әрпінен басталатын сөздер көп. Мен саған біреуін көрсетейін.",
    ru: "Слов на букву А много. Я покажу тебе одно.",
    next: "q_a_alma",
  },
  q_a_alma: {
    kind: "question", mode: "imitate", skill: "word_a",
    speaker: FOX, character: "fox", pose: "talk", bg: "lesson", letter: "Аа", picture: "alma",
    kk: "Бұл — алма. Ал-ма. Айтшы: ал-ма!",
    ru: "Это — яблоко, алма. Ал-ма. Скажи: ал-ма!",
    accept: LESSON_A_ALMA_FORMS, acceptPrefix: ["а"],
    criterion:
      "Ребёнок повторяет слово «алма» (яблоко) по картинке. Засчитывай верным (correct) «алма» и детские " +
      "искажения («ама», «альма», «амма», «аба»), а также «яблоко»/«ябоко» — ребёнок понял картинку. Любое " +
      "слово, начинающееся на «а», тоже верно — цель урока звук [а]. Молчание или посторонний ответ — unclear.",
    onCorrect: "a_alma_ok", onReask: "a_alma_reask", onReveal: "a_alma_reveal",
  },
  a_alma_reask: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "lesson", letter: "Аа", picture: "alma",
    kk: "Бірге айтайық, ақырын: ал… ма. Ал-ма!",
    ru: "Скажем вместе, медленно: ал… ма. Ал-ма!",
    next: "q_a_alma",
  },
  a_alma_reveal: {
    kind: "narration", speaker: FOX, character: "fox", pose: "think", bg: "lesson", letter: "Аа", picture: "alma",
    kk: "Ал-ма! Алма — А әрпінен басталады. Жарайсың, тырыстың!",
    ru: "Ал-ма! Алма начинается с А. Молодец, ты старался!",
    next: "q_a_pick",
  },
  a_alma_ok: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "lesson", letter: "Аа", picture: "alma",
    kk: "Дұрыс! Алма! Алма — А-дан басталады!",
    ru: "Правильно! Алма! Алма начинается с А!",
    next: "q_a_pick",
  },

  // ---- выбор: где А? ------------------------------------------------------
  q_a_pick: {
    kind: "question", mode: "pick", skill: "pick_a",
    speaker: FOX, character: "fox", pose: "talk", bg: "lesson", letter: "Аа",
    kk: "Қара: алма және доп. Қайсысы А-дан басталады? Айтшы немесе саусағыңмен көрсет!",
    ru: "Смотри: яблоко и мяч. Что начинается на А? Скажи или покажи пальчиком!",
    choices: [
      { id: "alma", kk: "алма", ru: "яблоко", picture: "alma", forms: LESSON_A_PICK_FORMS.alma },
      { id: "dop", kk: "доп", ru: "мяч", picture: "dop", forms: LESSON_A_PICK_FORMS.dop },
    ],
    criterion:
      "На экране две картинки: яблоко (алма) и мяч (доп). Ребёнок должен назвать то, что начинается на А. " +
      'Если он сказал «алма»/«яблоко» — верни label "correct" и reason ровно "alma". Если «доп»/«мяч» — ' +
      'label "correct" и reason ровно "dop" (герой мягко поправит). Иначе — "unclear".',
    onAnswer: { alma: "a_pick_ok" }, onOther: { dop: "a_pick_other" },
    onReask: "a_pick_reask", onReveal: "a_pick_reveal",
  },
  a_pick_other: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "lesson", letter: "Аа", picture: "dop",
    kk: "Бұл — доп. Д-д-доп. Ал А қайда? Тағы қарашы!",
    ru: "Это — мяч, доп. Д-д-доп. А где А? Посмотри ещё!",
    next: "q_a_pick",
  },
  a_pick_reask: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "lesson", letter: "Аа",
    kk: "Алма қайда? Алманы көрсетші!",
    ru: "Где алма? Покажи алму!",
    next: "q_a_pick",
  },
  a_pick_reveal: {
    kind: "narration", speaker: FOX, character: "fox", pose: "think", bg: "lesson", letter: "Аа", picture: "alma",
    kk: "Міне, алма! А-а-алма! Жарайсың!",
    ru: "Вот алма! А-а-алма! Молодец!",
    next: "q_a_ana",
  },
  a_pick_ok: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "lesson", letter: "Аа", picture: "alma",
    kk: "Дұрыс! Алма — А! Сен таптың!",
    ru: "Правильно! Алма — А! Ты нашёл!",
    next: "q_a_ana",
  },

  // ---- ана: эмоциональная опора ------------------------------------------
  q_a_ana: {
    kind: "question", mode: "open", skill: "open_a",
    speaker: FOX, character: "fox", pose: "talk", bg: "lesson", letter: "Аа", picture: "ana",
    kk: "Ана деген сөз де А-дан басталады. А-на. Сенің анаң бар ма? Ол туралы бірдеңе айтшы!",
    ru: "Слово «ана» — мама — тоже начинается с А. А-на. У тебя есть мама? Расскажи что-нибудь о ней!",
    accept: LESSON_A_ANA_FORMS,
    criterion:
      "Лисёнок просит ребёнка сказать что-нибудь про маму («ана»). Это узел эмоционального контакта, не " +
      "проверка: любая речь — correct, включая одно слово «ана», «мама», «апа», имя. Только тишина или " +
      "явный шум без слов — unclear. Будь щедрым.",
    onCorrect: "a_ana_ok", onReask: "a_ana_reask", onReveal: "a_ana_reveal",
  },
  a_ana_reask: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "lesson", letter: "Аа", picture: "ana",
    kk: "Анаңды қалай атайсың? «Ана»? «Мама»? Айтшы!",
    ru: "Как ты зовёшь маму? «Ана»? «Мама»? Скажи!",
    next: "q_a_ana",
  },
  a_ana_reveal: {
    kind: "narration", speaker: FOX, character: "fox", pose: "think", bg: "lesson", letter: "Аа", picture: "ana",
    kk: "А-на. Мама. Ана бізді сүйеді. Жарайсың!",
    ru: "А-на. Мама. Мама нас любит. Молодец!",
    next: "a_chant",
  },
  a_ana_ok: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "lesson", letter: "Аа", picture: "ana",
    kk: "Қандай жақсы! Ана — А-дан басталады!",
    ru: "Как хорошо! Ана — на букву А!",
    next: "a_chant",
  },

  // ---- песенка и финал ----------------------------------------------------
  a_chant: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "lesson", letter: "Аа", chant: true,
    kk: "А-а-а — алма! А-а-а — ана! А-а-а — аю! А әрпі — ең бірінші әріп!",
    ru: "А-а-а — алма! А-а-а — ана! А-а-а — аю (медведь)! Буква А — самая первая буква!",
    next: "a_bye",
  },
  a_bye: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "lesson", letter: "Аа",
    kk: "Бүгін біз А әрпімен таныстық! Сен керемет тырыстың. Ертең тағы кел, басқа әріп күтіп тұр!",
    ru: "Сегодня мы познакомились с буквой А! Ты отлично старался. Приходи завтра — ждёт другая буква!",
    next: "parent_report",
  },
};

// ---- Уроки «О әрпі» и «Ұ әрпі» -------------------------------------------
// Same 3-5 minute ladder as LESSON_A (docs/lesson-letter-a.md): the sound by
// imitation with an articulation picture, one word with a picture, «which
// one starts with the letter?» (say it or tap the card), one open question
// for emotional contact, a chant. Node ids are prefixed (o_ / q_o_, u_ /
// q_u_) so all lessons share one id space with the tale and public/audio/.
//
// Why Ұ and not У: in Kazakh «у» is a glide (су, қуыршақ) with almost no
// child words to start with — and «у» alone means «poison». The rounded
// vowel a speech therapist trains as [у] is Ұ: ұшақ, ұнайды, ұя. A Russian
// speaker's «у-у-у» is accepted as the same sound.
const lessonNode = (letter, node) => ({ speaker: FOX, character: "fox", bg: "lesson", letter, ...node });

const LESSON_O_SOUND_FORMS = ["о", "оо", "ооо", "ох", "оһ", "ой", "уо"];
const LESSON_O_OT_FORMS = ["от", "оот", "отт", "огонь", "огонёк", "огонек", "агонь"];
const LESSON_O_PICK_FORMS = {
  ot: ["от", "оот", "огонь", "огонёк", "огонек", "агонь"],
  mysyq: ["мысық", "мысы", "мышық", "мысык", "кошка", "киса", "котик", "мяу"],
};
const LESSON_O_TOY_FORMS = ["ойыншық", "ойыншығым", "игрушка", "доп", "қуыршақ", "машина", "аю", "мяч", "кукла"];

const oNode = (node) => lessonNode("Оо", node);
const LESSON_O = {
  o_intro: oNode({ kind: "narration", pose: "talk",
    kk: "Сәлем! Бүгін біз жаңа әріппен танысамыз. Ол дөп-дөңгелек, сақина сияқты!",
    ru: "Привет! Сегодня мы познакомимся с новой буквой. Она круглая-круглая, как колечко!",
    next: "o_show" }),
  o_intro_again: oNode({ kind: "narration", pose: "talk",
    kk: "Сен қайта келдің! Есіңде ме, дөңгелек О әрпі? Бүгін тағы ойнайық!",
    ru: "Ты вернулся! Помнишь круглую букву О? Давай сегодня поиграем ещё!",
    next: "o_show" }),
  o_show: oNode({ kind: "narration", pose: "happy",
    kk: "Міне, О әрпі! Қара, дөп-дөңгелек! О-о-о!",
    ru: "Вот буква О! Смотри, какая круглая! О-о-о!",
    next: "o_mouth" }),
  o_mouth: oNode({ kind: "narration", pose: "talk", picture: "mouth_o",
    kk: "О дегенде ерінімізді дөңгелетеміз — дәл О әрпі сияқты. Қара маған: О-о-о!",
    ru: "Когда говорим О — губы делаем кругленькими, прямо как буква О. Смотри на меня: О-о-о!",
    next: "q_o_sound" }),

  q_o_sound: oNode({ kind: "question", mode: "imitate", skill: "sound_o", pose: "talk", picture: "mouth_o",
    kk: "Енді сен! Менімен бірге: О-о-о!",
    ru: "Теперь ты! Вместе со мной: О-о-о!",
    accept: LESSON_O_SOUND_FORMS, acceptPrefix: ["о"],
    criterion:
      "Ребёнок должен произнести протяжный звук [о] («О-о-о»). Засчитывай верным (correct) любой ответ " +
      "с округлым гласным «о»: «о», «оо», «о-о-о», «ох», «ой», а также любое слово, начинающееся на «о» — " +
      "цель урока звук, не слово. Тишина, кашель, шум без гласного «о» — unclear.",
    onCorrect: "o_sound_ok", onReask: "o_sound_reask", onReveal: "o_sound_reveal" }),
  o_sound_reask: oNode({ kind: "narration", pose: "confused", picture: "mouth_o",
    kk: "Ерініңді дөңгелетші, міне былай… О-о-о!",
    ru: "Сделай губы кругленькими, вот так… О-о-о!",
    next: "q_o_sound" }),
  o_sound_reveal: oNode({ kind: "narration", pose: "think",
    kk: "О-о-о! Міне, солай! Сен тырыстың — жарайсың!",
    ru: "О-о-о! Вот так! Ты старался — молодец!",
    next: "o_words" }),
  o_sound_ok: oNode({ kind: "narration", pose: "happy",
    kk: "Жарайсың! Нағыз О!",
    ru: "Молодец! Настоящая О!",
    next: "o_words" }),

  o_words: oNode({ kind: "narration", pose: "talk",
    kk: "О әрпінен басталатын сөздер де бар. Мен саған біреуін көрсетейін.",
    ru: "Есть слова и на букву О. Я покажу тебе одно.",
    next: "q_o_ot" }),
  q_o_ot: oNode({ kind: "question", mode: "imitate", skill: "word_o", pose: "talk", picture: "ot",
    kk: "Бұл — от. От жылы, бірақ оған жақын бармаймыз! Айтшы: о-от!",
    ru: "Это — огонь, от. Он тёплый, но близко к нему не подходим! Скажи: о-от!",
    accept: LESSON_O_OT_FORMS, acceptPrefix: ["о"],
    criterion:
      "Ребёнок повторяет слово «от» (огонь) по картинке костра. Засчитывай верным (correct) «от», " +
      "растянутое «о-от», «огонь»/«огонёк» и детские искажения («агонь»). Любое слово на «о» тоже верно — " +
      "цель урока звук [о]. Молчание или посторонний ответ — unclear.",
    onCorrect: "o_ot_ok", onReask: "o_ot_reask", onReveal: "o_ot_reveal" }),
  o_ot_reask: oNode({ kind: "narration", pose: "confused", picture: "ot",
    kk: "Бірге айтайық, ақырын: о… от. От!",
    ru: "Скажем вместе, медленно: о… от. От!",
    next: "q_o_ot" }),
  o_ot_reveal: oNode({ kind: "narration", pose: "think", picture: "ot",
    kk: "О-от! От — О әрпінен басталады. Жарайсың, тырыстың!",
    ru: "О-от! От начинается с О. Молодец, ты старался!",
    next: "q_o_pick" }),
  o_ot_ok: oNode({ kind: "narration", pose: "happy", picture: "ot",
    kk: "Дұрыс! От! От — О-дан басталады!",
    ru: "Правильно! От! От начинается с О!",
    next: "q_o_pick" }),

  q_o_pick: oNode({ kind: "question", mode: "pick", skill: "pick_o", pose: "talk",
    kk: "Қара: от және мысық. Қайсысы О-дан басталады? Айтшы немесе саусағыңмен көрсет!",
    ru: "Смотри: огонь и кошка. Что начинается на О? Скажи или покажи пальчиком!",
    choices: [
      { id: "ot", kk: "от", ru: "огонь", picture: "ot", forms: LESSON_O_PICK_FORMS.ot },
      { id: "mysyq", kk: "мысық", ru: "кошка", picture: "mysyq", forms: LESSON_O_PICK_FORMS.mysyq },
    ],
    criterion:
      "На экране две картинки: огонь (от) и кошка (мысық). Ребёнок должен назвать то, что начинается на О. " +
      'Если он сказал «от»/«огонь» — верни label "correct" и reason ровно "ot". Если «мысық»/«кошка»/«мяу» — ' +
      'label "correct" и reason ровно "mysyq" (герой мягко поправит). Иначе — "unclear".',
    onAnswer: { ot: "o_pick_ok" }, onOther: { mysyq: "o_pick_other" },
    onReask: "o_pick_reask", onReveal: "o_pick_reveal" }),
  o_pick_other: oNode({ kind: "narration", pose: "confused", picture: "mysyq",
    kk: "Бұл — мысық. М-м-мысық. Ал О қайда? Тағы қарашы!",
    ru: "Это — кошка, мысық. М-м-мысық. А где О? Посмотри ещё!",
    next: "q_o_pick" }),
  o_pick_reask: oNode({ kind: "narration", pose: "confused",
    kk: "От қайда? Отты көрсетші!",
    ru: "Где огонь? Покажи огонь!",
    next: "q_o_pick" }),
  o_pick_reveal: oNode({ kind: "narration", pose: "think", picture: "ot",
    kk: "Міне, от! О-о-от! Жарайсың!",
    ru: "Вот огонь! О-о-от! Молодец!",
    next: "q_o_toy" }),
  o_pick_ok: oNode({ kind: "narration", pose: "happy", picture: "ot",
    kk: "Дұрыс! От — О! Сен таптың!",
    ru: "Правильно! От — О! Ты нашёл!",
    next: "q_o_toy" }),

  q_o_toy: oNode({ kind: "question", mode: "open", skill: "open_o", pose: "talk", picture: "oiynshyq",
    kk: "Ойыншық деген сөз де О-дан басталады. Ой-ын-шық. Сенің сүйікті ойыншығың қандай? Айтшы!",
    ru: "Слово «ойыншық» — игрушка — тоже начинается с О. Ой-ын-шық. Какая твоя любимая игрушка? Расскажи!",
    accept: LESSON_O_TOY_FORMS,
    criterion:
      "Лисёнок спрашивает про любимую игрушку. Это узел эмоционального контакта, не проверка: любая речь — " +
      "correct, включая одно слово («доп», «мяч», «қуыршақ», «машина», имя игрушки). Только тишина или явный " +
      "шум без слов — unclear. Будь щедрым.",
    onCorrect: "o_toy_ok", onReask: "o_toy_reask", onReveal: "o_toy_reveal" }),
  o_toy_reask: oNode({ kind: "narration", pose: "confused", picture: "oiynshyq",
    kk: "Сен немен ойнағанды жақсы көресің? Доппен бе? Қуыршақпен бе? Айтшы!",
    ru: "Чем ты любишь играть? Мячом? Куклой? Скажи!",
    next: "q_o_toy" }),
  o_toy_reveal: oNode({ kind: "narration", pose: "think", picture: "oiynshyq",
    kk: "Ойыншық! Менің сүйікті ойыншығым — доп. Жарайсың!",
    ru: "Игрушка! Моя любимая игрушка — мяч. Молодец!",
    next: "o_chant" }),
  o_toy_ok: oNode({ kind: "narration", pose: "happy", picture: "oiynshyq",
    kk: "Қандай керемет! Ойыншық — О-дан басталады!",
    ru: "Как здорово! Ойыншық — на букву О!",
    next: "o_chant" }),

  o_chant: oNode({ kind: "narration", pose: "happy", chant: true,
    kk: "О-о-о — от! О-о-о — ойыншық! О-о-о — орман! О әрпі — дөп-дөңгелек әріп!",
    ru: "О-о-о — огонь! О-о-о — игрушка! О-о-о — лес (орман)! Буква О — круглая буква!",
    next: "o_bye" }),
  o_bye: oNode({ kind: "narration", pose: "happy",
    kk: "Бүгін біз О әрпімен таныстық! Сен керемет тырыстың. Ертең тағы кел!",
    ru: "Сегодня мы познакомились с буквой О! Ты отлично старался. Приходи завтра ещё!",
    next: "parent_report" }),
};

const LESSON_U_SOUND_FORMS = ["ұ", "ұұ", "ұұұ", "у", "уу", "ууу", "ух", "уһ", "ү", "үү"];
const LESSON_U_USHAQ_FORMS = ["ұшақ", "ушақ", "ушак", "ұшак", "ұсақ", "усак", "самолёт", "самолет", "самолот", "амолёт"];
const LESSON_U_PICK_FORMS = {
  ushaq: ["ұшақ", "ушақ", "ушак", "ұшак", "самолёт", "самолет", "самолот"],
  alma: ["алма", "ама", "альма", "яблоко", "ябоко", "яблако"],
};
const LESSON_U_LIKE_FORMS = ["ұнайды", "унайды", "ұнайды маған", "нравится", "люблю", "жақсы көремін", "ойнау", "алма", "мама", "ана"];

const uNode = (node) => lessonNode("Ұұ", node);
const LESSON_U = {
  u_intro: uNode({ kind: "narration", pose: "talk",
    kk: "Сәлем! Бүгін біз жаңа әріппен танысамыз. Ол ұшақ сияқты дыбыстайды: ұ-ұ-ұ!",
    ru: "Привет! Сегодня мы познакомимся с новой буквой. Она звучит, как самолёт: у-у-у!",
    next: "u_show" }),
  u_intro_again: uNode({ kind: "narration", pose: "talk",
    kk: "Сен қайта келдің! Есіңде ме, ұшақтың әрпі Ұ? Бүгін тағы ойнайық!",
    ru: "Ты вернулся! Помнишь букву Ұ — как самолёт? Давай сегодня поиграем ещё!",
    next: "u_show" }),
  u_show: uNode({ kind: "narration", pose: "happy",
    kk: "Міне, Ұ әрпі! Қара, аяғында кішкентай сызықша бар. Ұ-ұ-ұ!",
    ru: "Вот буква Ұ! Смотри, на ножке у неё маленькая чёрточка. У-у-у!",
    next: "u_mouth" }),
  u_mouth: uNode({ kind: "narration", pose: "talk", picture: "mouth_u",
    kk: "Ұ дегенде ерінімізді түтікше қылып алға созамыз. Қара маған: Ұ-ұ-ұ!",
    ru: "Когда говорим Ұ — вытягиваем губы вперёд трубочкой. Смотри на меня: У-у-у!",
    next: "q_u_sound" }),

  q_u_sound: uNode({ kind: "question", mode: "imitate", skill: "sound_u", pose: "talk", picture: "mouth_u",
    kk: "Енді сен! Менімен бірге: Ұ-ұ-ұ!",
    ru: "Теперь ты! Вместе со мной: У-у-у!",
    accept: LESSON_U_SOUND_FORMS, acceptPrefix: ["ұ", "у", "ү"],
    criterion:
      "Ребёнок должен произнести протяжный звук [у] — по-казахски Ұ («Ұ-ұ-ұ», «у-у-у»). Засчитывай верным " +
      "(correct) любой ответ с гласным «ұ», «у» или «ү»: «у», «уу», «у-у-у», «ух», а также любое слово, " +
      "начинающееся на эти звуки — цель урока звук, не слово. Тишина, кашель, шум без этого гласного — unclear.",
    onCorrect: "u_sound_ok", onReask: "u_sound_reask", onReveal: "u_sound_reveal" }),
  u_sound_reask: uNode({ kind: "narration", pose: "confused", picture: "mouth_u",
    kk: "Ерініңді түтікше қылып созшы… Ұ-ұ-ұ!",
    ru: "Вытяни губы трубочкой… У-у-у!",
    next: "q_u_sound" }),
  u_sound_reveal: uNode({ kind: "narration", pose: "think",
    kk: "Ұ-ұ-ұ! Міне, солай! Сен тырыстың — жарайсың!",
    ru: "У-у-у! Вот так! Ты старался — молодец!",
    next: "u_words" }),
  u_sound_ok: uNode({ kind: "narration", pose: "happy",
    kk: "Жарайсың! Нағыз Ұ!",
    ru: "Молодец! Настоящая Ұ!",
    next: "u_words" }),

  u_words: uNode({ kind: "narration", pose: "talk",
    kk: "Ұ әрпінен басталатын сөздер де бар. Мен саған біреуін көрсетейін.",
    ru: "Есть слова и на букву Ұ. Я покажу тебе одно.",
    next: "q_u_ushaq" }),
  q_u_ushaq: uNode({ kind: "question", mode: "imitate", skill: "word_u", pose: "talk", picture: "ushaq",
    kk: "Бұл — ұшақ. Ұ-шақ. Ол аспанда ұшады! Айтшы: ұ-шақ!",
    ru: "Это — самолёт, ұшақ. Ұ-шақ. Он летает в небе! Скажи: ұ-шақ!",
    accept: LESSON_U_USHAQ_FORMS, acceptPrefix: ["ұ", "у"],
    criterion:
      "Ребёнок повторяет слово «ұшақ» (самолёт) по картинке. Засчитывай верным (correct) «ұшақ», «ушақ», " +
      "«ушак», детские искажения («ұсақ»), а также «самолёт» — ребёнок понял картинку. Любое слово на «ұ»/«у» " +
      "тоже верно — цель урока звук [у]. Молчание или посторонний ответ — unclear.",
    onCorrect: "u_ushaq_ok", onReask: "u_ushaq_reask", onReveal: "u_ushaq_reveal" }),
  u_ushaq_reask: uNode({ kind: "narration", pose: "confused", picture: "ushaq",
    kk: "Бірге айтайық, ақырын: ұ… шақ. Ұшақ!",
    ru: "Скажем вместе, медленно: ұ… шақ. Ұшақ!",
    next: "q_u_ushaq" }),
  u_ushaq_reveal: uNode({ kind: "narration", pose: "think", picture: "ushaq",
    kk: "Ұ-шақ! Ұшақ — Ұ әрпінен басталады. Жарайсың, тырыстың!",
    ru: "Ұ-шақ! Ұшақ начинается с Ұ. Молодец, ты старался!",
    next: "q_u_pick" }),
  u_ushaq_ok: uNode({ kind: "narration", pose: "happy", picture: "ushaq",
    kk: "Дұрыс! Ұшақ! Ұшақ — Ұ-дан басталады!",
    ru: "Правильно! Ұшақ! Самолёт по-казахски начинается с Ұ!",
    next: "q_u_pick" }),

  q_u_pick: uNode({ kind: "question", mode: "pick", skill: "pick_u", pose: "talk",
    kk: "Қара: ұшақ және алма. Қайсысы Ұ-дан басталады? Айтшы немесе саусағыңмен көрсет!",
    ru: "Смотри: самолёт и яблоко. Что начинается на Ұ? Скажи или покажи пальчиком!",
    choices: [
      { id: "ushaq", kk: "ұшақ", ru: "самолёт", picture: "ushaq", forms: LESSON_U_PICK_FORMS.ushaq },
      { id: "alma", kk: "алма", ru: "яблоко", picture: "alma", forms: LESSON_U_PICK_FORMS.alma },
    ],
    criterion:
      "На экране две картинки: самолёт (ұшақ) и яблоко (алма). Ребёнок должен назвать то, что начинается на Ұ. " +
      'Если он сказал «ұшақ»/«самолёт» — верни label "correct" и reason ровно "ushaq". Если «алма»/«яблоко» — ' +
      'label "correct" и reason ровно "alma" (герой мягко поправит). Иначе — "unclear".',
    onAnswer: { ushaq: "u_pick_ok" }, onOther: { alma: "u_pick_other" },
    onReask: "u_pick_reask", onReveal: "u_pick_reveal" }),
  u_pick_other: uNode({ kind: "narration", pose: "confused", picture: "alma",
    kk: "Бұл — алма. А-а-алма. Ол А-дан басталады. Ал Ұ қайда? Тағы қарашы!",
    ru: "Это — яблоко, алма. А-а-алма. Оно начинается с А. А где Ұ? Посмотри ещё!",
    next: "q_u_pick" }),
  u_pick_reask: uNode({ kind: "narration", pose: "confused",
    kk: "Ұшақ қайда? Ұшақты көрсетші!",
    ru: "Где самолёт? Покажи самолёт!",
    next: "q_u_pick" }),
  u_pick_reveal: uNode({ kind: "narration", pose: "think", picture: "ushaq",
    kk: "Міне, ұшақ! Ұ-ұ-ұшақ! Жарайсың!",
    ru: "Вот самолёт! Ұ-ұ-ұшақ! Молодец!",
    next: "q_u_like" }),
  u_pick_ok: uNode({ kind: "narration", pose: "happy", picture: "ushaq",
    kk: "Дұрыс! Ұшақ — Ұ! Сен таптың!",
    ru: "Правильно! Ұшақ — Ұ! Ты нашёл!",
    next: "q_u_like" }),

  q_u_like: uNode({ kind: "question", mode: "open", skill: "open_u", pose: "talk", picture: "unaidy",
    kk: "Ұнайды деген сөз де Ұ-дан басталады. Ұ-най-ды. Саған не ұнайды? Айтшы!",
    ru: "Слово «ұнайды» — «нравится» — тоже начинается с Ұ. Ұ-най-ды. Что тебе нравится? Расскажи!",
    accept: LESSON_U_LIKE_FORMS,
    criterion:
      "Лисёнок спрашивает, что ребёнку нравится. Это узел эмоционального контакта, не проверка: любая речь — " +
      "correct, включая одно слово («алма», «мама», «ойнау», «машина»). Только тишина или явный шум без слов — " +
      "unclear. Будь щедрым.",
    onCorrect: "u_like_ok", onReask: "u_like_reask", onReveal: "u_like_reveal" }),
  u_like_reask: uNode({ kind: "narration", pose: "confused", picture: "unaidy",
    kk: "Саған алма ұнай ма? Ойнау ұнай ма? Айтшы!",
    ru: "Тебе нравятся яблоки? Нравится играть? Скажи!",
    next: "q_u_like" }),
  u_like_reveal: uNode({ kind: "narration", pose: "think", picture: "unaidy",
    kk: "Маған сенімен ойнау ұнайды! Жарайсың!",
    ru: "А мне нравится играть с тобой! Молодец!",
    next: "u_chant" }),
  u_like_ok: uNode({ kind: "narration", pose: "happy", picture: "unaidy",
    kk: "Қандай жақсы! Ұнайды — Ұ-дан басталады!",
    ru: "Как хорошо! Ұнайды — на букву Ұ!",
    next: "u_chant" }),

  u_chant: uNode({ kind: "narration", pose: "happy", chant: true,
    kk: "Ұ-ұ-ұ — ұшақ! Ұ-ұ-ұ — ұнайды! Ұ-ұ-ұ — ұя! Ұ әрпі — ұшақтың әрпі!",
    ru: "У-у-у — самолёт! У-у-у — нравится! У-у-у — гнездо (ұя)! Буква Ұ — буква самолёта!",
    next: "u_bye" }),
  u_bye: uNode({ kind: "narration", pose: "happy",
    kk: "Бүгін біз Ұ әрпімен таныстық! Сен керемет тырыстың. Ертең тағы кел!",
    ru: "Сегодня мы познакомились с буквой Ұ! Ты отлично старался. Приходи завтра ещё!",
    next: "parent_report" }),
};

// Every letter lesson: its graph and the picture ids it may show. app.js
// merges all graphs into NODES; tests walk each one the same way.
const LETTER_LESSONS = {
  "letter-a": { nodes: LESSON_A, letter: "Аа", prefix: "a", pictures: ["mouth", "alma", "dop", "ana"] },
  "letter-o": { nodes: LESSON_O, letter: "Оо", prefix: "o", pictures: ["mouth_o", "ot", "mysyq", "oiynshyq"] },
  "letter-u": { nodes: LESSON_U, letter: "Ұұ", prefix: "u", pictures: ["mouth_u", "ushaq", "alma", "unaidy"] },
};

// Everything app.js needs to run one activity: which graph, where it
// starts (first run / replay), which beats are "final" (never cut by the
// session limit), where the limit jumps to, the skills the report lists and
// the start-overlay copy. The fox tale is the default; lessons are selected
// with ?lesson=<id> (cards on index.html, the library).
const ACTIVITIES = {
  story: {
    id: "story", kind: "story",
    start: START_STATE, startAgain: START_STATE_AGAIN,
    finalIds: FINAL_IDS, limitTarget: "found",
    skills: ["count", "choice", "empathy", "rhyme"],
    gentle: false,
    title: "Түлкі інісін іздейді",
    subtitleKk: "Түлкіге інісін табуға көмектес — дауыспен жауап бер",
    subtitleRu: "Помоги лисёнку найти братика — отвечай голосом",
    endLineKk: "Інімді тапқаныңа рахмет!",
    cover: "/images/cover-fox-fullbody.png",
  },
  "letter-a": {
    id: "letter-a", kind: "lesson",
    start: "a_intro", startAgain: "a_intro_again",
    finalIds: new Set(["a_chant", "a_bye", "parent_report"]), limitTarget: "a_bye",
    skills: ["sound_a", "word_a", "pick_a", "open_a"],
    gentle: true, // lessons always run with the calm profile (longer pauses, no effects)
    title: "А әрпі",
    subtitleKk: "Түлкімен бірге А әрпін үйрен — айт немесе суретті көрсет",
    subtitleRu: "Выучи букву А с лисёнком — говори или показывай картинку",
    endLineKk: "Бүгін А әрпін үйрендік!",
    cover: "/images/cover-fox-fullbody.png",
  },
  "letter-o": {
    id: "letter-o", kind: "lesson",
    start: "o_intro", startAgain: "o_intro_again",
    finalIds: new Set(["o_chant", "o_bye", "parent_report"]), limitTarget: "o_bye",
    skills: ["sound_o", "word_o", "pick_o", "open_o"],
    gentle: true,
    title: "О әрпі",
    subtitleKk: "Түлкімен бірге О әрпін үйрен — айт немесе суретті көрсет",
    subtitleRu: "Выучи букву О с лисёнком — говори или показывай картинку",
    endLineKk: "Бүгін О әрпін үйрендік!",
    cover: "/images/cover-fox-fullbody.png",
  },
  "letter-u": {
    id: "letter-u", kind: "lesson",
    start: "u_intro", startAgain: "u_intro_again",
    finalIds: new Set(["u_chant", "u_bye", "parent_report"]), limitTarget: "u_bye",
    skills: ["sound_u", "word_u", "pick_u", "open_u"],
    gentle: true,
    title: "Ұ әрпі",
    subtitleKk: "Түлкімен бірге Ұ әрпін үйрен — айт немесе суретті көрсет",
    subtitleRu: "Выучи букву Ұ (звук «у») с лисёнком — говори или показывай картинку",
    endLineKk: "Бүгін Ұ әрпін үйрендік!",
    cover: "/images/cover-fox-fullbody.png",
  },
};

// The short lessons that live inside STORY (LESSONS above: letters, count,
// plus, minus, write) run through the same ACTIVITIES contract as the fox
// tale and LESSON_A, so app.js has one code path. They have no replay
// greeting (startAgain = start), a single skill each, and keep the tale's
// normal (non-gentle) pacing.
const LESSON_SKILL = { letters: "letter", count: "count", plus: "plus", minus: "minus", write: "write" };
for (const [id, l] of Object.entries(LESSONS)) {
  ACTIVITIES[id] = {
    id, kind: "lesson",
    start: l.start, startAgain: l.start,
    finalIds: new Set([l.done, "parent_report"]), limitTarget: l.done,
    skills: [LESSON_SKILL[id]],
    gentle: false,
    title: l.title, subtitleKk: l.kk, subtitleRu: l.ru,
    endLineKk: "Жарайсың! Бүгінгі сабақ бітті.",
    cover: "/images/cover-fox-fullbody.png",
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    STORY, START_STATE, START_STATE_AGAIN, FINAL_IDS, LESSONS, NUM_KK, NUM_RU, BROTHER_NAMES, trackLines, echoLines,
    LESSON_A, ACTIVITIES, LESSON_A_SOUND_FORMS, LESSON_A_ALMA_FORMS, LESSON_A_PICK_FORMS, LESSON_A_ANA_FORMS,
    LESSON_O, LESSON_O_SOUND_FORMS, LESSON_O_OT_FORMS, LESSON_O_PICK_FORMS,
    LESSON_U, LESSON_U_SOUND_FORMS, LESSON_U_USHAQ_FORMS, LESSON_U_PICK_FORMS,
    LETTER_LESSONS,
  };
}
