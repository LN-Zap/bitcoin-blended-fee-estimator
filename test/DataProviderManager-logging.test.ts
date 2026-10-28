import { expect, test, mock } from "bun:test";
import type { Logger } from "pino";
import { DataProviderManager } from "../src/lib/DataProviderManager";
import { BitcoindProvider } from "../src/providers/bitcoind";

const RPC_USER = "rpc-user-value";
const RPC_PASS = "rpc-pass-value";

function createBitcoindProvider(): BitcoindProvider {
  const provider = new BitcoindProvider(
    "http://localhost:18445",
    RPC_USER,
    RPC_PASS,
    [2],
  );
  provider.rpc.getBlockCount = (cb: any) => cb(null, { result: 1000 });
  provider.rpc.getBestBlockHash = (cb: any) => cb(null, { result: "hash1000" });
  provider.rpc.batch = (_batch: any, cb: any) => cb(null, []);
  provider.getFeeEstimates = () => Promise.resolve({ "2": 5 });
  provider.getMinRelayFeeRate = () => Promise.resolve(1);
  return provider;
}

function createRecordingLogger() {
  const calls: unknown[][] = [];
  const record = mock((...args: unknown[]) => {
    calls.push(args);
  });
  const log = {
    info: record,
    debug: record,
    warn: record,
    error: record,
    trace: record,
  } as unknown as Logger;
  return { log, calls };
}

function serialize(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) return undefined;
      seen.add(v);
    }
    return v;
  });
}

test("should not log provider objects or their connection settings", async () => {
  const { log, calls } = createRecordingLogger();
  const provider = createBitcoindProvider();
  const manager = new DataProviderManager(
    { stdTTL: 0, checkperiod: 0 },
    1,
    1,
    1,
    log,
  );
  manager.registerProvider(provider);

  await manager.getData();

  expect(calls.length).toBeGreaterThan(0);
  for (const args of calls) {
    const payload = serialize(args);
    expect(payload).not.toContain(RPC_USER);
    expect(payload).not.toContain(RPC_PASS);
    for (const arg of args) {
      expect(
        JSON.stringify(arg, (_k, v) => (v === provider ? "<provider>" : v)),
      ).not.toContain("<provider>");
    }
  }
});

test("should log a summary of each fetched data point", async () => {
  const { log, calls } = createRecordingLogger();
  const manager = new DataProviderManager(
    { stdTTL: 0, checkperiod: 0 },
    1,
    1,
    1,
    log,
  );
  manager.registerProvider(createBitcoindProvider());

  await manager.getData();

  const fetched = calls
    .map(([arg]) => arg as { message?: string; dataPoints?: unknown })
    .find((arg) => arg.message === "Fetched data points");
  expect(fetched?.dataPoints).toEqual([
    {
      provider: "BitcoindProvider",
      blockHeight: 1000,
      blockHash: "hash1000",
      feeEstimateCount: 1,
      minRelayFeeRate: 1,
    },
  ]);
});
