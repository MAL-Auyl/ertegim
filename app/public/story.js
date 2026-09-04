// Story state machine data, transcribed from docs/story-script.md.
// Two kinds of nodes:
//   - narration: hero speaks, operator presses "Далее" to continue (no recording)
//   - question:  hero speaks, then the operator records the child's answer
// `next` on a narration node is the automatic follow-up state.
// Question nodes don't have a single `next` — the operator's Correct/Re-ask/
// Advance decision picks it (see transition() in app.js), and reask is only
// allowed once per question before it auto-reveals (per design doc §Demo Flow).

const STORY = {
  fox_intro: {
    kind: "narration",
    speaker: "Түлкі (лисёнок)",
    kk: "Сәлем! Мен — түлкі. Кел, бірге ойнайық!",
    ru: "Привет! Я лисёнок. Давай поиграем вместе!",
    next: "fox_question",
  },
  fox_question: {
    kind: "question",
    speaker: "Түлкі (лисёнок)",
    kk: "Мына бұтада неше жидек бар? Санап көрші!",
    ru: "Сколько ягод на этом кусте? Посчитай!",
    onCorrect: "fox_correct",
    onReask: "fox_reask",
    onReveal: "fox_reveal",
  },
  fox_correct: {
    kind: "narration",
    speaker: "Түлкі (лисёнок)",
    kk: "Дұрыс! Өте жақсы санадың!",
    ru: "Правильно! Ты отлично посчитал!",
    next: "owl_intro",
  },
  fox_reask: {
    kind: "narration",
    speaker: "Түлкі (лисёнок)",
    kk: "Тағы бір рет қарайықшы. Жидектерді бірінен соң бірін санап көр.",
    ru: "Давай посмотрим ещё раз. Посчитай ягоды по одной.",
    next: "fox_question",
  },
  fox_reveal: {
    kind: "narration",
    speaker: "Түлкі (лисёнок)",
    kk: "Ештеңе етпейді! Бірге санайық: бір, екі, үш! Үш жидек екен!",
    ru: "Не страшно! Давай посчитаем вместе: один, два, три! Три ягоды!",
    next: "owl_intro",
  },

  owl_intro: {
    kind: "narration",
    speaker: "Түлкі → Үкі (совёнок)",
    kk: "Тамаша! Енді достым үкінің кезегі! — Сәлем, мен — үкі. Мен саған сөз айтам, сен соған ұйқас сөз тап!",
    ru: "Отлично! Теперь очередь моего друга совёнка! — Привет, я совёнок. Я скажу слово, а ты назови слово, похожее по звучанию!",
    next: "owl_question",
  },
  owl_question: {
    kind: "question",
    speaker: "Үкі (совёнок)",
    kk: "Мысық — деп айттым. Осыған ұйқас сөз тап!",
    ru: "Я сказал «мысық» (кот). Найди слово, похожее по звучанию!",
    onCorrect: "owl_correct",
    onReask: "owl_reask",
    onReveal: "owl_reveal",
  },
  owl_correct: {
    kind: "narration",
    speaker: "Үкі (совёнок)",
    kk: "Керемет! Тыңдауға өте жағымды болды!",
    ru: "Замечательно! Очень приятно звучало!",
    next: "ending",
  },
  owl_reask: {
    kind: "narration",
    speaker: "Үкі (совёнок)",
    kk: "Тағы да ойлан. Соңы «-ық» болатын сөз бар ма?",
    ru: "Подумай ещё раз. Есть слово, оканчивающееся на «-ық»?",
    next: "owl_question",
  },
  owl_reveal: {
    kind: "narration",
    speaker: "Үкі (совёнок)",
    kk: "Ешбір қиындық жоқ! Мысалы, «қасық» деуге болады!",
    ru: "Ничего страшного! Например, можно сказать «қасық» (ложка)!",
    next: "ending",
  },

  ending: {
    kind: "narration",
    speaker: "Түлкі + Үкі",
    kk: "Керемет ойын болды! Сау бол!",
    ru: "Отличная была игра! До встречи!",
    next: "parent_report",
  },
  parent_report: {
    kind: "end",
    speaker: "",
    kk: "",
    ru: "",
  },
};

const START_STATE = "fox_intro";
