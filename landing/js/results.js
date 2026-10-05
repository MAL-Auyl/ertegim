/* =====================================================================
   НӘТИЖЕЛЕР / РЕЗУЛЬТАТЫ — редактируйте только этот файл.

   1. updated — когда обновили (любой текст, например "5.10.2026, 18:30").
   2. Для каждого вида спорта заполните podium, когда он завершится:
        { place: 1, name: "Команда или спортсмен", univ: "Университет", country: "kz" }
      place:   1 — алтын/золото, 2 — күміс/серебро, 3 — қола/бронза
               (в боксе, каратэ, самбо можно две бронзы: два объекта с place: 3)
      country: kz, az, ir, ru, tm
   3. status (необязательно): "soon" — алда, "live" — жүріп жатыр, "done" — аяқталды.
      Если не указан: есть призёры → "done", идёт по расписанию → "live", иначе "soon".
   4. note (необязательно): короткий комментарий на трёх языках.

   Пример заполненного вида спорта:
     swimming: {
       status: "done",
       podium: [
         { place: 1, name: "Айдос Серікбаев", univ: "Yessenov University", country: "kz" },
         { place: 2, name: "Ali Mammadov",    univ: "ADA University",      country: "az" },
         { place: 3, name: "Иван Петров",     univ: "АГТУ",                country: "ru" }
       ],
       note: { kk: "50 м еркін стиль", ru: "50 м вольный стиль", en: "50m freestyle" }
     },
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
