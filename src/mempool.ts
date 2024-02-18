export class MempoolProvider implements Provider {
  private url: string;
  private defaultDepth: number;

  constructor(url: string, defaultDepth: number) {
    this.url = url;
    this.defaultDepth = defaultDepth;
  }

  async getFeeEstimates(
    maxDepth: number = this.defaultDepth,
  ): Promise<FeeByBlockTarget> {
    try {
      const response = await fetch(`${this.url}/api/v1/fees/recommended`);
      const data = (await response.json()) as MempoolFeeEstimates;

      if (!data.fastestFee || !data.halfHourFee || !data.hourFee) {
        throw new Error("Invalid fee data");
      }

      const feeEstimates: FeeByBlockTarget = this.transformFeeData(
        data,
        maxDepth,
      );
      return feeEstimates;
    } catch (error) {
      console.error("Error getting fee estimates from Mempool:", error);
      throw error;
    }
  }

  async getBlockHeight(): Promise<number> {
    try {
      const response = await fetch(`${this.url}/api/blocks/tip/height`);
      const height = await response.text();

      if (isNaN(Number(height))) {
        throw new Error("Invalid block height");
      }

      return Number(height);
    } catch (error) {
      console.error("Error getting block height from Mempool:", error);
      throw error;
    }
  }

  async getBlockHash(): Promise<string> {
    try {
      const response = await fetch(`${this.url}/api/blocks/tip/hash`);
      const hash = await response.text();

      // Bitcoin block hash is a 64-character long hexadecimal string
      const hashRegex = /^[a-fA-F0-9]{64}$/;

      if (!hashRegex.test(hash)) {
        throw new Error("Invalid block hash");
      }

      return hash;
    } catch (error) {
      console.error("Error getting block hash from Mempool:", error);
      throw error;
    }
  }

  public async getAllData(): Promise<[number, string, FeeByBlockTarget]> {
    try {
      const [blockHeight, blockHash, feeEstimates] = await Promise.all([
        this.getBlockHeight(),
        this.getBlockHash(),
        this.getFeeEstimates(),
      ]);

      return [blockHeight, blockHash, feeEstimates];
    } catch (error) {
      console.error("Error fetching all data:", error);
      throw error;
    }
  }

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
