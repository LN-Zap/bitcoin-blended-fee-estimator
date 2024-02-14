import { expect, test } from "bun:test";
import {
  addFeeEstimates,
  filterEstimates,
  extractMempoolFees,
  calculateFees,
} from "../src/util";

// Define test data
const mempoolFeeEstimates: MempoolFeeEstimates = {
  fastestFee: 500,
  halfHourFee: 400,
  hourFee: 300,
  economyFee: 200,
  minimumFee: 100,
};
const bitcoindFeeEstimates: FeeByBlockTarget = {
  1: 300000,
  10: 250000,
  20: 200000,
};
const esploraFeeEstimates: FeeByBlockTarget = {
  10: 400000,
  20: 300000,
  30: 150000,
};

// Test addFeeEstimates function
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

// Test filterEstimates function
test("filterEstimates", () => {
  const feeByBlockTarget: FeeByBlockTarget = { 1: 500, 2: 400, 3: 300 };
  const feeMinimum = 350;

  const result = filterEstimates(feeByBlockTarget, feeMinimum);

  expect(result[1]).toEqual(500);
  expect(result[2]).toEqual(400);
  expect(result[3]).toBeUndefined();
  expect(Object.keys(result).length).toEqual(2);
});

// Test extractMempoolFees function
test("extractMempoolFees", () => {
  const depth = 3;

  const result: FeeByBlockTarget = extractMempoolFees(
    mempoolFeeEstimates,
    depth,
  );

  expect(result[1]).toEqual(500);
  expect(result[3]).toEqual(400);
  expect(result[6]).toBeUndefined();
});

// Test calculateFees function
test("calculateFees", () => {
  const result: FeeByBlockTarget = calculateFees(
    mempoolFeeEstimates,
    esploraFeeEstimates,
    bitcoindFeeEstimates,
    20000,
  );

  expect(result[1]).toEqual(500000);
  expect(result[2]).toBeUndefined();
  expect(result[3]).toEqual(400000);
  expect(result[4]).toBeUndefined();
  expect(result[6]).toEqual(300000);
  expect(result[10]).toEqual(250000);
  expect(result[20]).toEqual(200000);
  expect(result[30]).toBeUndefined();
  expect(Object.keys(result).length).toEqual(5);
});
