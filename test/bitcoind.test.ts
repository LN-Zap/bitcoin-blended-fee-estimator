import { expect, test, mock } from "bun:test";
import { BitcoindProvider } from "../src/providers/bitcoind";
import RpcClient from "bitcoind-rpc";

// Mock the RpcClient
const mockRpcClient: RpcClient = new RpcClient({
  protocol: "",
  host: "",
  port: "",
  user: "",
  pass: "",
});
mock<RpcClient>(mockRpcClient);

// Mock the methods
mockRpcClient.getBlockCount = (
  cb: (error: any, result: BlockCountResponse) => void,
) => cb(null, { result: 1000 });

mockRpcClient.getBestBlockHash = (
  cb: (error: any, result: BestBlockHashResponse) => void,
) =>
  cb(null, {
    result: "00000000000000000007d0f98d9edca880a6c1249057a01b78b182568c64005d",
  });

mockRpcClient.estimateSmartFee = (
  target: number = 2,
  mode: string,
  cb: (error: any, result: EstimateSmartFeeBatchResponse) => void,
) => cb(null, { result: { feerate: 1000 } });

mockRpcClient.getMempoolInfo = (
  cb: (error: any, result: MempoolInfoResponse) => void,
) => cb(null, { result: { mempoolminfee: 0.00001234 } });

const provider = new BitcoindProvider(
  "http://localhost:18445",
  "user",
  "pass",
  [2],
  "ECONOMICAL",
);

// Override the rpc property with the mock
provider.rpc = mockRpcClient;

test("getBlockHeight", async () => {
  const result = await provider.getBlockHeight();
  expect(result).toBe(1000);
});

test("getBlockHash", async () => {
  const result = await provider.getBlockHash();
  expect(result).toBe(
    "00000000000000000007d0f98d9edca880a6c1249057a01b78b182568c64005d",
  );
});

test("getFeeEstimate", async () => {
  const result = await provider.getFeeEstimate(2);
  expect(result).toEqual(1000);
});

test("getMinRelayFeeRate", async () => {
  const result = await provider.getMinRelayFeeRate();
  expect(result).toEqual(1.234);
});

// test("getFeeEstimates", async () => {
//   const result = await provider.getFeeEstimates();
//   expect(result).toEqual({ 2: 1000 });
// });

// test("getAllData", async () => {
//   const result = await provider.getAllData();
//   expect(result).toEqual({
//     blockHeight: 1000,
//     blockHash: "00000000000000000007d0f98d9edca880a6c1249057a01b78b182568c64005d",
//     feeEstimates: { 2: 1000, 3: 1000, 5: 1000 },
//   });
// });
