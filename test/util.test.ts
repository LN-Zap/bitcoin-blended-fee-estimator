import { expect, test } from "bun:test";
import { isFiniteNumber, parseFiniteNumberSetting } from "../src/lib/util";

test("isFiniteNumber accepts only finite numbers", () => {
  for (const ok of [0, 1, -1.5]) expect(isFiniteNumber(ok)).toBe(true);
  for (const bad of [NaN, Infinity, -Infinity, "1", null, undefined, {}]) {
    expect(isFiniteNumber(bad)).toBe(false);
  }
});

test("parseFiniteNumberSetting accepts numbers and numeric strings", () => {
  expect(parseFiniteNumberSetting("x", 2)).toBe(2);
  expect(parseFiniteNumberSetting("x", "1")).toBe(1);
  expect(parseFiniteNumberSetting("x", "1.5")).toBe(1.5);
  expect(parseFiniteNumberSetting("x", " 3 ")).toBe(3);
  expect(parseFiniteNumberSetting("x", 0)).toBe(0);
});

test("parseFiniteNumberSetting fails fast with the setting name", () => {
  for (const bad of ["abc", "", "  ", "1,5", NaN, Infinity, null, undefined]) {
    expect(() => parseFiniteNumberSetting("FEE_MINIMUM", bad)).toThrow(
      "Invalid configuration: FEE_MINIMUM must be a finite number",
    );
  }
});

test("parseFiniteNumberSetting enforces the given lower bounds", () => {
  expect(parseFiniteNumberSetting("x", "0", { atLeast: 0 })).toBe(0);
  expect(parseFiniteNumberSetting("x", "0.5", { greaterThan: 0 })).toBe(0.5);
  expect(() =>
    parseFiniteNumberSetting("FEE_MINIMUM", "-1", { atLeast: 0 }),
  ).toThrow("Invalid configuration: FEE_MINIMUM must be at least 0");
  expect(() =>
    parseFiniteNumberSetting("FEE_MULTIPLIER", "0", { greaterThan: 0 }),
  ).toThrow("Invalid configuration: FEE_MULTIPLIER must be greater than 0");
  expect(() =>
    parseFiniteNumberSetting("FEE_MULTIPLIER", -1, { greaterThan: 0 }),
  ).toThrow("Invalid configuration: FEE_MULTIPLIER must be greater than 0");
});
