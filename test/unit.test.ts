import { expect, test } from "bun:test";
import { addFeeEstimates } from "../src/util";

test("addFeeEstimates", () => {
  const feeByBlockTarget: FeeByBlockTarget = { 1: 500, 2: 400, 3: 300 };
  const newEstimates: FeeByBlockTarget = { 4: 320, 5: 300, 6: 250 };

  addFeeEstimates(feeByBlockTarget, newEstimates);

  expect(feeByBlockTarget[1]).toEqual(500);
  expect(feeByBlockTarget[2]).toEqual(400);
  expect(feeByBlockTarget[3]).toEqual(300);
  expect(feeByBlockTarget[4]).toBeUndefined();
  expect(feeByBlockTarget[5]).toBeUndefined();
  expect(feeByBlockTarget[6]).toEqual(250);
  expect(Object.keys(feeByBlockTarget).length).toEqual(4);
});
