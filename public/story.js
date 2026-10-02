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
    kk: "Мен естімей қалдым. Тағы бір рет, қаттырақ: А — алма!",
    ru: "Я не расслышал. Ещё раз, погромче: А — алма!",
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
    kk: "Тағы бір рет қарайықшы. Алмаларды бірінен соң бірін санап көр.",
    ru: "Давай посмотрим ещё раз. Посчитай яблоки по одному.",
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

  parent_report: { kind: "end", speaker: "", kk: "", ru: "" },
};

const START_STATE = "intro";
const START_STATE_AGAIN = "intro_again";
const FINAL_IDS = new Set(["found", "thanks", "thanks_again", "parent_report"]);
// ?lesson=<key>: each lesson has its own start and its own finale (the node
// the session cap jumps to instead of the story's `found`).
const LESSONS = {
  letters: { start: "la_intro", done: "la_done" },
  count: { start: "lc_intro", done: "lc_done" },
};

if (typeof module !== "undefined") {
  module.exports = {
    STORY, START_STATE, START_STATE_AGAIN, FINAL_IDS, LESSONS,
    NUM_KK, NUM_RU, BROTHER_NAMES, trackLines, echoLines,
  };
}
