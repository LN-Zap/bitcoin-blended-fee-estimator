import RpcClient from "bitcoind-rpc";
import { LOGLEVEL, BITCOIND_ESTIMATE_MODE } from "./util";
import { logger } from "./logger";
import { promisify } from "util";

const log = logger(LOGLEVEL);

export class BitcoindProvider implements Provider {
  public rpc: RpcClient;
  private targets: number[];

  constructor(url: string, user: string, pass: string, targets: number[]) {
    let { protocol, hostname: host, port } = new URL(url);
    protocol = protocol.replace(/.$/, "");
    this.rpc = new RpcClient({ protocol, host, port, user, pass });
    this.targets = targets;
  }

  async getBlockHeight(): Promise<number> {
    const getBlockCount = promisify(this.rpc.getBlockCount.bind(this.rpc));

    const response = await getBlockCount();
    log.trace({ msg: "getBlockCount", response: response.result });

    return response.result;
  }

  async getBlockHash(): Promise<string> {
    const getBestBlockHash = promisify(
      this.rpc.getBestBlockHash.bind(this.rpc),
    );

    const response = await getBestBlockHash();
    log.trace({ msg: "getBestBlockHash", response: response.result });

    return response.result;
  }

  async getFeeEstimate(target: number): Promise<number> {
    const estimateSmartFee = promisify(
      this.rpc.estimateSmartFee.bind(this.rpc),
    );

    const response = await estimateSmartFee(target, BITCOIND_ESTIMATE_MODE);
    log.trace({ msg: "estimateSmartFee", response: response.result });

    return response.result?.feerate;
  }

  async getFeeEstimates(): Promise<FeeByBlockTarget> {
    const batch = promisify(this.rpc.batch.bind(this.rpc));

    const targets = this.targets;
    const rpc = this.rpc;

    function batchCall() {
      targets.forEach(function (target) {
        rpc.estimateSmartFee(target, BITCOIND_ESTIMATE_MODE);
      });
    }

    const responses = await batch(batchCall);

    const fees: FeeByBlockTarget = {};
    let errorCount = 0;

    this.targets.forEach((target, i) => {
      try {
        let feeRate = responses[i].result?.feerate;
        if (feeRate) {
          // convert the returned value to satoshis, as it's currently returned in BTC.
          fees[target] = feeRate * 1e8;
        } else {
          throw new Error(responses[i].result?.errors[0]);
        }
      } catch (error) {
        errorCount++;
        log.warn({
          msg: `Error getting fee estimate for target ${target}:`,
          errors: responses[i].result?.errors.join(", "),
        });
      }
    });

    if (errorCount === this.targets.length) {
      log.error({ msg: "Error getting fee estimates" });
      throw new Error("Error getting fee estimates");
    }

    return fees;
  }

  async getAllData(): Promise<ProviderData> {
    const blockHeight = await this.getBlockHeight();
    const blockHash = await this.getBlockHash();
    const feeEstimates = await this.getFeeEstimates();
    return { blockHeight, blockHash, feeEstimates };
  }
}
