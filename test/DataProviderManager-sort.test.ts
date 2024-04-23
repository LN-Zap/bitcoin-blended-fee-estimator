import { expect, test } from "bun:test";
import { DataProviderManager } from "../src/lib/DataProviderManager";
import { MempoolProvider } from "../src/providers/mempool";
import { EsploraProvider } from "../src/providers/esplora";

class MockProvider1 implements Provider {
  getBlockHeight = () => Promise.resolve(998);
  getBlockHash = () => Promise.resolve("hash1");
  getFeeEstimates = () => Promise.resolve({});
  getAllData = () =>
    Promise.resolve({
      blockHeight: 998,
      blockHash: "hash1",
      feeEstimates: {},
    });
}

class MockProvider2 implements Provider {
  getBlockHeight = () => Promise.resolve(1000);
  getBlockHash = () => Promise.resolve("hash3");
  getFeeEstimates = () => Promise.resolve({});
  getAllData = () =>
    Promise.resolve({
      blockHeight: 1000,
      blockHash: "hash3",
      feeEstimates: {},
    });
}

class MockProvider3 implements Provider {
  getBlockHeight = () => Promise.resolve(999);
  getBlockHash = () => Promise.resolve("hash2");
  getFeeEstimates = () => Promise.resolve({});
  getAllData = () =>
    Promise.resolve(({
      blockHeight: 999,
      blockHash: "hash2",
      feeEstimates: {},
    }));
}

const manager = new DataProviderManager({ stdTTL: 0, checkperiod: 0 });
manager.registerProvider(new MockProvider1());
manager.registerProvider(new MockProvider2());
manager.registerProvider(new MockProvider3());

test("sorts providers correctly", async () => {
  const mempoolProvider = new MempoolProvider("https://mempool.space", 6);
  const esploraProvider = new EsploraProvider("https://blockstream.info", 6);

  // Register the providers in the correct order
  const manager = new DataProviderManager();
  manager.registerProvider(mempoolProvider);
  manager.registerProvider(esploraProvider);
  const dataPoints = await manager.getSortedDataPoints();
  expect(dataPoints[0].provider).toBe(mempoolProvider);
  expect(dataPoints[1].provider).toBe(esploraProvider);

  // Register the providers in reverse order
  const manager2 = new DataProviderManager();
  manager2.registerProvider(esploraProvider);
  manager2.registerProvider(mempoolProvider);
  const dataPoints2 = await manager.getSortedDataPoints();
  expect(dataPoints2[0].provider).toBe(mempoolProvider);
  expect(dataPoints2[1].provider).toBe(esploraProvider);

  // Register multiple mempool providers with different block heights
  class mempool1 extends MempoolProvider {
    getBlockHeight = () => Promise.resolve(999);
    getBlockHash = () => Promise.resolve("hash1");
    getFeeEstimates = () => Promise.resolve({});
  }
  class mempool2 extends MempoolProvider {
    getBlockHeight = () => Promise.resolve(1000);
    getBlockHash = () => Promise.resolve("hash1");
    getFeeEstimates = () => Promise.resolve({});
  }
  class mempool3 extends MempoolProvider {
    getBlockHeight = () => Promise.resolve(999);
    getBlockHash = () => Promise.resolve("hash1");
    getFeeEstimates = () => Promise.resolve({});
  }
  const manager3 = new DataProviderManager();
  manager3.registerProvider(new mempool1("https://mempool.space", 6));
  manager3.registerProvider(new mempool2("https://mempool.space", 6));
  manager3.registerProvider(new mempool3("https://mempool.space", 6));
  const dataPoints3 = await manager3.getSortedDataPoints();
  expect(dataPoints3[0].blockHeight).toBe(1000);
});
