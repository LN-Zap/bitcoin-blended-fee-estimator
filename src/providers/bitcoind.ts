import RpcClient from "bitcoind-rpc";
import { LOGLEVEL } from "../lib/util";
import { logger } from "../lib/logger";
import { promisify } from "util";

const log = logger(LOGLEVEL);

/**
 * A class that provides data from a Bitcoind server.
 *
 * The `BitcoindProvider` class fetches data such as the current block height, block hash,
 * and fee estimates from a Bitcoind server. It provides methods to fetch each of these
 * data points individually, as well as a method to fetch all of them at once.
 *
 * @example
 * const provider = new BitcoindProvider('http://localhost:8332');
 * const data = await provider.getAllData();
 */
export class BitcoindProvider implements Provider {
  public rpc: RpcClient;
  private targets: number[];
  private mode: EstimateMode;

  constructor(
    url: string,
    user: string,
    pass: string,
    targets: number[],
    mode: EstimateMode = "ECONOMICAL",
  ) {
    let { protocol, hostname: host, port } = new URL(url);
    protocol = protocol.replace(/.$/, "");
    this.rpc = new RpcClient({ protocol, host, port, user, pass });
    this.targets = targets;
    this.mode = mode;
  }

  /**
   * Fetches the current block height from the Bitcoind server.
   *
   * @returns A promise that resolves to the current block height.
   */
  async getBlockHeight(): Promise<number> {
    const getBlockCount = promisify(this.rpc.getBlockCount.bind(this.rpc));

    const response = await getBlockCount();
    log.trace({ msg: "getBlockCount", response: response.result });

    return response.result;
  }

  /**
   * Fetches the current block hash from the Bitcoind server.
   *
   * @returns A promise that resolves to the current block hash.
   */
  async getBlockHash(): Promise<string> {
    const getBestBlockHash = promisify(
      this.rpc.getBestBlockHash.bind(this.rpc),
    );

    const response = await getBestBlockHash();
    log.trace({ msg: "getBestBlockHash", response: response.result });

    return response.result;
  }

  /**
   * Fetches a fee estimate from the Bitcoind server.
   *
   * @returns A promise that resolves to the fetched fee estimate.
   */
  async getFeeEstimate(target: number): Promise<number> {
    const estimateSmartFee = promisify(
      this.rpc.estimateSmartFee.bind(this.rpc),
    );

    const response = await estimateSmartFee(target, this.mode);
    log.trace({ msg: "estimateSmartFee", response: response.result });

    return response.result?.feerate;
  }

  /**
   * Fetches fee estimates from the Bitcoind server.
   *
   * @returns A promise that resolves to the fetched fee estimates.
   */
  async getFeeEstimates(): Promise<FeeByBlockTarget> {
    const batch = promisify(this.rpc.batch.bind(this.rpc));

    const targets = this.targets;
    const rpc = this.rpc;
    const mode = this.mode;

    function batchCall() {
      targets.forEach(function (target) {
        rpc.estimateSmartFee(target, mode);
      });
    }

    const responses = await batch(batchCall);

    const fees: FeeByBlockTarget = {};
    let errorCount = 0;

    this.targets.forEach((target, i) => {
      try {
        let feeRate = responses[i].result?.feerate;
        if (feeRate) {
          // convert the returned value to kvb, as it's currently returned in BTC.
          fees[target] = (feeRate * 1e8) / 1000;
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

  /**
   * Fetches all data from the Bitcoind server.
   *
   * This method fetches the current block height, block hash, and fee estimates from the Bitcoind server.
   * It then returns an object containing this data.
   *
   * @returns A promise that resolves to an object containing the block height, block hash, and fee estimates.
   */
  async getAllData(): Promise<ProviderData> {
    const blockHeight = await this.getBlockHeight();
    const blockHash = await this.getBlockHash();
    const feeEstimates = await this.getFeeEstimates();

    return { blockHeight, blockHash, feeEstimates };
  }
}
