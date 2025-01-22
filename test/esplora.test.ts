import { expect, test } from "bun:test";
import { EsploraProvider } from "../src/providers/esplora";

const esploraProvider = new EsploraProvider("https://blockstream.info", 6);

test("getFeeEstimates should return fee estimates for depths 1, 3, and 6", async () => {
  const feeEstimates = await esploraProvider.getFeeEstimates();
  expect(Object.keys(feeEstimates)).toEqual(
    expect.arrayContaining(["1", "3", "6"]),
  );
  expect(typeof feeEstimates["1"]).toBe("number");
  expect(typeof feeEstimates["3"]).toBe("number");
  expect(typeof feeEstimates["6"]).toBe("number");
});

test("getFeeEstimates with custom depth should return fee estimates for depths 1 and 3 only", async () => {
  const feeEstimates = await esploraProvider.getFeeEstimates(3);
  expect(Object.keys(feeEstimates)).toEqual(expect.arrayContaining(["1", "3"]));
  expect(typeof feeEstimates["1"]).toBe("number");
  expect(typeof feeEstimates["3"]).toBe("number");
  expect(feeEstimates["6"]).toBeUndefined();
});

test("getBlockHeight should return a number representing the block height", async () => {
  const blockHeight = await esploraProvider.getBlockHeight();
  expect(typeof blockHeight).toBe("number");
});

test("getBlockHash should return a 64-character hexadecimal string representing the block hash", async () => {
  const blockHash = await esploraProvider.getBlockHash();
  expect(blockHash).toMatch(/^[a-fA-F0-9]{64}$/);
});

test("getMinRelayFeeRate should return a number representing the minimum fee rate", async () => {
  const minRelayFeeRate = await esploraProvider.getMinRelayFeeRate();
  expect(typeof minRelayFeeRate).toBe("number");
});

test("getAllData should return an object containing the block height, block hash, and fee estimates", async () => {
  const { blockHeight, blockHash, feeEstimates, minRelayFeeRate } =
    await esploraProvider.getAllData();

  expect(typeof blockHeight).toBe("number");
  expect(blockHash).toMatch(/^[a-fA-F0-9]{64}$/);
  expect(Object.keys(feeEstimates)).toEqual(
    expect.arrayContaining(["1", "3", "6"]),
  );
  expect(typeof feeEstimates["1"]).toBe("number");
  expect(typeof feeEstimates["3"]).toBe("number");
  expect(typeof feeEstimates["6"]).toBe("number");
  expect(typeof minRelayFeeRate).toBe("number");
});
