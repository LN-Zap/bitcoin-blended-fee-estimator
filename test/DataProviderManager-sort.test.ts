import { expect, test } from "bun:test";
import { DataProviderManager } from "../src/lib/DataProviderManager";
import { MempoolProvider } from "../src/providers/mempool";
import { EsploraProvider } from "../src/providers/esplora";

// Every fake overrides all four methods that fetchDataPoints calls, so no test
// reaches the real provider implementations and nothing touches the network.
// The constructor URL is never used.
const UNUSED_URL = "";

class FakeMempool extends MempoolProvider {
  constructor(private readonly height: number) {
    super(UNUSED_URL, 6);
  }
  getBlockHeight = () => Promise.resolve(this.height);
  getBlockHash = () => Promise.resolve(`hash${this.height}`);
  getFeeEstimates = () => Promise.resolve({ "1": 1 });
  getMinRelayFeeRate = () => Promise.resolve(1);
}

class FakeEsplora extends EsploraProvider {
  constructor(private readonly height: number) {
    super(UNUSED_URL, 6);
  }
  getBlockHeight = () => Promise.resolve(this.height);
  getBlockHash = () => Promise.resolve(`hash${this.height}`);
  getFeeEstimates = () => Promise.resolve({ "1": 1 });
  getMinRelayFeeRate = () => Promise.resolve(1);
}

function newManager(...providers: Provider[]) {
  const manager = new DataProviderManager({ stdTTL: 0, checkperiod: 0 });
  providers.forEach((p) => manager.registerProvider(p));
  return manager;
}

test("mempool providers sort ahead of esplora regardless of registration order or height", async () => {
  // Esplora is deliberately higher, so only the mempool priority can put mempool first.
  const mempoolProvider = new FakeMempool(999);
  const esploraProvider = new FakeEsplora(1000);

  const dataPoints = await newManager(
    mempoolProvider,
    esploraProvider,
  ).getSortedDataPoints();
  expect(dataPoints.map((dp) => dp.provider)).toEqual([
    mempoolProvider,
    esploraProvider,
  ]);

  const dataPoints2 = await newManager(
    esploraProvider,
    mempoolProvider,
  ).getSortedDataPoints();
  expect(dataPoints2.map((dp) => dp.provider)).toEqual([
    mempoolProvider,
    esploraProvider,
  ]);
});

test("sorts providers of the same type by block height, then registration order", async () => {
  const first999 = new FakeMempool(999);
  const at1000 = new FakeMempool(1000);
  const second999 = new FakeMempool(999);

  const dataPoints = await newManager(
    first999,
    at1000,
    second999,
  ).getSortedDataPoints();
  expect(dataPoints.map((dp) => dp.provider)).toEqual([
    at1000,
    first999,
    second999,
  ]);
  expect(dataPoints.map((dp) => dp.blockHeight)).toEqual([1000, 999, 999]);
});
