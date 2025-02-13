import { expect, test } from "bun:test";
import { DataProviderManager } from "../src/lib/DataProviderManager";

class MockProvider0 implements Provider {
  getBlockHeight = () => Promise.resolve(1001);
  getBlockHash = () => Promise.resolve("hash1001");
  getMinRelayFeeRate = () => Promise.resolve(1);
  getFeeEstimates = () =>
    Promise.resolve({
      "1": 1,
      "2": 1,
      "3": 1,
    });
  getAllData = () =>
    Promise.resolve({
      blockHeight: 1001,
      blockHash: "hash1001",
      feeEstimates: {
        "1": 1,
        "2": 1,
        "3": 1,
      },
      minRelayFeeRate: 1,
    });
}

class MockProvider1 implements Provider {
  getBlockHeight = () => Promise.resolve(998);
  getBlockHash = () => Promise.resolve("hash998");
  getMinRelayFeeRate = () => Promise.resolve(1);
  getFeeEstimates = () =>
    Promise.resolve({
      "1": 20,
      "10": 1,
    });
  getAllData = () =>
    Promise.resolve({
      blockHeight: 998,
      blockHash: "hash998",
      feeEstimates: {
        "1": 20,
        "10": 1,
      },
      minRelayFeeRate: 1,
    });
}

class MockProvider2 implements Provider {
  getBlockHeight = () => Promise.resolve(1000);
  getBlockHash = () => Promise.resolve("hash1000");
  getMinRelayFeeRate = () => Promise.resolve(1);
  getFeeEstimates = () =>
    Promise.resolve({
      "1": 30,
      "2": 20,
    });
  getAllData = () =>
    Promise.resolve({
      blockHeight: 1000,
      blockHash: "hash1000",
      feeEstimates: {
        "1": 30,
        "2": 20,
      },
      minRelayFeeRate: 1,
    });
}

class MockProvider3 implements Provider {
  getBlockHeight = () => Promise.resolve(999);
  getBlockHash = () => Promise.resolve("hash999");
  getMinRelayFeeRate = () => Promise.resolve(1);
  getFeeEstimates = () =>
    Promise.resolve({
      "1": 25,
      "2": 15,
      "3": 5,
      "5": 3.564999999999998,
      "6": 3.564999999999998,
      "7": 3.564999999999998,
      "8": 3.564999999999998,
      "9": 3.564999999999998,
    });
  getAllData = () =>
    Promise.resolve({
      blockHeight: 999,
      blockHash: "hash999",
      feeEstimates: {
        "1": 25,
        "2": 15,
        "3": 5,
        "5": 3.564999999999998,
        "6": 3.564999999999998,
        "7": 3.564999999999998,
        "8": 3.564999999999998,
        "9": 3.564999999999998,
      },
      minRelayFeeRate: 1,
    });
}

const maxHeightDelta = 2;
const feeMultiplier = 2;
const feeMinimum = 2;
const manager = new DataProviderManager(
  { stdTTL: 0, checkperiod: 0 },
  maxHeightDelta,
  feeMultiplier,
  feeMinimum,
);
manager.registerProvider(new MockProvider0());
manager.registerProvider(new MockProvider1());
manager.registerProvider(new MockProvider2());
manager.registerProvider(new MockProvider3());

test("should merge fee estimates from multiple providers correctly", async () => {
  const mergedData = await manager.getData();
  expect(mergedData.current_block_height).toEqual(1001);
  expect(mergedData.current_block_hash).toEqual("hash1001");
  expect(mergedData.fee_by_block_target).toEqual({
    "1": 60000,
    "2": 40000,
    "3": 10000,
    "5": 7130,
  });
  expect(mergedData.min_relay_feerate).toEqual(2000);
});
