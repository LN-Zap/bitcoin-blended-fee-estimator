import { expect, test } from "bun:test";
import { MempoolProvider } from "../src/mempool";

const mempoolProvider = new MempoolProvider("https://mempool.space", 6);

test("getFeeEstimates", async () => {
  const feeEstimates = await mempoolProvider.getFeeEstimates();
  expect(Object.keys(feeEstimates)).toEqual(
    expect.arrayContaining(["1", "3", "6"]),
  );
  expect(typeof feeEstimates["1"]).toBe("number");
  expect(typeof feeEstimates["3"]).toBe("number");
  expect(typeof feeEstimates["6"]).toBe("number");
});

test("getBlockHeight", async () => {
  const blockHeight = await mempoolProvider.getBlockHeight();
  expect(typeof blockHeight).toBe("number");
});

test("getBlockHash", async () => {
  const blockHash = await mempoolProvider.getBlockHash();
  expect(blockHash).toMatch(/^[a-fA-F0-9]{64}$/);
});

test("getAllData", async () => {
  const { blockHeight, blockHash, feeEstimates } =
    await mempoolProvider.getAllData();

  expect(typeof blockHeight).toBe("number");
  expect(blockHash).toMatch(/^[a-fA-F0-9]{64}$/);
  expect(Object.keys(feeEstimates)).toEqual(
    expect.arrayContaining(["1", "3", "6"]),
  );
  expect(typeof feeEstimates["1"]).toBe("number");
  expect(typeof feeEstimates["3"]).toBe("number");
  expect(typeof feeEstimates["6"]).toBe("number");
});
