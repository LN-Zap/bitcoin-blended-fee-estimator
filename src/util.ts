import config from "config";
import NodeCache from "node-cache";
import RpcClient from "bitcoind-rpc";
import { logger } from "./logger";

// Get application configuration values from the config package.
export const PORT = config.get<number>("server.port");
export const BASE_URL = config.get<number>("server.baseUrl");

export const ESPLORA_BASE_URL = config.get<string>("esplora.baseUrl");
export const ESPLORA_FALLBACK_BASE_URL = config.get<string>(
  "esplora.fallbackBaseUrl",
);

export const MEMPOOL_BASE_URL = config.get<string>("mempool.baseUrl");
export const MEMPOOL_FALLBACK_BASE_URL = config.get<string>(
  "mempool.fallbackBaseUrl",
);
export const MEMPOOL_DEPTH = config.get<number>("mempool.depth");

export const BITCOIND_BASE_URL = config.get<string>("bitcoind.baseUrl");
export const BITCOIND_USERNAME = config.get<string>("bitcoind.username");
export const BITCOIND_PASSWORD = config.get<number>("bitcoind.password");
export const BITCOIND_CONF_TARGETS = config.get<number[]>(
  "bitcoind.confTargets",
);
export const BITCOIND_ESTIMATE_MODE = config.get<EstimateMode>(
  "bitcoind.estimateMode",
);

export const LOGLEVEL = config.get<string>("settings.loglevel");
export const TIMEOUT = config.get<number>("settings.timeout");
export const FEE_MULTIPLIER = config.get<number>("settings.feeMultiplier");
export const FEE_MINIMUM = config.get<number>("settings.feeMinimum");
export const CACHE_STDTTL = config.get<number>("cache.stdTTL");
export const CACHE_CHECKPERIOD = config.get<number>("cache.checkperiod");

// Constants
export const MEMPOOL_TIP_HASH_URL =
  MEMPOOL_BASE_URL && `${MEMPOOL_BASE_URL}/api/blocks/tip/hash`;
export const ESPLORA_TIP_HASH_URL =
  ESPLORA_BASE_URL && `${ESPLORA_BASE_URL}/api/blocks/tip/hash`;
export const MEMPOOL_FEES_URL =
  MEMPOOL_BASE_URL && `${MEMPOOL_BASE_URL}/api/v1/fees/recommended`;
export const ESPLORA_FEE_ESTIMATES_URL =
  ESPLORA_BASE_URL && `${ESPLORA_BASE_URL}/api/fee-estimates`;

export const MEMPOOL_TIP_HASH_URL_FALLBACK =
  MEMPOOL_FALLBACK_BASE_URL &&
  `${MEMPOOL_FALLBACK_BASE_URL}/api/blocks/tip/hash`;
export const ESPLORA_TIP_HASH_URL_FALLBACK =
  ESPLORA_FALLBACK_BASE_URL &&
  `${ESPLORA_FALLBACK_BASE_URL}/api/blocks/tip/hash`;
export const MEMPOOL_FEES_URL_FALLBACK =
  MEMPOOL_FALLBACK_BASE_URL &&
  `${MEMPOOL_FALLBACK_BASE_URL}/api/v1/fees/recommended`;
export const ESPLORA_FEE_ESTIMATES_URL_FALLBACK =
  ESPLORA_FALLBACK_BASE_URL && `${ESPLORA_FALLBACK_BASE_URL}/api/fee-estimates`;

const log = logger(LOGLEVEL);

// Initialize the cache.
export const CACHE_KEY = "estimates";
const cache = new NodeCache({
  stdTTL: CACHE_STDTTL,
  checkperiod: CACHE_CHECKPERIOD,
});

/**
 * Helper function to extract value from a fulfilled promise.
 */
export function getValueFromFulfilledPromise(
  result: PromiseSettledResult<any>,
) {
  return result && result.status === "fulfilled" && result.value
    ? result.value
    : null;
}

// NOTE: fetch signal abortcontroller does not work on Bun.
// See https://github.com/oven-sh/bun/issues/2489
export async function fetchWithTimeout(
  url: string,
  timeout: number = TIMEOUT,
): Promise<Response> {
  log.debug({ message: `Starting fetch request to ${url}` });
  const fetchPromise = fetch(url);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`Request timed out after ${timeout} ms`)),
      timeout,
    ),
  );

  return Promise.race([fetchPromise, timeoutPromise]) as Promise<Response>;
}

/**
 * Fetches data from the given URL and validates and processes the response.
 */
export async function fetchAndProcess(
  url: string,
  expectedResponseType: ExpectedResponseType,
): Promise<string | object | null> {
  const response = await fetchWithTimeout(url, TIMEOUT);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  log.debug({ message: `Successfully fetched data from ${url}` });

  const contentType = response.headers.get("content-type");
  if (
    expectedResponseType === "json" &&
    contentType?.includes("application/json")
  ) {
    return response.json();
  } else if (
    expectedResponseType === "text" &&
    contentType?.includes("text/plain")
  ) {
    const text = await response.text();
    const trimmedText = text.trim();
    if (trimmedText.includes("\n") || text !== trimmedText) {
      throw new Error(
        "Response is not a single text string with no whitespace or newlines",
      );
    }
    return trimmedText;
  } else {
    throw new Error(
      `Unexpected response type. Expected ${expectedResponseType}, but received ${contentType}`,
    );
  }
}

/**
 * Fetches data from the given URL with a timeout, fallback, and error handling.
 */
export async function fetchAndHandle(
  url: string,
  expectedResponseType: ExpectedResponseType,
  fallbackUrl?: string,
): Promise<string | object | null> {
  try {
    const timeout = new Promise((resolve) =>
      setTimeout(resolve, TIMEOUT, "timeout"),
    );
    const fetchPromise = fetchAndProcess(url, expectedResponseType);
    const result = (await Promise.race([fetchPromise, timeout])) as
      | Promise<Response>
      | string;

    if (result === "timeout" || result instanceof Error) {
      throw new Error("Fetch or timeout error");
    }

    return result;
  } catch (error) {
    if (fallbackUrl) {
      log.debug({ message: "Trying fallback URL: ${fallbackUrl}" });
      return fetchAndProcess(fallbackUrl, expectedResponseType);
    } else {
      throw new Error(
        `Fetch request to ${url} failed and no fallback URL was provided.`,
      );
    }
  }
}

/**
 * Fetches mempool fees.
 */
export async function fetchMempoolData(): Promise<MempoolFeeEstimates | null> {
  const tasks = [
    MEMPOOL_FEES_URL && fetchAndHandle(MEMPOOL_FEES_URL, "json"),
    MEMPOOL_FEES_URL_FALLBACK &&
      fetchAndHandle(MEMPOOL_FEES_URL_FALLBACK, "json"),
  ].filter(Boolean);
  if (tasks.length === 0) {
    return null;
  }

  const results = await Promise.allSettled(tasks);
  log.debug({ message: "Fetched data from mempool: {results}", results });

  let res0 = getValueFromFulfilledPromise(results[0]);
  let res1 = getValueFromFulfilledPromise(results[1]);

  // If all of the response properties are 1, then the response is an error (probably the mempool data is not available).
  const isRes0Invalid =
    !res0 || Object.values(res0).every((value) => value === 1);
  const isRes1Invalid =
    !res1 || Object.values(res1).every((value) => value === 1);

  // Return a response that is valid, or null if both responses are invald.
  let data;
  if (!isRes0Invalid) {
    data = res0;
  } else {
    data = isRes1Invalid ? null : res1;
  }
  log.info({ message: "Using data from mempool: {data}", data });
  return data;
}

/**
 * Fetches esplora fees.
 */
export async function fetchEsploraData(): Promise<FeeByBlockTarget | null> {
  const tasks = [
    ESPLORA_FEE_ESTIMATES_URL &&
      fetchAndHandle(ESPLORA_FEE_ESTIMATES_URL, "json"),
    ESPLORA_FEE_ESTIMATES_URL_FALLBACK &&
      fetchAndHandle(ESPLORA_FEE_ESTIMATES_URL_FALLBACK, "json"),
  ].filter(Boolean);
  if (tasks.length === 0) {
    return null;
  }
  const results = await Promise.allSettled(tasks);
  log.debug({ message: "Fetched data from esplora: {results}", results });

  let res0 = getValueFromFulfilledPromise(results[0]);
  let res1 = getValueFromFulfilledPromise(results[1]);

  const data = res0 || res1 || null;
  log.info({ message: "Using data from esplora: {data}", data });
  return data;
}

/**
 * Fetches bitcoind fees.
 */
export async function fetchBitcoindData(): Promise<FeeByBlockTarget | null> {
  if (!BITCOIND_BASE_URL) {
    return null;
  }

  return new Promise((resolve, _) => {
    let data: FeeByBlockTarget = {};

    // Define the targets for which to fetch fee estimates.
    const targets = BITCOIND_CONF_TARGETS;

    // Extract protocol, host, port from bitcoindBaseUrl.
    let { protocol, hostname: host, port } = new URL(BITCOIND_BASE_URL);

    // Strip the trailing colon from the protocol.
    protocol = protocol.replace(/.$/, "");

    const config = {
      protocol,
      host,
      port,
      user: BITCOIND_USERNAME,
      pass: BITCOIND_PASSWORD,
    };

    const rpc = new RpcClient(config);

    function batchCall() {
      targets.forEach(function (target) {
        rpc.estimatesmartfee(target, BITCOIND_ESTIMATE_MODE);
      });
    }

    rpc.batch(
      batchCall,
      (error: Error | null, response: BitcoindRpcBatchResponse[]) => {
        if (error) {
          log.error({
            message: "Unable to fetch fee estimates from bitcoind: {error}",
            error,
          });
          resolve(null);
        } else {
          targets.forEach((target, i) => {
            let feeRate = response[i].result?.feerate;
            if (feeRate) {
              // convert the returned value to satoshis, as it's currently returned in BTC.
              data[target] = feeRate * 1e8;
            } else {
              log.error({
                message: `Failed to fetch fee estimate from bitcoind for confirmation target ${target}: {errors}`,
                errors: response[i].result?.errors,
              });
            }
          });
          log.info({ message: "Using data from bitcoind: {data}", data });
          resolve(data);
        }
      },
    );
  });
}

export function processEstimates(
  estimates: FeeByBlockTarget,
  applyMultiplier = true,
  convert = false,
): FeeByBlockTarget {
  for (const [blockTarget, fee] of Object.entries(estimates)) {
    let estimate = fee;
    if (applyMultiplier) {
      estimate = estimate * FEE_MULTIPLIER;
    }
    if (convert) {
      estimate = estimate * 1000;
    }
    estimates[Number(blockTarget)] = Math.ceil(estimate);
  }
  return estimates;
}

/**
 * Fetches the current block hash.
 */
export async function fetchBlocksTipHash(): Promise<string | null> {
  const tasks = [
    (MEMPOOL_TIP_HASH_URL || MEMPOOL_TIP_HASH_URL_FALLBACK) &&
      fetchAndHandle(
        MEMPOOL_TIP_HASH_URL,
        "text",
        MEMPOOL_TIP_HASH_URL_FALLBACK,
      ),
    (ESPLORA_TIP_HASH_URL || ESPLORA_TIP_HASH_URL_FALLBACK) &&
      fetchAndHandle(
        ESPLORA_TIP_HASH_URL,
        "text",
        ESPLORA_TIP_HASH_URL_FALLBACK,
      ),
  ].filter(Boolean);
  const res = await Promise.allSettled(tasks);

  let res0 = getValueFromFulfilledPromise(res[0]);
  let res1 = getValueFromFulfilledPromise(res[1]);

  return res0 || res1 || null;
}

/**
 * Gets the current fee estimates from the cache or fetches them if they are not cached.
 */
export async function getEstimates(): Promise<Estimates> {
  let estimates: Estimates | undefined = cache.get(CACHE_KEY);

  if (estimates) {
    log.info({ message: "Got estimates from cache: ${estimates}", estimates });
    return estimates;
  }

  const tasks = [
    await fetchMempoolData(),
    await fetchEsploraData(),
    await fetchBitcoindData(),
    await fetchBlocksTipHash(),
  ];
  const [result1, result2, result3, result4] = await Promise.allSettled(tasks);
  const mempoolFeeEstimates = getValueFromFulfilledPromise(result1);
  const esploraFeeEstimates = getValueFromFulfilledPromise(result2);
  const bitcoindFeeEstimates = getValueFromFulfilledPromise(result3);
  const blocksTipHash = getValueFromFulfilledPromise(result4);

  estimates = {
    current_block_hash: blocksTipHash,
    fee_by_block_target: calculateFees(
      mempoolFeeEstimates,
      esploraFeeEstimates,
      bitcoindFeeEstimates,
    ),
  };

  cache.set(CACHE_KEY, estimates);

  log.info({ message: "Got estimates: {estimates}", estimates });
  return estimates;
}

/**
 * Get the fee estimates that are above the desired mempool depth.
 */
export function extractMempoolFees(
  mempoolFeeEstimates: MempoolFeeEstimates,
): FeeByBlockTarget {
  const feeByBlockTarget: FeeByBlockTarget = {};

  if (mempoolFeeEstimates) {
    const blockTargetMapping: BlockTargetMapping = {
      1: "fastestFee",
      3: "halfHourFee",
      6: "hourFee",
    };
    for (let i = 1; i <= MEMPOOL_DEPTH; i++) {
      const feeProperty = blockTargetMapping[i];
      if (feeProperty && mempoolFeeEstimates[feeProperty]) {
        feeByBlockTarget[i] = mempoolFeeEstimates[feeProperty];
      }
    }
  }

  return feeByBlockTarget;
}

/**
 * Filters the estimates to remove duplicates and estimates that are lower than the desired minimum fee.
 */
export function filterEstimates(
  feeByBlockTarget: FeeByBlockTarget,
  minFee: number,
): FeeByBlockTarget {
  const result: FeeByBlockTarget = {};

  for (const [blockTarget, fee] of Object.entries(feeByBlockTarget)) {
    if (fee >= minFee) {
      result[Number(blockTarget)] = fee;
    }
  }

  // If we didn't manage to get any fee estimates, return a single estimate with the minimum fee.
  if (Object.keys(result).length === 0) {
    result[1] = minFee;
  }

  return result;
}

export function addFeeEstimates(
  feeByBlockTarget: { [key: number]: number },
  newEstimates: { [key: number]: number },
) {
  let highestBlockTarget = Math.max(
    ...Object.keys(feeByBlockTarget).map(Number),
  );
  let lowestFee = Math.min(...Object.values(feeByBlockTarget));

  log.trace({
    message: `Initial highest block target: ${highestBlockTarget}, Lowest fee: ${lowestFee}`,
  });

  // Iterate over the new estimates
  for (const [blockTarget, fee] of Object.entries(newEstimates)) {
    const numericBlockTarget = Number(blockTarget);

    log.trace({
      message: `New estimate - Block target: ${numericBlockTarget}, Fee: ${fee}`,
    });

    // Only add the new estimate if the block target is higher and the fee is lower than the current ones
    if (numericBlockTarget > highestBlockTarget && fee < lowestFee) {
      log.trace({
        message: `Adding new estimate - Block target: ${numericBlockTarget}, Fee: ${fee}`,
      });
      feeByBlockTarget[numericBlockTarget] = fee;

      // Update the highest block target and lowest fee
      highestBlockTarget = numericBlockTarget;
      lowestFee = fee;

      log.trace({
        message: `Updated highest block target: ${highestBlockTarget}, Lowest fee: ${lowestFee}`,
      });
    }
  }
}

/**
 * Calculates the fees.
 */
export function calculateFees(
  mempoolFeeEstimates: MempoolFeeEstimates,
  esploraFeeEstimates: FeeByBlockTarget,
  bitcoindFeeEstimates: FeeByBlockTarget,
) {
  let feeByBlockTarget: FeeByBlockTarget = {};

  // Get the mempool fee estimates.
  if (mempoolFeeEstimates) {
    let estimates = extractMempoolFees(mempoolFeeEstimates);
    estimates = processEstimates(estimates, true, true);
    addFeeEstimates(feeByBlockTarget, estimates);
  }

  // Add the bitcoind fee estimates.
  if (bitcoindFeeEstimates) {
    const estimates = processEstimates(bitcoindFeeEstimates, true, false);
    addFeeEstimates(feeByBlockTarget, estimates);
  }

  // Add the esplora fee estimates.
  if (esploraFeeEstimates) {
    const estimates = processEstimates(esploraFeeEstimates, true, true);
    addFeeEstimates(feeByBlockTarget, estimates);
  }

  // Get the minimum fee. If the mempool fee estimates are not available, use a default value of FEE_MINIMUM sat/vbyte as a safety net.
  const minFee = (mempoolFeeEstimates?.minimumFee ?? FEE_MINIMUM) * 1000;
  log.info({ message: "Using minimum fee: {minFee}", minFee });

  // Filter the estimates to remove any that are lower than the desired minimum fee.
  feeByBlockTarget = filterEstimates(feeByBlockTarget, minFee);

  return feeByBlockTarget;
}
