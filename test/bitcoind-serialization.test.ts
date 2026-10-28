import { expect, test } from "bun:test";
import { inspect } from "util";
import { Writable } from "stream";
import pino from "pino";
import { BitcoindProvider } from "../src/providers/bitcoind";

const RPC_USER = "rpc-user-value";
const RPC_PASS = "rpc-pass-value";
const RPC_AUTH = Buffer.from(`${RPC_USER}:${RPC_PASS}`).toString("base64");

function createProvider(): BitcoindProvider {
  return new BitcoindProvider(
    "http://localhost:18445",
    RPC_USER,
    RPC_PASS,
    [2, 3],
  );
}

function expectNoCredentials(output: string) {
  expect(output).not.toContain(RPC_USER);
  expect(output).not.toContain(RPC_PASS);
  expect(output).not.toContain(RPC_AUTH);
}

test("JSON serialization omits the RPC client", () => {
  const provider = createProvider();
  const output = JSON.stringify({ provider, nested: [provider] });

  expectNoCredentials(output);
  expect(JSON.parse(output).provider).toEqual({
    provider: "BitcoindProvider",
    targets: [2, 3],
    mode: "ECONOMICAL",
  });
});

test("util.inspect omits the RPC client", () => {
  expectNoCredentials(inspect(createProvider(), { depth: null }));
});

test("logging a whole provider with pino omits the RPC client", () => {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  const log = pino({ level: "trace" }, stream);
  const provider = createProvider();

  log.info({ provider, dataPoints: [{ provider }] }, "provider");

  expect(lines.length).toBe(1);
  expectNoCredentials(lines[0]);
});
