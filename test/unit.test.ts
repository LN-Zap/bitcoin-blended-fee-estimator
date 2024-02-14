import { expect, test } from "bun:test";
import { addFeeEstimates } from "../src/util";

test("addFeeEstimates", () => {
  const feeByBlockTarget: FeeByBlockTarget = { 1: 100, 2: 200, 3: 300 };
  const newEstimates: FeeByBlockTarget = { 4: 50, 5: 150, 6: 250 };

  addFeeEstimates(feeByBlockTarget, newEstimates);

  expect(feeByBlockTarget[4]).toEqual(50);
  expect(feeByBlockTarget[5]).toBeUndefined();
  expect(feeByBlockTarget[6]).toBeUndefined();
  expect(Object.keys(feeByBlockTarget).length).toEqual(4);
});
