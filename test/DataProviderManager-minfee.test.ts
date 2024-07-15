import { expect, test } from "bun:test";
import { DataProviderManager } from "../src/lib/DataProviderManager";

test("should exclude estimates that are below the fee minimum", async () => {
  const feeEstimates = {
    "1": 3,
    "2": 2,
    "3": 1,
  };
  class MockProvider implements Provider {
    getBlockHeight = () => Promise.resolve(1001);
    getBlockHash = () => Promise.resolve("hash1001");
    getFeeEstimates = () => Promise.resolve(feeEstimates);
    getAllData = () =>
      Promise.resolve({
        blockHeight: 1001,
        blockHash: "hash1001",
        feeEstimates,
      });
  }

  const maxHeightDelta = 1;
  const feeMultiplier = 1;
  const feeMinimum = 2;
  const manager = new DataProviderManager(
    { stdTTL: 0, checkperiod: 0 },
    maxHeightDelta,
    feeMultiplier,
    feeMinimum,
  );
  manager.registerProvider(new MockProvider());

  const mergedData = await manager.getData();
  expect(mergedData.fee_by_block_target).toEqual({
    "1": 3000,
    "2": 2000,
  });
});

test("should return single estimate at fee minimum if no valid estimates are available", async () => {
  const feeEstimates = {
    "1": 1,
    "2": 1,
    "3": 1,
  };
  class MockProvider implements Provider {
    getBlockHeight = () => Promise.resolve(1001);
    getBlockHash = () => Promise.resolve("hash1001");
    getFeeEstimates = () => Promise.resolve(feeEstimates);
    getAllData = () =>
      Promise.resolve({
        blockHeight: 1001,
        blockHash: "hash1001",
        feeEstimates,
      });
  }

  const maxHeightDelta = 1;
  const feeMultiplier = 1;
  const feeMinimum = 2;
  const manager = new DataProviderManager(
    { stdTTL: 0, checkperiod: 0 },
    maxHeightDelta,
    feeMultiplier,
    feeMinimum,
  );
  manager.registerProvider(new MockProvider());

  const mergedData = await manager.getData();
  expect(mergedData.fee_by_block_target).toEqual({
    "1": 2000,
  });
});
