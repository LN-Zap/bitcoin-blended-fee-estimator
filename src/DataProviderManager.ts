import NodeCache from "node-cache";
import { LOGLEVEL } from "./util";
import { logger } from "./logger";

const log = logger(LOGLEVEL);

export class DataPoint {
  constructor(
    public provider: Provider,
    public blockHeight: number,
    public blockHash: string,
    public feeEstimates: FeeByBlockTarget,
  ) {}
}

export class MergedDataPoint {
  constructor(
    public blockHeight: number,
    public blockHash: string,
    public feeEstimates: FeeByBlockTarget,
  ) {}
}

export interface CacheConfig {
  stdTTL: number;
  checkperiod: number;
}

export class DataProviderManager {
  private providers: Provider[] = [];
  private cache: NodeCache;
  private heightDifferenceThreshold: number;

  constructor(cacheConfig: CacheConfig, heightDifferenceThreshold: number = 1) {
    this.cache = new NodeCache(cacheConfig);
    this.heightDifferenceThreshold = heightDifferenceThreshold;
  }

  public registerProvider(provider: Provider) {
    this.providers.push(provider);
  }

  public async getMergedData(): Promise<MergedDataPoint> {
    const dataPoints = await this.getRelevantDataPoints();

    const blockHeight = dataPoints[0].blockHeight;
    const blockHash = dataPoints[0].blockHash;
    const feeEstimates = this.mergeFeeEstimates(dataPoints);

    return new MergedDataPoint(blockHeight, blockHash, feeEstimates);
  }

  private async fetchDataPoints(): Promise<DataPoint[]> {
    return await Promise.all(
      this.providers.map(async (p) => {
        const blockHeight = await p.getBlockHeight();
        const blockHash = await p.getBlockHash();
        const feeEstimates = await p.getFeeEstimates();
        return new DataPoint(p, blockHeight, blockHash, feeEstimates);
      }),
    );
  }

  private async getSortedDataPoints(): Promise<DataPoint[]> {
    let dataPoints = this.cache.get<DataPoint[]>("dataPoints");
    if (!dataPoints) {
      dataPoints = await this.fetchDataPoints();
      this.cache.set("dataPoints", dataPoints);
    }
    dataPoints.sort(
      (a, b) =>
        b.blockHeight - a.blockHeight ||
        this.providers.indexOf(a.provider) - this.providers.indexOf(b.provider),
    );
    return dataPoints;
  }

  private async getRelevantDataPoints(): Promise<DataPoint[]> {
    // Get sorted data points from all providers
    const dataPoints = await this.getSortedDataPoints();

    // Filter out providers that don't meet the relevancy threshold criteria
    return dataPoints.filter(
      (dp) =>
        dataPoints[0].blockHeight - dp.blockHeight <=
        this.heightDifferenceThreshold,
    );
  }

  private mergeFeeEstimates(dataPoints: DataPoint[]): FeeByBlockTarget {
    // Start with the fee estimates from the most relevant provider
    let mergedEstimates = { ...dataPoints[0].feeEstimates };
    log.debug({ msg: "Initial mergedEstimates:", mergedEstimates });

    // Iterate over the remaining data points
    for (let i = 1; i < dataPoints.length; i++) {
      const estimates = dataPoints[i].feeEstimates;
      const keys = Object.keys(estimates)
        .map(Number)
        .sort((a, b) => a - b);
      log.debug({ msg: `Estimates for dataPoint ${i}:`, estimates });

      keys.forEach((key) => {
        // Only add the estimate if it has a higher confirmation target and a lower fee
        if (
          key > Math.max(...Object.keys(mergedEstimates).map(Number)) &&
          estimates[key] < Math.min(...Object.values(mergedEstimates))
        ) {
          log.debug(
            {msg: `Adding estimate with target ${key} and fee ${estimates[key]} to mergedEstimates` },
          );
          mergedEstimates[key] = estimates[key];
        }
      });
    }

    log.debug({ msg: "Final mergedEstimates:", mergedEstimates });
    return mergedEstimates;
  }
}
