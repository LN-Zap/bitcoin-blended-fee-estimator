import { afterAll, beforeAll, expect, test } from "bun:test";
import { DataProviderManager } from "../src/lib/DataProviderManager";
import { EsploraProvider } from "../src/providers/esplora";

const BLOCK_HASH = "a".repeat(64);

let fees: Record<string, unknown> = {};
let server: ReturnType<typeof Bun.serve>;
let esplora: EsploraProvider;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname === "/api/fee-estimates") return Response.json(fees);
      if (pathname === "/api/blocks/tip/height") return new Response("1001");
      if (pathname === "/api/blocks/tip/hash") return new Response(BLOCK_HASH);
      return new Response("not found", { status: 404 });
    },
  });
  esplora = new EsploraProvider(`http://localhost:${server.port}`, 6, 2000);
});

afterAll(() => {
  server.stop(true);
});

function healthyProvider(): Provider {
  const feeEstimates = { "1": 5, "3": 3, "6": 2 };
  return {
    getBlockHeight: () => Promise.resolve(1001),
    getBlockHash: () => Promise.resolve("hash1001"),
    getFeeEstimates: () => Promise.resolve(feeEstimates),
    getMinRelayFeeRate: () => Promise.resolve(1),
    getAllData: () =>
      Promise.resolve({
        blockHeight: 1001,
        blockHash: "hash1001",
        feeEstimates,
        minRelayFeeRate: 1,
      }),
  };
}

function newManager() {
  return new DataProviderManager({ stdTTL: 0, checkperiod: 0 }, 1, 1, 1);
}

function expectAllFinite(data: Estimates) {
  const values = [
    ...Object.values(data.fee_by_block_target),
    data.min_relay_feerate,
  ];
  for (const value of values) {
    expect(Number.isFinite(value)).toBe(true);
  }
  expect(JSON.stringify(data)).not.toContain("null");
}

test("EsploraProvider rejects an empty fee-estimates response", async () => {
  fees = {};
  await expect(esplora.getMinRelayFeeRate()).rejects.toThrow(
    "Invalid fee data",
  );
  await expect(esplora.getFeeEstimates()).rejects.toThrow("Invalid fee data");
});

test("EsploraProvider rejects a non-numeric fee-estimates response", async () => {
  fees = { "1": "high", "3": 2 };
  await expect(esplora.getMinRelayFeeRate()).rejects.toThrow(
    "Invalid fee data",
  );
});

test("EsploraProvider rejects numeric-string and null fee values", async () => {
  for (const bad of ["50", null]) {
    fees = { "1": bad, "3": 3 };
    await expect(esplora.getMinRelayFeeRate()).rejects.toThrow(
      "Invalid fee data",
    );
    await expect(esplora.getFeeEstimates()).rejects.toThrow("Invalid fee data");
  }
});

test("an Esplora provider returning no estimates is skipped and a healthy provider is used", async () => {
  fees = {};
  const manager = newManager();
  manager.registerProvider(esplora);
  manager.registerProvider(healthyProvider());

  const data = await manager.getData();

  expect(data.fee_by_block_target).toEqual({ "1": 5000, "3": 3000, "6": 2000 });
  expect(data.min_relay_feerate).toBe(1000);
  expectAllFinite(data);
});

const badProviders: [string, () => Provider][] = [
  [
    "an empty fee-estimates object and a finite min relay fee rate",
    () => {
      const bad = healthyProvider();
      bad.getFeeEstimates = () => Promise.resolve({});
      bad.getMinRelayFeeRate = () => Promise.resolve(7);
      return bad;
    },
  ],
  [
    "an Infinity min relay fee rate",
    () => {
      const bad = healthyProvider();
      bad.getMinRelayFeeRate = () => Promise.resolve(Infinity);
      return bad;
    },
  ],
  [
    "a NaN fee estimate",
    () => {
      const bad = healthyProvider();
      bad.getFeeEstimates = () => Promise.resolve({ "1": NaN, "3": 3 });
      return bad;
    },
  ],
  [
    "a non-numeric fee estimate",
    () => {
      const bad = healthyProvider();
      bad.getFeeEstimates = () =>
        Promise.resolve({ "1": "high", "3": 3 } as unknown as FeeByBlockTarget);
      return bad;
    },
  ],
  [
    "a numeric-string fee estimate",
    () => {
      const bad = healthyProvider();
      bad.getFeeEstimates = () =>
        Promise.resolve({ "1": "50", "3": 3 } as unknown as FeeByBlockTarget);
      return bad;
    },
  ],
  [
    "a null fee estimate",
    () => {
      const bad = healthyProvider();
      bad.getFeeEstimates = () =>
        Promise.resolve({ "1": null, "3": 3 } as unknown as FeeByBlockTarget);
      return bad;
    },
  ],
  [
    "a numeric-string min relay fee rate",
    () => {
      const bad = healthyProvider();
      bad.getMinRelayFeeRate = () => Promise.resolve("50" as unknown as number);
      return bad;
    },
  ],
];

for (const [name, makeBad] of badProviders) {
  for (const badFirst of [true, false]) {
    test(`a provider with ${name} is skipped when registered ${badFirst ? "first" : "second"}`, async () => {
      const manager = newManager();
      const providers = [makeBad(), healthyProvider()];
      for (const provider of badFirst ? providers : providers.reverse()) {
        manager.registerProvider(provider);
      }

      const data = await manager.getData();

      expect(data.fee_by_block_target).toEqual({
        "1": 5000,
        "3": 3000,
        "6": 2000,
      });
      expect(data.min_relay_feerate).toBe(1000);
      expectAllFinite(data);
    });
  }
}

test("a sole provider with a null min relay fee rate is rejected", async () => {
  // Math.max(1, null) coerces null to 0, so the blend alone cannot expose it.
  const bad = healthyProvider();
  bad.getMinRelayFeeRate = () => Promise.resolve(null as unknown as number);
  const manager = newManager();
  manager.registerProvider(bad);

  await expect(manager.getData()).rejects.toThrow("No data available");
});

test("getData throws when every provider returns a non-finite value", async () => {
  const manager = newManager();
  for (const [, makeBad] of badProviders) manager.registerProvider(makeBad());

  await expect(manager.getData()).rejects.toThrow("No data available");
});

test("EsploraProvider.getFeeEstimates rejects a non-finite fee value", async () => {
  fees = { "1": "high", "3": 2 };
  await expect(esplora.getFeeEstimates()).rejects.toThrow("Invalid fee data");
});

test("a failed getData is not cached, so a recovered provider is served fresh", async () => {
  const manager = new DataProviderManager(
    { stdTTL: 60, checkperiod: 0 },
    1,
    1,
    1,
  );
  let recovered = false;
  const provider = healthyProvider();
  provider.getMinRelayFeeRate = () => Promise.resolve(recovered ? 1 : Infinity);
  manager.registerProvider(provider);

  await expect(manager.getData()).rejects.toThrow("No data available");

  recovered = true;
  const data = await manager.getData();

  expect(data.fee_by_block_target).toEqual({ "1": 5000, "3": 3000, "6": 2000 });
  expect(data.min_relay_feerate).toBe(1000);
  expectAllFinite(data);
});

test("getData throws when every provider fails", async () => {
  fees = {};
  const failing = healthyProvider();
  failing.getBlockHeight = () => Promise.reject(new Error("down"));
  const manager = newManager();
  manager.registerProvider(failing);
  manager.registerProvider(esplora);

  await expect(manager.getData()).rejects.toThrow("No data available");
});

test("getData throws when no providers are registered", async () => {
  await expect(newManager().getData()).rejects.toThrow("No data available");
});

const badConfigs: [string, number, number][] = [
  ["a NaN fee minimum", 1, NaN],
  ["a NaN fee multiplier", NaN, 1],
];

for (const [name, feeMultiplier, feeMinimum] of badConfigs) {
  test(`getData rejects and caches nothing with ${name}`, async () => {
    const manager = new DataProviderManager(
      { stdTTL: 60, checkperiod: 0 },
      1,
      feeMultiplier,
      feeMinimum,
    );
    manager.registerProvider(healthyProvider());

    await expect(manager.getData()).rejects.toThrow("non-finite value");
    // A cached result would be returned here instead of rejecting again.
    await expect(manager.getData()).rejects.toThrow("non-finite value");
  });
}

test("non-numeric string settings make getData reject and cache nothing", async () => {
  const badStrings: [string, unknown, unknown][] = [
    ["a non-numeric string fee minimum", 1, "abc"],
    ["a non-numeric string fee multiplier", "abc", 1],
  ];
  for (const [, feeMultiplier, feeMinimum] of badStrings) {
    const manager = new DataProviderManager(
      { stdTTL: 60, checkperiod: 0 },
      1,
      feeMultiplier as number,
      feeMinimum as number,
    );
    manager.registerProvider(healthyProvider());

    await expect(manager.getData()).rejects.toThrow("non-finite value");
    // A cached result would be returned here instead of rejecting again.
    await expect(manager.getData()).rejects.toThrow("non-finite value");
  }
});
