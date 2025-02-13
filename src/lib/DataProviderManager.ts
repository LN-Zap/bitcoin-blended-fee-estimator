import NodeCache from "node-cache";
import { LOGLEVEL } from "./util";
import { logger } from "./logger";
import { MempoolProvider } from "../providers/mempool";

const log = logger(LOGLEVEL, "data-provider-manager");

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

    let minRelayFeerate = this.getHighestMinRelayFeeRate(dataPoints);
    let feeEstimates = this.mergeFeeEstimates(dataPoints, minRelayFeerate);

    // Apply the fee formatter and multiplier.
    for (let [blockTarget, estimate] of Object.entries(feeEstimates)) {
      feeEstimates[blockTarget] = Math.ceil(
        (estimate *= 1000 * this.feeMultiplier),
      );
    }
    minRelayFeerate *= 1000 * this.feeMultiplier;
    const minConfiguredFeeRate = this.feeMinimum * 1000;

    // If we don't have any estimates that are above the fee minimums, add a single estimate at the minimum required fee.
    if (Object.keys(feeEstimates).length === 0) {
      feeEstimates["1"] = Math.max(minConfiguredFeeRate, minRelayFeerate);
    }

    // Ensure the minRelayFeerate is at least the fee minimum.
    minRelayFeerate = Math.max(minRelayFeerate, minConfiguredFeeRate);

    data = {
      current_block_height: blockHeight,
      current_block_hash: blockHash,
      fee_by_block_target: feeEstimates,
      min_relay_feerate: minRelayFeerate,
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
          let feeEstimates = await p.getFeeEstimates();
          const minRelayFeeRate = await p.getMinRelayFeeRate();

          // Parse and round the fee estimates to 3 decimal places
          feeEstimates = Object.fromEntries(
            Object.entries(feeEstimates).map(([key, value]) => [
              key,
              Math.round((value + Number.EPSILON) * 1000) / 1000,
            ]),
          );

          return {
            provider: p,
            blockHeight,
            blockHash,
            feeEstimates,
            minRelayFeeRate,
          } as DataPoint;
        } catch (error) {
          log.error({
            message: `Error fetching data from provider ${p.constructor.name}: ${error}`,
          });
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
    log.info({ message: "Fetched data points", dataPoints });

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
        log.warn({
          message: `Data point from block ${dp.blockHeight} was filtered out due to relevancy threshold.`,
        });
      }

      return isRelevant;
    });
  }

  /**
   * Filters fee estimates based on the fee minimum and the minRelayFeeRate.
   *
   * @param feeEstimates - An object containing fee estimates.
   * @param minRelayFeeRate - The minimum relay fee rate.
   * @param minConfiguredFeeRate - The configured minimum fee rate.
   * @returns An object containing the filtered fee estimates.
   */
  private filterEstimates(feeEstimates: FeeByBlockTarget, minRelayFeeRate: number, minConfiguredFeeRate: number): FeeByBlockTarget {
    return Object.fromEntries(
      Object.entries(feeEstimates).filter(([blockTarget, estimate]) => {
        if (estimate < minConfiguredFeeRate) {
          log.warn({
            message: `Fee estimate for target ${blockTarget} was below the minimum of ${minConfiguredFeeRate}.`,
          });
          return false;
        }

        if (estimate < minRelayFeeRate) {
          log.warn({
            message: `Fee estimate for target ${blockTarget} was below the minRelayFeeRate of ${minRelayFeeRate}.`,
          });
          return false;
        }

        return true;
      }),
    );
  }

  /**
   * Selects the highest min relay fee rate from multiple data points.
   *
   * @param dataPoints - An array of data points from which to select from.
   * @returns An number representing the highest min relay fee found.
   */
  private getHighestMinRelayFeeRate(dataPoints: DataPoint[]): number {
    return Math.max(...dataPoints.map(point => point.minRelayFeeRate));
  }

  /**
   * Merges fee estimates from multiple data points.
   *
   * @param dataPoints - An array of data points from which to merge fee estimates.
   * @returns An object containing the merged fee estimates.
   */
  private mergeFeeEstimates(dataPoints: DataPoint[], minRelayFeeRate: number): FeeByBlockTarget {
    let mergedEstimates: FeeByBlockTarget = {};

    // Iterate over all data points
    for (const dataPoint of dataPoints) {
      const estimates = this.filterEstimates(dataPoint.feeEstimates, minRelayFeeRate, this.feeMinimum);
      const providerName = dataPoint.provider.constructor.name;
      const keys = Object.keys(estimates)
        .map(Number)
        .sort((a, b) => a - b);

      keys.forEach((key) => {
        // Only add the estimate if it has a higher confirmation target and a lower fee.
        if (
          Object.keys(mergedEstimates).length === 0 ||
          (key > Math.max(...Object.keys(mergedEstimates).map(Number)) &&
            estimates[key] < Math.min(...Object.values(mergedEstimates)))
        ) {
          log.debug({
            message: `Adding estimate from ${providerName} with target ${key} and fee ${estimates[key]} to mergedEstimates`,
          });
          mergedEstimates[key] = estimates[key];
        }
      });
    }

    log.debug({ message: "Final mergedEstimates:", mergedEstimates });
    return mergedEstimates;
  }
}
