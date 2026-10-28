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

// Walks a logged value structurally, without JSON.stringify, so a provider's toJSON cannot hide what was passed to the logger.
function findLeak(
  value: unknown,
  provider: object,
  seen = new WeakSet<object>(),
): string | null {
  if (value === provider) return "provider object";
  if (typeof value === "string") {
    return value.includes(RPC_USER) || value.includes(RPC_PASS)
      ? "credential string"
      : null;
  }
  if (typeof value !== "object" || value === null || seen.has(value))
    return null;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const leak = findLeak(
      (value as Record<PropertyKey, unknown>)[key],
      provider,
      seen,
    );
    if (leak) return leak;
  }
  return null;
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
    expect(findLeak(args, provider)).toBeNull();
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
