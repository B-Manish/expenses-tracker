import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveTheme } from "../src/utils/theme.js";

test("resolveTheme returns explicit light/dark unchanged", () => {
  assert.equal(resolveTheme("dark"), "dark");
  assert.equal(resolveTheme("light"), "light");
});

test("resolveTheme falls back to light for system without a matchMedia window", () => {
  // In the test runtime there is no window, so system resolves to light.
  assert.equal(resolveTheme("system"), "light");
  assert.equal(resolveTheme(undefined), "light");
});
