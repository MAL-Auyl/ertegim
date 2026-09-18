const { test, expect } = require("bun:test");

test("safeStaticPath", async () => {
  const { safeStaticPath } = await import("../server/static.js");
  const root = "/repo/public";
  expect(safeStaticPath(root, "/")).toBe("/repo/public/index.html");
  expect(safeStaticPath(root, "/library.html")).toBe("/repo/public/library.html");
  expect(safeStaticPath(root, "/audio/q_echo_%62alyq.wav")).toBe("/repo/public/audio/q_echo_balyq.wav");
  expect(safeStaticPath(root, "/images/%D1%82%D2%AF%D0%BB%D0%BA%D1%96.png")).toBe("/repo/public/images/түлкі.png");
  expect(safeStaticPath(root, "/../server/server.js")).toBeNull();
  expect(safeStaticPath(root, "/a/../../x")).toBeNull();
  expect(safeStaticPath(root, "/%zz")).toBeNull(); // bad percent-encoding → null, not throw
});
