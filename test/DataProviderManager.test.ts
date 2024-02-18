import { expect, test } from "bun:test";
import { DataProviderManager } from "../src/DataProviderManager";

class MockProvider1 implements Provider {
  getBlockHeight = () => Promise.resolve(998);
  getBlockHash = () => Promise.resolve("hash1");
  getFeeEstimates = () => Promise.resolve({
    1: 20, 
    10: 1
  });
  getAllData = () => Promise.resolve([998, "hash1", {
    1: 20, 
    10: 1
  }] as ProviderData);
}

class MockProvider2 implements Provider {
  getBlockHeight = () => Promise.resolve(1000);
  getBlockHash = () => Promise.resolve("hash3");
  getFeeEstimates = () => Promise.resolve({
    1: 30, 
    2: 20
  });
  getAllData = () => Promise.resolve([1000, "hash3", {
    1: 30, 
    2: 20
  }] as ProviderData);
}

class MockProvider3 implements Provider {
  getBlockHeight = () => Promise.resolve(999);
  getBlockHash = () => Promise.resolve("hash2");
  getFeeEstimates = () => Promise.resolve({
    1: 25, 
    2: 15, 
    3: 5, 
    5: 3
  });
  getAllData = () => Promise.resolve([999, "hash2", {
    1: 25, 
    2: 15, 
    3: 5, 
    5: 3
  }] as ProviderData);
}

const manager = new DataProviderManager({ stdTTL: 0, checkperiod: 0 });
manager.registerProvider(new MockProvider1());
manager.registerProvider(new MockProvider2());
manager.registerProvider(new MockProvider3());

test("should merge fee estimates from multiple providers correctly", async () => {
  const mergedData = await manager.getMergedData();
  expect(mergedData.blockHeight).toEqual(1000);
  expect(mergedData.blockHash).toEqual("hash3");
  expect(mergedData.feeEstimates).toEqual({
    1: 30,
    2: 20,
    3: 5,
    5: 3,
  });
});
