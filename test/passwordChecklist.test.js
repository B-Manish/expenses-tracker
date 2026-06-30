import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePasswordChecklist,
  isPasswordChecklistComplete,
} from "../src/utils/validation.js";

test("empty password satisfies no rule (no premature checkmarks)", () => {
  const result = evaluatePasswordChecklist("", { email: "cody@fisher.com" });
  assert.deepEqual(result, {
    noNameOrEmail: false,
    minLength: false,
    hasSymbolOrNumber: false,
  });
  assert.equal(isPasswordChecklistComplete(result), false);
});

test("flags password containing the email local part or name", () => {
  const identity = { name: "Cody Fisher", email: "cody@fisher.com" };
  assert.equal(evaluatePasswordChecklist("cody12345!", identity).noNameOrEmail, false);
  assert.equal(evaluatePasswordChecklist("Fisher99$x", identity).noNameOrEmail, false);
  assert.equal(evaluatePasswordChecklist("unrelated9$", identity).noNameOrEmail, true);
});

test("min length needs 8 characters", () => {
  assert.equal(evaluatePasswordChecklist("a1$x").minLength, false);
  assert.equal(evaluatePasswordChecklist("abcd1234").minLength, true);
});

test("symbol-or-number rule accepts either a digit or a symbol, not spaces", () => {
  assert.equal(evaluatePasswordChecklist("password1").hasSymbolOrNumber, true);
  assert.equal(evaluatePasswordChecklist("password!").hasSymbolOrNumber, true);
  assert.equal(evaluatePasswordChecklist("passwords").hasSymbolOrNumber, false);
  assert.equal(evaluatePasswordChecklist("pass word").hasSymbolOrNumber, false);
});

test("complete only when all three rules pass", () => {
  const identity = { name: "Cody Fisher", email: "cody@fisher.com" };
  assert.equal(
    isPasswordChecklistComplete(evaluatePasswordChecklist("Str0ng!Pass", identity)),
    true,
  );
  assert.equal(
    isPasswordChecklistComplete(evaluatePasswordChecklist("cody!Pass1", identity)),
    false,
  );
});
