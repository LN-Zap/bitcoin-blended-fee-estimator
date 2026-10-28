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
    getMinRelayFeeRate = () => Promise.resolve(1);
    getAllData = () =>
      Promise.resolve({
        blockHeight: 1001,
        blockHash: "hash1001",
        feeEstimates,
        minRelayFeeRate: 1,
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
  expect(mergedData.min_relay_feerate).toEqual(2000);
});

test("should exclude estimates that are below the minimum relay fee", async () => {
  const feeEstimates = {
    "1": 3,
    "2": 2,
    "3": 1,
  };
  class MockProvider implements Provider {
    getBlockHeight = () => Promise.resolve(1001);
    getBlockHash = () => Promise.resolve("hash1001");
    getFeeEstimates = () => Promise.resolve(feeEstimates);
    getMinRelayFeeRate = () => Promise.resolve(2);
    getAllData = () =>
      Promise.resolve({
        blockHeight: 1001,
        blockHash: "hash1001",
        feeEstimates,
        minRelayFeeRate: 1,
      });
  }

  const maxHeightDelta = 1;
  const feeMultiplier = 1;
  const feeMinimum = 1;
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
  expect(mergedData.min_relay_feerate).toEqual(2000);
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
    getMinRelayFeeRate = () => Promise.resolve(1);
    getAllData = () =>
      Promise.resolve({
        blockHeight: 1001,
        blockHash: "hash1001",
        feeEstimates,
        minRelayFeeRate: 1,
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
  expect(mergedData.min_relay_feerate).toEqual(2000);
});

function createManager(
  feeEstimates: FeeByBlockTarget,
  minRelayFeeRate: number,
  feeMultiplier: number,
  feeMinimum: number,
) {
  class MockProvider implements Provider {
    getBlockHeight = () => Promise.resolve(1001);
    getBlockHash = () => Promise.resolve("hash1001");
    getFeeEstimates = () => Promise.resolve(feeEstimates);
    getMinRelayFeeRate = () => Promise.resolve(minRelayFeeRate);
    getAllData = () =>
      Promise.resolve({
        blockHeight: 1001,
        blockHash: "hash1001",
        feeEstimates,
        minRelayFeeRate,
      });
  }

  const manager = new DataProviderManager(
    { stdTTL: 0, checkperiod: 0 },
    1,
    feeMultiplier,
    feeMinimum,
  );
  manager.registerProvider(new MockProvider());
  return manager;
}

function expectIntegerValues(data: Estimates) {
  expect(Number.isInteger(data.min_relay_feerate)).toBe(true);
  for (const value of Object.values(data.fee_by_block_target)) {
    expect(Number.isInteger(value)).toBe(true);
  }
}

test("should round a fractional min relay fee rate up to an integer", async () => {
  const manager = createManager({ "1": 3, "2": 2 }, 1.013, 1, 1);

  const mergedData = await manager.getData();
  expect(mergedData.min_relay_feerate).toEqual(1013);
  expect(mergedData.fee_by_block_target).toEqual({
    "1": 3000,
    "2": 2000,
  });
  expectIntegerValues(mergedData);
});

test("should return integer values when a fee multiplier is applied", async () => {
  const manager = createManager({ "1": 3.333, "2": 2.5 }, 1.013, 1.5, 1);

  const mergedData = await manager.getData();
  expect(mergedData.min_relay_feerate).toEqual(1520);
  expect(mergedData.fee_by_block_target).toEqual({
    "1": 5000,
    "2": 3750,
  });
  expectIntegerValues(mergedData);
});

test("should return an integer fallback estimate at a fractional min relay fee rate", async () => {
  const manager = createManager({ "1": 1, "2": 1 }, 1.013, 1, 1);

  const mergedData = await manager.getData();
  expect(mergedData.fee_by_block_target).toEqual({
    "1": 1013,
  });
  expect(mergedData.min_relay_feerate).toEqual(1013);
  expectIntegerValues(mergedData);
});

test("should not round up past a value that floating-point error inflates", async () => {
  // 2.007 * 1000 is 2007.0000000000002 in floating point.
  const manager = createManager({ "1": 3, "2": 2.007 }, 2.007, 1, 1);

  const mergedData = await manager.getData();
  expect(mergedData.min_relay_feerate).toEqual(2007);
  expect(mergedData.fee_by_block_target["2"]).toEqual(2007);
  expectIntegerValues(mergedData);
});

test("should not return an estimate below the min relay fee rate it equals", async () => {
  // With a 1.1 multiplier, scaling an estimate and the min relay fee rate in a different order put them 1 sat/kvB apart.
  for (const rate of [1.29, 1.3, 1.33, 1.36]) {
    const manager = createManager({ "1": rate }, rate, 1.1, 1);

    const mergedData = await manager.getData();
    expect(mergedData.fee_by_block_target["1"]).toEqual(
      mergedData.min_relay_feerate,
    );
  }
});
