// lib/classify-core.js — the Groq chat classifier shared by server/server.js
// and api/classify.js. Nothing here touches the network: classifyAnswer()
// itself is only exercised through its fail-fast path (no key), while the
// two parts that actually have decisions in them — input capping and prompt
// construction — are pure functions and are tested directly.
import { test, expect } from "bun:test";

import {
  sanitizeClassifyInput,
  buildMessages,
  classifyAnswer,
  MAX_TRANSCRIPT,
  MAX_ALTERNATIVES,
  MAX_ALT_TEXT,
  MAX_FORMS,
  MAX_FORM_TEXT,
} from "../lib/classify-core.js";

test("sanitizeClassifyInput accepts a well-formed body", () => {
  const out = sanitizeClassifyInput({
    transcript: "үш",
    questionKk: "Қанша із?",
    criterion: "три",
    alternatives: [{ lang: "kk", text: "үш" }, { lang: "ru", text: "три" }],
    expectedForms: ["үш", "три"],
  });
  expect(out.valid).toBe(true);
  expect(out.transcript).toBe("үш");
  expect(out.alternatives).toEqual([{ lang: "kk", text: "үш" }, { lang: "ru", text: "три" }]);
  expect(out.expectedForms).toEqual(["үш", "три"]);
});

test("sanitizeClassifyInput reports a missing/non-string field as invalid", () => {
  expect(sanitizeClassifyInput({ questionKk: "a", criterion: "b" }).valid).toBe(false);
  expect(sanitizeClassifyInput({ transcript: 42, questionKk: "a", criterion: "b" }).valid).toBe(false);
  expect(sanitizeClassifyInput(null).valid).toBe(false);
  expect(sanitizeClassifyInput(undefined).valid).toBe(false);
});

test("sanitizeClassifyInput caps every field that reaches the prompt", () => {
  const out = sanitizeClassifyInput({
    transcript: "a".repeat(5000),
    questionKk: "b".repeat(5000),
    criterion: "c".repeat(5000),
    alternatives: Array.from({ length: 20 }, () => ({ lang: "x".repeat(50), text: "y".repeat(2000) })),
    expectedForms: Array.from({ length: 200 }, () => "z".repeat(500)),
  });
  expect(out.transcript.length).toBe(MAX_TRANSCRIPT);
  expect(out.questionKk.length).toBe(MAX_TRANSCRIPT);
  expect(out.criterion.length).toBe(MAX_TRANSCRIPT);
  expect(out.alternatives.length).toBe(MAX_ALTERNATIVES);
  expect(out.alternatives[0].text.length).toBe(MAX_ALT_TEXT);
  expect(out.alternatives[0].lang.length).toBeLessThanOrEqual(8);
  expect(out.expectedForms.length).toBe(MAX_FORMS);
  expect(out.expectedForms[0].length).toBe(MAX_FORM_TEXT);
});

test("sanitizeClassifyInput keeps plain-string alternatives (backward compat) and drops junk types", () => {
  const out = sanitizeClassifyInput({
    transcript: "x", questionKk: "q", criterion: "c",
    alternatives: ["үш", "три"],
    expectedForms: [1, 2],
  });
  expect(out.alternatives).toEqual(["үш", "три"]);
  expect(out.expectedForms).toEqual(["1", "2"]);
  // A non-array is not silently treated as a one-element list.
  expect(sanitizeClassifyInput({ transcript: "x", questionKk: "q", criterion: "c", alternatives: "boom" }).alternatives)
    .toEqual([]);
});

const CHOICE_SENTENCE = "Исключение — вопросы с выбором варианта";

test("buildMessages adds the choice-exception sentence only when there is an expectation", () => {
  const bare = buildMessages({ transcript: "мм", questionKk: "q", criterion: "c" });
  expect(bare[0].content).not.toContain(CHOICE_SENTENCE);

  const withForms = buildMessages({
    transcript: "үш", questionKk: "q", criterion: "c", expectedForms: ["үш"],
  });
  expect(withForms[0].content).toContain(CHOICE_SENTENCE);

  const withAlts = buildMessages({
    transcript: "үш", questionKk: "q", criterion: "c",
    alternatives: [{ lang: "kk", text: "үш" }],
  });
  expect(withAlts[0].content).toContain(CHOICE_SENTENCE);
});

test("buildMessages labels the recognitions by language tag, not by position", () => {
  // Only the ru pass survived (the kk one was filtered as a hallucination):
  // ru must not be presented to the model as the kk recognition, and no kk
  // line may be invented for it.
  const msgs = buildMessages({
    transcript: "три", questionKk: "q", criterion: "c",
    alternatives: [{ lang: "ru", text: "три" }],
  });
  expect(msgs[1].content).toContain('распознавание ru: "три"');
  expect(msgs[1].content).not.toContain("распознавание kk");
});

test("buildMessages de-duplicates identical recognitions (STT_LANGS=auto,ru both detect ru)", () => {
  const msgs = buildMessages({
    transcript: "три", questionKk: "q", criterion: "c",
    alternatives: [{ lang: "ru", text: "три" }, { lang: "ru", text: "три" }],
  });
  const lines = msgs[1].content.match(/распознавание /g) || [];
  expect(lines.length).toBe(1); // one opinion, not two "independent" ones
  expect(msgs[1].content).toContain('распознавание ru: "три"');
});

test("buildMessages keeps two differently-tagged recognitions, each with its own label", () => {
  const msgs = buildMessages({
    transcript: "үш", questionKk: "q", criterion: "c",
    alternatives: [{ lang: "ru", text: "три" }, { lang: "kk", text: "үш" }],
  });
  expect(msgs[1].content).toContain('распознавание ru: "три"');
  expect(msgs[1].content).toContain('распознавание kk: "үш"');
  expect((msgs[1].content.match(/распознавание /g) || []).length).toBe(2);
});

test("buildMessages falls back to the picked transcript when there are no alternatives", () => {
  const msgs = buildMessages({ transcript: "үш", questionKk: "q", criterion: "c" });
  expect(msgs[1].content).toContain('распознавание stt: "үш"');
});

test("buildMessages keeps plain-string alternatives (backward compat)", () => {
  const msgs = buildMessages({
    transcript: "үш", questionKk: "q", criterion: "c",
    alternatives: ["үш", "три"],
  });
  expect(msgs[1].content).toContain('распознавание stt: "үш"');
  expect(msgs[1].content).toContain('распознавание stt: "три"');
});

test("buildMessages renders an empty expected-form list as a dash, never as 'undefined'", () => {
  const msgs = buildMessages({ transcript: "x", questionKk: "q", criterion: "c" });
  expect(msgs[1].content).toContain("Ожидаемые формы ответа: —");
  expect(msgs[1].content).not.toContain("undefined");
});

test("classifyAnswer fails fast without an API key (no network call)", async () => {
  await expect(
    classifyAnswer({ apiKey: "", transcript: "x", questionKk: "q", criterion: "c" }),
  ).rejects.toThrow("GROQ_API_KEY not set");
});
