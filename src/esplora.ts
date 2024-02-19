import { fetchData, LOGLEVEL } from "./util";
import { logger } from "./logger";

const log = logger(LOGLEVEL);

/**
 * EsploraProvider class implements the Provider interface.
 * It provides methods to fetch data from a Esplora API.
 */
export class EsploraProvider implements Provider {
  private url: string;
  private depth: number;
  private timeout: number;

  /**
   * Constructs a new EsploraProvider.
   * @param url - The base URL of the Esplora API.
   * @param defaultDepth - The default depth for fee estimates.
   * @param defaultTimeout - The default timeout for fetch requests.
   */
  constructor(
    url: string,
    defaultDepth: number,
    defaultTimeout: number = 5000,
  ) {
    this.url = url;
    this.depth = defaultDepth;
    this.timeout = defaultTimeout;
  }

  /**
   * Fetches fee estimates from the Esplora API.
   * @param maxDepth - The maximum depth for fee estimates.
   * @returns A promise that resolves to an object of fee estimates.
   */
  async getFeeEstimates(
    maxDepth: number = this.depth,
  ): Promise<FeeByBlockTarget> {
    const data = await fetchData<EsploraFeeEstimates>(
      `${this.url}/api/fee-estimates`,
      "json",
      this.timeout,
    );

    const feeEstimates: FeeByBlockTarget = this.transformFeeData(
      data,
      maxDepth,
    );
    return feeEstimates;
  }

  /**
   * Fetches the current block height from the Esplora API.
   * @returns A promise that resolves to the current block height.
   */
  async getBlockHeight(): Promise<number> {
    const height = await fetchData<string>(
      `${this.url}/api/blocks/tip/height`,
      "text",
      this.timeout,
    );

    if (isNaN(Number(height))) {
      throw new Error("Invalid block height");
    }

    return Number(height);
  }

  /**
   * Fetches the current block hash from the Esplora API.
   * @returns A promise that resolves to the current block hash.
   */
  async getBlockHash(): Promise<string> {
    const hash = await fetchData<string>(
      `${this.url}/api/blocks/tip/hash`,
      "text",
      this.timeout,
    );

    // Bitcoin block hash is a 64-character long hexadecimal string
    const hashRegex = /^[a-fA-F0-9]{64}$/;

    if (!hashRegex.test(hash)) {
      throw new Error("Invalid block hash");
    }

    return hash;
  }

  /**
   * Fetches all data (block height, block hash, and fee estimates) from the Esplora API.
   * @returns A promise that resolves to an object of all data.
   */
  public async getAllData(): Promise<ProviderData> {
    try {
      const [blockHeight, blockHash, feeEstimates] = await Promise.all([
        this.getBlockHeight(),
        this.getBlockHash(),
        this.getFeeEstimates(),
      ]);

      return {
        blockHeight,
        blockHash,
        feeEstimates,
      };
    } catch (error) {
      log.error({ msg: "Error fetching all data from Esplora:", error });
      throw error;
    }
  }

  /**
   * Transforms the fetched fee data into a FeeByBlockTarget object.
   * @param data - The fetched fee data.
   * @param maxDepth - The maximum depth for fee estimates.
   * @returns A FeeByBlockTarget object.
   */
  private transformFeeData(
    data: EsploraFeeEstimates,
    maxDepth: number,
  ): FeeByBlockTarget {
    const feeEstimates: FeeByBlockTarget = {};

    // Iterate over the keys in the data object
    for (const target in data) {
      // Convert the target to a number
      const targetNumber = Number(target);

      // If the target is less than or equal to the maximum depth, add it to the fee estimates
      if (!isNaN(targetNumber) && targetNumber <= maxDepth) {
        feeEstimates[targetNumber] = data[target];
      }
    }

    return feeEstimates;
  }
}
