import { Hono } from 'hono'
import { raw } from 'hono/html'
import { logger as honoLogger } from 'hono/logger'
import { etag } from 'hono/etag'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/bun'
import config from 'config'
import NodeCache from 'node-cache';
import RpcClient from 'bitcoind-rpc'
import pino, { type Logger } from 'pino'

// Get application configuration values from the config package.
const PORT = config.get<number>('server.port');
const BASE_URL = config.get<number>('server.baseUrl');

const ESPLORA_BASE_URL = config.get<string>('esplora.baseUrl');
const ESPLORA_FALLBACK_BASE_URL = config.get<string>('esplora.fallbackBaseUrl');

const MEMPOOL_BASE_URL = config.get<string>('mempool.baseUrl');
const MEMPOOL_FALLBACK_BASE_URL = config.get<string>('mempool.fallbackBaseUrl');
const MEMPOOL_DEPTH = config.get<number>('mempool.depth');

const BITCOIND_BASE_URL = config.get<string>('bitcoind.baseUrl');
const BITCOIND_USERNAME = config.get<string>('bitcoind.username');
const BITCOIND_PASSWORD = config.get<number>('bitcoind.password');
const BITCOIND_CONF_TARGETS = config.get<number[]>('bitcoind.confTargets');

const LOGLEVEL = config.get<string>('settings.loglevel');
const TIMEOUT = config.get<number>('settings.timeout');
const FEE_MULTIPLIER = config.get<number>('settings.feeMultiplier');
const FEE_MINIMUM = config.get<number>('settings.feeMinimum');
const CACHE_STDTTL = config.get<number>('cache.stdTTL');
const CACHE_CHECKPERIOD = config.get<number>('cache.checkperiod');

let logger : Logger;
if (process.env.NODE_ENV !== 'production') {
  try {
    const pretty = require('pino-pretty');
    logger = pino({ level: LOGLEVEL }, pretty());
  } catch (error) {
    logger = pino({ level: LOGLEVEL });
  }
} else {
  logger = pino({ level: LOGLEVEL });
}

// Log the configuration values.
logger.info({
  mempoolSettings: {
    baseUrl: MEMPOOL_BASE_URL,
    fallbackBaseUrl: MEMPOOL_FALLBACK_BASE_URL,
    estimationDepth: MEMPOOL_DEPTH
  },
  esploraSettings: {
    baseUrl: ESPLORA_BASE_URL,
    fallbackBaseUrl: ESPLORA_FALLBACK_BASE_URL
  },
  bitcoindSettings: {
    baseUrl: BITCOIND_BASE_URL,
    username: BITCOIND_USERNAME,
    password: '******'
  },
  appSettings: {
    serverPort: PORT,
    baseUrl: BASE_URL,
    feeMinimum: FEE_MINIMUM,
    feeMultiplier: FEE_MULTIPLIER,
    timeout: TIMEOUT,
    cacheStdTTL: CACHE_STDTTL,
    cacheCheckPeriod: CACHE_CHECKPERIOD
  }
});

// Constants
const MEMPOOL_TIP_HASH_URL = MEMPOOL_BASE_URL && `${MEMPOOL_BASE_URL}/api/blocks/tip/hash`;
const ESPLORA_TIP_HASH_URL = ESPLORA_BASE_URL && `${ESPLORA_BASE_URL}/api/blocks/tip/hash`;
const MEMPOOL_FEES_URL = MEMPOOL_BASE_URL && `${MEMPOOL_BASE_URL}/api/v1/fees/recommended`;
const ESPLORA_FEE_ESTIMATES_URL = ESPLORA_BASE_URL && `${ESPLORA_BASE_URL}/api/fee-estimates`;

const MEMPOOL_TIP_HASH_URL_FALLBACK = MEMPOOL_FALLBACK_BASE_URL && `${MEMPOOL_FALLBACK_BASE_URL}/api/blocks/tip/hash`;
const ESPLORA_TIP_HASH_URL_FALLBACK = ESPLORA_FALLBACK_BASE_URL && `${ESPLORA_FALLBACK_BASE_URL}/api/blocks/tip/hash`;
const MEMPOOL_FEES_URL_FALLBACK = MEMPOOL_FALLBACK_BASE_URL && `${MEMPOOL_FALLBACK_BASE_URL}/api/v1/fees/recommended`;
const ESPLORA_FEE_ESTIMATES_URL_FALLBACK = ESPLORA_FALLBACK_BASE_URL && `${ESPLORA_FALLBACK_BASE_URL}/api/fee-estimates`;

// Initialize the cache.
const CACHE_KEY = 'estimates';
const cache = new NodeCache({ stdTTL: CACHE_STDTTL, checkperiod: CACHE_CHECKPERIOD });


/**
 * Helper function to extract value from a fulfilled promise.
 */
function getValueFromFulfilledPromise(result: PromiseSettledResult<any>) {
  return result && result.status === "fulfilled" && result.value ? result.value : null;
}

// NOTE: fetch signal abortcontroller does not work on Bun.
// See https://github.com/oven-sh/bun/issues/2489
async function fetchWithTimeout(url: string, timeout: number = TIMEOUT): Promise<Response> {
  logger.debug({ message: `Starting fetch request to ${url}` });
  const fetchPromise = fetch(url);
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`Request timed out after ${timeout} ms`)), timeout)
  );

  return Promise.race([fetchPromise, timeoutPromise]) as Promise<Response>;
}

/**
 * Fetches data from the given URL and validates and processes the response.
 */
async function fetchAndProcess(url: string, expectedResponseType: ExpectedResponseType): Promise<string | object | null> {
  const response = await fetchWithTimeout(url, TIMEOUT);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  logger.debug({message: `Successfully fetched data from ${url}` });

  const contentType = response.headers.get("content-type");
  if (expectedResponseType === 'json' && contentType?.includes("application/json")) {
    return response.json();
  } else if (expectedResponseType === 'text' && contentType?.includes("text/plain")) {
    const text = await response.text();
    const trimmedText = text.trim();
    if (trimmedText.includes('\n') || text !== trimmedText) {
      throw new Error('Response is not a single text string with no whitespace or newlines');
    }
    return trimmedText;
  } else {
    throw new Error(`Unexpected response type. Expected ${expectedResponseType}, but received ${contentType}`);
  }
}

/**
 * Fetches data from the given URL with a timeout, fallback, and error handling.
 */
async function fetchAndHandle(url: string, expectedResponseType: ExpectedResponseType, fallbackUrl?: string): Promise<string | object | null> {
  try {
    const timeout = new Promise((resolve) => setTimeout(resolve, TIMEOUT, 'timeout'));
    const fetchPromise = fetchAndProcess(url, expectedResponseType);
    const result = await Promise.race([fetchPromise, timeout]) as Promise<Response> | string;

    if (result === 'timeout' || result instanceof Error) {
      throw new Error('Fetch or timeout error');
    }

    return result;
  } catch (error) {
    if (fallbackUrl) {
      logger.debug({ message: 'Trying fallback URL: ${fallbackUrl}' });
      return fetchAndProcess(fallbackUrl, expectedResponseType);
    } else {
      throw new Error(`Fetch request to ${url} failed and no fallback URL was provided.`);
    }
  }
}

/**
 * Fetches mempool fees.
 */
async function fetchMempoolFees() : Promise<MempoolFeeEstimates | null> {
  const tasks = [
    MEMPOOL_FEES_URL && fetchAndHandle(MEMPOOL_FEES_URL, 'json'),
    MEMPOOL_FEES_URL_FALLBACK && fetchAndHandle(MEMPOOL_FEES_URL_FALLBACK, 'json'),
  ].filter(Boolean);
  if (tasks.length === 0) {
    return null;
  }

  const results = await Promise.allSettled(tasks);
  logger.debug({ message: 'Fetched data from mempool: {results}', results });

  let res0 = getValueFromFulfilledPromise(results[0]);
  let res1 = getValueFromFulfilledPromise(results[1]);

  // If all of the response properties are 1, then the response is an error (probably the mempool data is not available).
  const isRes0Invalid = !res0 || (Object.values(res0).every((value) => value === 1));
  const isRes1Invalid = !res1 || (Object.values(res1).every((value) => value === 1));

  // Return a response that is valid, or null if both responses are invald.
  let data : MempoolFeeEstimates;
  if (!isRes0Invalid) {
    data = res0;
  } else {
    data = isRes1Invalid ? null : res1;
  }
  logger.info({ message: 'Got data from mempool: {data}', data });
  return data;
}

/**
 * Fetches esplora fees.
 */
async function fetchEsploraFees() : Promise<FeeByBlockTarget | null> {
  const tasks = [
    ESPLORA_FEE_ESTIMATES_URL && fetchAndHandle(ESPLORA_FEE_ESTIMATES_URL, 'json'),
    ESPLORA_FEE_ESTIMATES_URL_FALLBACK && fetchAndHandle(ESPLORA_FEE_ESTIMATES_URL_FALLBACK, 'json'),
  ].filter(Boolean);
  if (tasks.length === 0) {
    return null;
  }
  const results = await Promise.allSettled(tasks);
  logger.debug({ message: 'Fetched data from mempool: {results}', results });

  let res0 = getValueFromFulfilledPromise(results[0]);
  let res1 = getValueFromFulfilledPromise(results[1]);

  const data: FeeByBlockTarget = res0 || res1 || null;
  logger.info({ message: 'Got data from esplora: {data}', data });
  return data;
}

/**
 * Fetches bitcoind fees.
 */
async function fetchBitcoindFees() : Promise<FeeByBlockTarget | null> {
  if (!BITCOIND_BASE_URL) {
    return null;
  }

  return new Promise((resolve, _) => {
    var data : FeeByBlockTarget = {};

    // Define the targets for which to fetch fee estimates.
    const targets = BITCOIND_CONF_TARGETS;

    // Extract protocol, host, port from bitcoindBaseUrl.
    var { protocol, hostname: host, port } = new URL(BITCOIND_BASE_URL); 

    // Strip the trailing colon from the protocol.
    protocol = protocol.replace(/.$/, '')

    var config = {
      protocol,
      host,
      port,
      user: BITCOIND_USERNAME,
      pass: BITCOIND_PASSWORD,
    };

    var rpc = new RpcClient(config);

    function batchCall() {
      targets.forEach(function (target) {
        rpc.estimatesmartfee(target);
      });
    }

    rpc.batch(batchCall, (error: Error | null, response: BitcoindRpcBatchResponse[]) => {
      if (error) {
        logger.error({ message: 'Unable to fetch fee estimates from bitcoind: {error}', error });
        resolve(null);
      } else {
        targets.forEach((target, i) => {  
          var feeRate = response[i].result?.feerate;
          if (feeRate) {
            // convert the returned value to satoshis, as it's currently returned in BTC.
            data[target] = feeRate * 1e8;
          } else {
            logger.error({ message: `Failed to fetch fee estimate from bitcoind for confirmation target ${target}: {errors}`,
              errors: response[i].result?.errors});
          }
        });
        logger.info({ message: 'Got data from bitcoind: {data}', data });
        resolve(data);
      }
    });
  });
}

function processEstimates(estimates: FeeByBlockTarget, applyMultiplier = true, convert = false) : FeeByBlockTarget {
  for (const [blockTarget, fee] of Object.entries(estimates) as [string, number][]) {
    let estimate = fee;
    if (applyMultiplier) {
      estimate = applyFeeMultiplier(fee);
    }
    if (convert) {
      estimate = Math.ceil(estimate * 1000);
    }
    estimates[blockTarget] = estimate;
  }
  return estimates;
}

/**
 * Fetches the current block hash.
 */
async function fetchBlocksTipHash() : Promise<string | null> {
  const tasks = [
    (MEMPOOL_TIP_HASH_URL || MEMPOOL_TIP_HASH_URL_FALLBACK) && fetchAndHandle(MEMPOOL_TIP_HASH_URL, 'text', MEMPOOL_TIP_HASH_URL_FALLBACK),
    (ESPLORA_TIP_HASH_URL || ESPLORA_TIP_HASH_URL_FALLBACK) && fetchAndHandle(ESPLORA_TIP_HASH_URL, 'text', ESPLORA_TIP_HASH_URL_FALLBACK),
  ].filter(Boolean);
  const res = await Promise.allSettled(tasks);

  let res0 = getValueFromFulfilledPromise(res[0]);
  let res1 = getValueFromFulfilledPromise(res[1]);

  return res0 || res1 || null;
}

/**
 * Gets the current fee estimates from the cache or fetches them if they are not cached.
 */
async function getEstimates() : Promise<Estimates> {
  let estimates: Estimates | undefined = cache.get(CACHE_KEY);

  if (estimates) {
    logger.info({ message: 'Got estimates from cache: ${estimates}', estimates });
    return estimates;
  }

  const tasks = [
    await fetchMempoolFees(),
    await fetchEsploraFees(),
    await fetchBitcoindFees(),
    await fetchBlocksTipHash(),
  ];
  const [result1, result2, result3, result4] = await Promise.allSettled(tasks);
  const mempoolFeeEstimates = getValueFromFulfilledPromise(result1);
  const esploraFeeEstimates = getValueFromFulfilledPromise(result2);
  const bitcoindFeeEstimates = getValueFromFulfilledPromise(result3);
  const blocksTipHash = getValueFromFulfilledPromise(result4);

  estimates = {
    current_block_hash: blocksTipHash,
    fee_by_block_target: calculateFees(mempoolFeeEstimates, esploraFeeEstimates, bitcoindFeeEstimates),
  };

  cache.set(CACHE_KEY, estimates);

  logger.info({ message: 'Got estimates: {estimates}', estimates });
  return estimates;
}

/**
 * Get the fee estimates that are above the desired mempool depth.
 */
function extractMempoolFees(mempoolFeeEstimates: MempoolFeeEstimates): FeeByBlockTarget {
  const feeByBlockTarget: FeeByBlockTarget = {};

  if (mempoolFeeEstimates) {
    const blockTargetMapping: BlockTargetMapping = {
      1: 'fastestFee',
      3: 'halfHourFee',
      6: 'hourFee'
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
 * Gets the lowest fee from the feeByBlockTarget object.
 */
function getLowestFee(feeByBlockTarget: FeeByBlockTarget) : number | null {
  const values = Object.values(feeByBlockTarget);
  return values.length > 0 ? Math.min(...values) : null;
}

/**
 * Applies the fee multiplier to the given estimate.
 */
function applyFeeMultiplier(fee: number) : number {
  return fee * FEE_MULTIPLIER;
}

/**
 * Filters the estimates to remove any that are lower than the desired minimum fee.
 */
function filterEstimates(feeByBlockTarget: FeeByBlockTarget, minFee: number): FeeByBlockTarget {
  const result: FeeByBlockTarget = {};
  for (const [blockTarget, fee] of Object.entries(feeByBlockTarget)) {
    if (fee >= minFee) {
      result[blockTarget] = fee;
    }
  }
  return result;
}

/**
 * Appends estimates to the feeByBlockTarget object.
 */
function addFeeEstimates(feeByBlockTarget: FeeByBlockTarget, feeEstimates: FeeByBlockTarget) {
  const lowestFee = getLowestFee(feeByBlockTarget)
  for (const [blockTarget, fee] of Object.entries(feeEstimates)) {
    if (!lowestFee || fee < lowestFee) {
      feeByBlockTarget[blockTarget] = fee;
    }
  }
}

/**
 * Calculates the fees.
 */
function calculateFees(mempoolFeeEstimates: MempoolFeeEstimates, esploraFeeEstimates: FeeByBlockTarget, bitcoindFeeEstimates: FeeByBlockTarget) {
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
  logger.debug({ message: 'Using minimum fee: {minFee}', minFee });

  // Return fees filterd to remove any that are lower than the determined minimum fee.
  if (minFee) {
    return filterEstimates(feeByBlockTarget, minFee);
  }

  return feeByBlockTarget;
}

// Define the layout components.

const Layout = (props: SiteData) => {
  return (
    <html lang="en">
      <head>
        <title>{props.title}</title>
        <meta name="description" content={props.subtitle}/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta charset="UTF-8"/>
        <meta name="color-scheme" content="light dark"/>
        <link rel="stylesheet" href="/static/style.css"/>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com"/>
        <link href="https://fonts.googleapis.com/css2?family=Arimo&family=Montserrat&family=Roboto:wght@100&display=swap" rel="stylesheet"/>
      </head>
      <body>{props.children}</body>
    </html>
  )
}

const Content = (props: { siteData: SiteData; estimates: Estimates }) => (
  <Layout {...props.siteData}>

    <div class="logo">
      <svg width="20" height="20" viewBox="0 0 155 120" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">
        <path fillRule="evenodd" clipRule="evenodd" d="M7.06565 43.2477C1.90963 41.2685 -0.665684 35.4843 1.31353 30.3283C3.29274 25.1722 9.07699 22.5969 14.233 24.5761L51.4526 38.8634C51.4937 38.8798 51.535 38.896 51.5765 38.9119L70.2481 46.0792C75.4041 48.0584 81.1883 45.4831 83.1675 40.3271C85.1468 35.1711 82.5714 29.3868 77.4154 27.4076L77.4132 27.4068C77.4139 27.4064 77.4145 27.406 77.4151 27.4056L58.7436 20.2383C53.5876 18.2591 51.0123 12.4749 52.9915 7.31885C54.9707 2.16283 60.755 -0.412485 65.911 1.56673L120.828 22.6473C120.959 22.6977 121.089 22.7506 121.217 22.8059C121.453 22.8928 121.69 22.9815 121.926 23.0721C147.706 32.9681 160.583 61.8894 150.686 87.6695C140.79 113.45 111.869 126.326 86.089 116.43C85.5927 116.24 85.1011 116.042 84.6144 115.838C84.3783 115.766 84.1431 115.686 83.9091 115.596L30.0742 94.9308C24.9182 92.9516 22.3428 87.1673 24.3221 82.0113C26.3013 76.8553 32.0855 74.2799 37.2415 76.2592L55.9106 83.4256C55.9103 83.4242 55.9099 83.4229 55.9095 83.4215L55.9133 83.423C61.0694 85.4022 66.8536 82.8269 68.8328 77.6709C70.812 72.5148 68.2367 66.7306 63.0807 64.7514L54.6786 61.5261C54.6787 61.5257 54.6788 61.5252 54.6789 61.5247L7.06565 43.2477Z" fill="currentColor"></path>
      </svg>
    </div>

    <div class="header">
      <h1>{props.siteData.title}</h1>
      <p>{props.siteData.subtitle}</p>
    </div>

    <div class="content">
      <pre>
        <span class="blue">curl</span> -L -X GET <span class="green">'{BASE_URL}/v1/fee-estimates'</span>
      </pre>

      <pre>
        {raw(JSON.stringify(props.estimates, null, 2))}
      </pre>
    </div>

    <div class="footer">
      <a href="https://github.com/LN-Zap/bitcoin-blended-fee-estimator">https://github.com/LN-Zap/bitcoin-blended-fee-estimator</a>
    </div>

  </Layout>
);

// Define the app.

// Initialize the Express app.
const app = new Hono();
logger.info(`Fee Estimates available at ${BASE_URL}/v1/fee-estimates`);

// Add a health/ready endpoint.
app.get('/health/ready', async (c) => {
  return c.text('OK');
});

// Add a health/live endpoint.
app.get('/health/live', async (c) => {
  return c.text('OK');
});

// Add middleware.
app.use('*', honoLogger())
app.use('*', etag())
app.use('*', cors({
  origin: '*',
}))
app.use('/static/*', serveStatic({ root: './' }))

// Define the routes.

/**
 * Returns the current fee estimates for the Bitcoin network, rendered as HTML.
 */
app.get('/', async (c) => {
  let estimates : Estimates;

  try {
    estimates = await getEstimates();

    // Set cache headers.
    c.res.headers.set('Cache-Control', `public, max-age=${CACHE_STDTTL}`)

  } catch (error) {
    logger.error(error);
    estimates = {
      current_block_hash: null,
      fee_by_block_target: {}
    };
  }

  const props = {
    siteData: {
      title: 'Bitcoin Blended Fee Estimator',
      subtitle: 'A blend of mempool-based and history-based Bitcoin fee estimates.',
    },
    estimates,
  }

  return c.html(<Content {...props}/>);
});

/**
 * Returns the current fee estimates for the Bitcoin network, rendered as JSON.
 */
app.get('/v1/fee-estimates', async (c) => {
  try {
    let estimates = await getEstimates();

    // Set cache headers.
    c.res.headers.set('Cache-Control', `public, max-age=${CACHE_STDTTL}`)

    // Return the estimates.
    return c.json(estimates);

  } catch (error) {
    logger.error(error);
    return c.text('Error fetching fee estimates', 500);
  }
});

export default {
  port: PORT,
  fetch: app.fetch,
}

process.on('SIGINT', function() {
  logger.info({ message: "Caught interrupt signal. Exiting." });
  process.exit();
});
