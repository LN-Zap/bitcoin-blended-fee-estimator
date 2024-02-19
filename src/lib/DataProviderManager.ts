import NodeCache from "node-cache";
import { LOGLEVEL } from "./util";
import { logger } from "./logger";
import { MempoolProvider } from "../providers/mempool";

const log = logger(LOGLEVEL);

export class DataProviderManager {
  private providers: Provider[] = [];
  private cache: NodeCache;
  private maxHeightDelta: number;
  private feeMultiplier: number;
  private feeMinimum: number;
  private cacheKey: string = "data";

  constructor(
    cacheConfig: CacheConfig = { stdTTL: 0, checkperiod: 0 },
    maxHeightDelta: number = 1,
    feeMultiplier: number = 1,
    feeMinimum: number = 1,
  ) {
    this.cache = new NodeCache(cacheConfig);
    this.maxHeightDelta = maxHeightDelta;
    this.feeMultiplier = feeMultiplier;
    this.feeMinimum = feeMinimum;
  }

  /**
   * Registers a new data provider.
   *
   * @param provider - The data provider to register.
   */
  public registerProvider(provider: Provider) {
    this.providers.push(provider);
  }

  /**
   * Gets data from the cache or fetches it from the providers if it's not in the cache.
   *
   * @returns A promise that resolves to the fetched data.
   */
  public async getData(): Promise<Estimates> {
    let data = this.cache.get<Estimates>("data");

    if (data) {
      log.info({ message: "Got data from cache", data });
      return data;
    }

    const dataPoints = await this.getRelevantDataPoints();
    const blockHeight = dataPoints[0].blockHeight;
    const blockHash = dataPoints[0].blockHash;
    const feeEstimates = this.mergeFeeEstimates(dataPoints);

    // Apply the fee minimum and multiplier.
    for (let [blockTarget, estimate] of Object.entries(feeEstimates)) {
      if (estimate >= this.feeMinimum) {
        feeEstimates[blockTarget] = Math.ceil(
          (estimate *= 1000 * this.feeMultiplier),
        );
      } else {
        log.warn({
          msg: `Fee estimate for target ${blockTarget} was below the minimum of ${this.feeMinimum}.`,
        });
      }
    }

    data = {
      current_block_height: blockHeight,
      current_block_hash: blockHash,
      fee_by_block_target: feeEstimates,
    };

    this.cache.set(this.cacheKey, data);
    log.info({ message: "Got data", data });

    return data;
  }

  /**
   * Fetches data points from all registered providers.
   *
   * @returns A promise that resolves to an array of fetched data points.
   */
  private async fetchDataPoints(): Promise<DataPoint[]> {
    const dataPoints = await Promise.all(
      this.providers.map(async (p) => {
        try {
          const blockHeight = await p.getBlockHeight();
          const blockHash = await p.getBlockHash();
          const feeEstimates = await p.getFeeEstimates();

          return {
            provider: p,
            blockHeight,
            blockHash,
            feeEstimates,
          } as DataPoint;
        } catch (error) {
          console.error(
            `Error fetching data from provider ${p.constructor.name}: ${error}`,
          );
          return null;
        }
      }),
    );

    // Filter out null results and return
    return dataPoints.filter((dp) => dp !== null) as DataPoint[];
  }

  /**
   * Gets sorted data points from the cache or fetches them from the providers if they're not in the cache.
   *
   * @returns A promise that resolves to an array of sorted data points.
   */
  public async getSortedDataPoints(): Promise<DataPoint[]> {
    const dataPoints = await this.fetchDataPoints();
    dataPoints.sort((a, b) => {
      // Prioritize mempool-based estimates
      if (
        a.provider instanceof MempoolProvider &&
        !(b.provider instanceof MempoolProvider)
      ) {
        return -1;
      } else if (
        !(a.provider instanceof MempoolProvider) &&
        b.provider instanceof MempoolProvider
      ) {
        return 1;
      }

      // If both are the same type, sort by block height and then by provider order
      return (
        b.blockHeight - a.blockHeight ||
        this.providers.indexOf(a.provider) - this.providers.indexOf(b.provider)
      );
    });
    return dataPoints;
  }

  /**
   * Gets relevant data points based on the height difference threshold.
   *
   * @returns A promise that resolves to an array of relevant data points.
   */
  private async getRelevantDataPoints(): Promise<DataPoint[]> {
    // Get sorted data points from all providers
    const dataPoints = await this.getSortedDataPoints();

    // Filter out providers that don't meet the relevancy threshold criteria
    return dataPoints.filter((dp) => {
      const isRelevant =
        dataPoints[0].blockHeight - dp.blockHeight <= this.maxHeightDelta;

      if (!isRelevant) {
        console.warn({
          msg: `Data point from block ${dp.blockHeight} was filtered out due to relevancy threshold.`,
        });
      }

      return isRelevant;
    });
  }

  /**
   * Merges fee estimates from multiple data points.
   *
   * @param dataPoints - An array of data points from which to merge fee estimates.
   * @returns An object containing the merged fee estimates.
   */
  private mergeFeeEstimates(dataPoints: DataPoint[]): FeeByBlockTarget {
    // Start with the fee estimates from the most relevant provider
    let mergedEstimates = { ...dataPoints[0].feeEstimates };
    log.debug({ msg: "Initial mergedEstimates:", mergedEstimates });
    // Iterate over the remaining data points
    for (let i = 1; i < dataPoints.length; i++) {
      const estimates = dataPoints[i].feeEstimates;
      const providerName = dataPoints[i].provider.constructor.name;
      const keys = Object.keys(estimates)
        .map(Number)
        .sort((a, b) => a - b);
      log.debug({ msg: `Estimates for dataPoint ${providerName}`, estimates });

      keys.forEach((key) => {
        // Only add the estimate if it has a higher confirmation target and a lower fee
        if (
          key > Math.max(...Object.keys(mergedEstimates).map(Number)) &&
          estimates[key] < Math.min(...Object.values(mergedEstimates))
        ) {
          log.debug({
            msg: `Adding estimate from ${providerName} with target ${key} and fee ${estimates[key]} to mergedEstimates`,
          });
          mergedEstimates[key] = estimates[key];
        }
      });
    }

    log.debug({ msg: "Final mergedEstimates:", mergedEstimates });
    return mergedEstimates;
  }
}
