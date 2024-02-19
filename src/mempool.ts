import { fetchWithTimeout, LOGLEVEL } from "./util";
import { logger } from "./logger";

const log = logger(LOGLEVEL);

/**
 * MempoolProvider class implements the Provider interface.
 * It provides methods to fetch data from a Mempool API.
 */
export class MempoolProvider implements Provider {
  private url: string;
  private depth: number;
  private timeout: number;

  /**
   * Constructs a new MempoolProvider.
   * @param url - The base URL of the Mempool API.
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
   * Fetches fee estimates from the Mempool API.
   * @param maxDepth - The maximum depth for fee estimates.
   * @returns A promise that resolves to an object of fee estimates.
   */
  async getFeeEstimates(
    maxDepth: number = this.depth,
  ): Promise<FeeByBlockTarget> {
    const data = await this.fetchData<MempoolFeeEstimates>(
      "/api/v1/fees/recommended",
      "json",
    );

    if (!data.fastestFee || !data.halfHourFee || !data.hourFee) {
      throw new Error("Invalid fee data");
    }

    const feeEstimates: FeeByBlockTarget = this.transformFeeData(
      data,
      maxDepth,
    );
    return feeEstimates;
  }

  /**
   * Fetches the current block height from the Mempool API.
   * @returns A promise that resolves to the current block height.
   */
  async getBlockHeight(): Promise<number> {
    const height = await this.fetchData<string>(
      "/api/blocks/tip/height",
      "text",
    );

    if (isNaN(Number(height))) {
      throw new Error("Invalid block height");
    }

    return Number(height);
  }

  /**
   * Fetches the current block hash from the Mempool API.
   * @returns A promise that resolves to the current block hash.
   */
  async getBlockHash(): Promise<string> {
    const hash = await this.fetchData<string>("/api/blocks/tip/hash", "text");

    // Bitcoin block hash is a 64-character long hexadecimal string
    const hashRegex = /^[a-fA-F0-9]{64}$/;

    if (!hashRegex.test(hash)) {
      throw new Error("Invalid block hash");
    }

    return hash;
  }

  /**
   * Fetches all data (block height, block hash, and fee estimates) from the Mempool API.
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
      log.error({ msg: "Error fetching all data from Mempool:", error });
      throw error;
    }
  }

  /**
   * Fetches data from a specific endpoint of the Mempool API.
   * @param endpoint - The endpoint to fetch data from.
   * @param responseType - The type of the response ('json' or 'text').
   * @returns A promise that resolves to the fetched data.
   */
  private async fetchData<T>(
    endpoint: string,
    responseType: "json" | "text",
  ): Promise<T> {
    try {
      const response = await fetchWithTimeout(
        `${this.url}${endpoint}`,
        this.timeout,
      );
      const data = await (responseType === "json"
        ? response.json()
        : response.text());
      return data as T;
    } catch (error) {
      log.error({ msg: `Error fetching data from ${endpoint}:`, error });
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
    data: MempoolFeeEstimates,
    maxDepth: number,
  ): FeeByBlockTarget {
    const feeEstimates: FeeByBlockTarget = {};

    if (maxDepth >= 1) feeEstimates[1] = data.fastestFee;
    if (maxDepth >= 3) feeEstimates[3] = data.halfHourFee;
    if (maxDepth >= 6) feeEstimates[6] = data.hourFee;

    return feeEstimates;
  }
}
