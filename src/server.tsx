import { Hono } from 'hono'
import { raw } from 'hono/html'
import { logger } from 'hono/logger'
import { etag } from 'hono/etag'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/bun'
import config from 'config'
import NodeCache from 'node-cache';

// Get application configuration values from the config package.
const port = config.get<number>('server.port');
const baseUrl = config.get<number>('server.baseUrl');
const esploraBaseUrl = config.get<string>('esplora.baseUrl');
const mempoolBaseUrl = config.get<string>('mempool.baseUrl');
const mempoolDepth = config.get<number>('mempool.depth');
const feeMultiplier = config.get<number>('settings.feeMultiplier');
const stdTTL = config.get<number>('cache.stdTTL');
const checkperiod = config.get<number>('cache.checkperiod');

// Set the timeout for fetch requests.
const TIMEOUT: number = 3000;

// Log the configuration values.
console.info('---');
console.info(`Using port: ${port}`);
console.info(`Using base URL: ${baseUrl}`);
console.info(`Using Esplora base URL: ${esploraBaseUrl}`);
console.info(`Using Mempool base URL: ${mempoolBaseUrl}`);
console.info(`Using Mempool estimation depth: ${mempoolDepth}`);
console.info(`Using fee multiplier: ${feeMultiplier}`);
console.info(`Using cache stdTTL: ${stdTTL}`);
console.info(`Using cache checkperiod: ${checkperiod}`);
console.info('---');

// Constants
const MEMPOOL_TIP_HASH_URL = `${mempoolBaseUrl}/api/blocks/tip/hash`;
const ESPLORA_TIP_HASH_URL = `${esploraBaseUrl}/api/blocks/tip/hash`;
const MEMPOOL_FEES_URL = `${mempoolBaseUrl}/api/v1/fees/recommended`;
const ESPLORA_FEE_ESTIMATES_URL = `${esploraBaseUrl}/api/fee-estimates`;

// Initialize the cache.
const cache = new NodeCache({ stdTTL: stdTTL, checkperiod: checkperiod });
const CACHE_KEY = 'estimates';

// NOTE: fetch signal abortcontroller does not work on Bun.
// See https://github.com/oven-sh/bun/issues/2489
async function fetchWithTimeout(url: string, timeout: number = TIMEOUT): Promise<Response> {
  console.debug(`Starting fetch request to ${url}`);
  const fetchPromise = fetch(url);
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`Request timed out after ${timeout} ms`)), timeout)
  );

  return Promise.race([fetchPromise, timeoutPromise]) as Promise<Response>;
}

/**
 * Fetches data from the given URL and returns the response as a string or object.
 */
async function fetchAndHandle(url: string): Promise<string | object | null> {
  try {
    const response = await fetchWithTimeout(url, TIMEOUT);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    console.debug(`Successfully fetched data from ${url}`);
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return await response.json();
    } else {
      return await response.text();
    }
  } catch (error) {
    console.error(`Error fetching from ${url}:`, error);
    return null;
  }
}

// Initialize the Express app.
const app = new Hono();
console.info(`Fee Estimates available at ${baseUrl}/v1/fee-estimates`);

// Add a health/ready endpoint.
app.get('/health/ready', async (c) => {
  return c.text('OK');
});

// Add a health/live endpoint.
app.get('/health/live', async (c) => {
  return c.text('OK');
});

// Add middleware.
app.use('*', logger())
app.use('*', etag())
app.use('*', cors({
  origin: '*',
}))
app.use('/static/*', serveStatic({ root: './' }))

/**
 * Fetches the data from the mempool and esplora APIs.
 */
async function fetchData() {
  const tasks = [
    fetchAndHandle(MEMPOOL_TIP_HASH_URL),
    fetchAndHandle(ESPLORA_TIP_HASH_URL),
    fetchAndHandle(MEMPOOL_FEES_URL),
    fetchAndHandle(ESPLORA_FEE_ESTIMATES_URL)
  ];

  return await Promise.allSettled(tasks);
}

/**
 * Gets the current fee estimates from the cache or fetches them if they are not cached.
 */
async function getEstimates() : Promise<Estimates> {
  let estimates: Estimates | undefined = cache.get(CACHE_KEY);

  if (!estimates) {
    const results = await fetchData();
    console.debug('Fetch tasks completed', results);

    const { blocksTipHash, mempoolFeeEstimates, esploraFeeEstimates } = assignResults(results);
    const feeByBlockTarget = calculateFees(mempoolFeeEstimates, esploraFeeEstimates);

    estimates = {
      current_block_hash: blocksTipHash,
      fee_by_block_target: feeByBlockTarget
    };

    cache.set(CACHE_KEY, estimates);
  }

  console.debug('Got estimates', estimates);
  return estimates;
}

/**
 * Helper function to extract value from a fulfilled promise.
 */
function getValueFromFulfilledPromise(result: PromiseSettledResult<any>) {
  return result.status === "fulfilled" && result.value ? result.value : null;
}

/**
 * Assigns the results of the fetch tasks to variables.
 */
function assignResults(results: PromiseSettledResult<any>[]) {
  const [result1, result2, result3, result4] = results;

  const blocksTipHash = getValueFromFulfilledPromise(result1) || getValueFromFulfilledPromise(result2);
  const mempoolFeeEstimates = getValueFromFulfilledPromise(result3) as MempoolFeeEstimates;
  const esploraFeeEstimates = getValueFromFulfilledPromise(result4) as EsploraFeeEstimates;

  return { blocksTipHash, mempoolFeeEstimates, esploraFeeEstimates };
}

/**
 * Calculates the fee estimates for the Bitcoin network.
 */
function calculateFees(mempoolFeeEstimates: MempoolFeeEstimates | null | undefined, esploraFeeEstimates: EsploraFeeEstimates | null | undefined) {
  let feeByBlockTarget: FeeByBlockTarget = {};
  const minFee = mempoolFeeEstimates?.minimumFee;

  feeByBlockTarget = calculateMempoolFees(mempoolFeeEstimates, feeByBlockTarget);
  const minMempoolFee = calculateMinMempoolFee(feeByBlockTarget);
  feeByBlockTarget = calculateEsploraFees(esploraFeeEstimates, feeByBlockTarget, minMempoolFee, minFee);

  return feeByBlockTarget;
}

function calculateMempoolFees(mempoolFeeEstimates: MempoolFeeEstimates | null | undefined, feeByBlockTarget: FeeByBlockTarget) {
  if (mempoolFeeEstimates) {
    const blockTargetMapping: BlockTargetMapping = {
      1: 'fastestFee',
      3: 'halfHourFee',
      6: 'hourFee'
    };
    for (let i = 1; i <= mempoolDepth; i++) {
      const feeProperty = blockTargetMapping[i];
      if (feeProperty && mempoolFeeEstimates[feeProperty] !== undefined) {
        const adjustedFee = Math.round(mempoolFeeEstimates[feeProperty]! * 1000 * feeMultiplier);
        feeByBlockTarget[i] = adjustedFee;
      }
    }
  }
  return feeByBlockTarget;
}

function calculateMinMempoolFee(feeByBlockTarget: FeeByBlockTarget) {
  const values = Object.values(feeByBlockTarget);
  return values.length > 0 ? Math.min(...values) : undefined;
}

function shouldSkipFee(blockTarget: string, adjustedFee: number, feeByBlockTarget: FeeByBlockTarget, minMempoolFee: number | undefined, minFee: number | undefined): boolean {
  const blockTargetInt = parseInt(blockTarget);

  if (feeByBlockTarget.hasOwnProperty(blockTarget)) return true;
  if (minMempoolFee && adjustedFee >= minMempoolFee) return true;
  if (minFee && adjustedFee <= minFee) return true;
  if (blockTargetInt <= mempoolDepth) return true;

  return false;
}

function calculateEsploraFees(esploraFeeEstimates: EsploraFeeEstimates | null | undefined, feeByBlockTarget: FeeByBlockTarget, minMempoolFee: number | undefined, minFee: number | undefined) {
  if (esploraFeeEstimates) {
    for (const [blockTarget, fee] of Object.entries(esploraFeeEstimates)) {
      const adjustedFee = Math.round(fee * 1000 * feeMultiplier);

      if (shouldSkipFee(blockTarget, adjustedFee, feeByBlockTarget, minMempoolFee, minFee)) continue;

      feeByBlockTarget[blockTarget] = adjustedFee;
    }
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

    <div style="display: flex; justify-content: center; margin-top: 26px;">
      <svg width="20" height="20" viewBox="0 0 155 120" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">
        <path fillRule="evenodd" clipRule="evenodd" d="M7.06565 43.2477C1.90963 41.2685 -0.665684 35.4843 1.31353 30.3283C3.29274 25.1722 9.07699 22.5969 14.233 24.5761L51.4526 38.8634C51.4937 38.8798 51.535 38.896 51.5765 38.9119L70.2481 46.0792C75.4041 48.0584 81.1883 45.4831 83.1675 40.3271C85.1468 35.1711 82.5714 29.3868 77.4154 27.4076L77.4132 27.4068C77.4139 27.4064 77.4145 27.406 77.4151 27.4056L58.7436 20.2383C53.5876 18.2591 51.0123 12.4749 52.9915 7.31885C54.9707 2.16283 60.755 -0.412485 65.911 1.56673L120.828 22.6473C120.959 22.6977 121.089 22.7506 121.217 22.8059C121.453 22.8928 121.69 22.9815 121.926 23.0721C147.706 32.9681 160.583 61.8894 150.686 87.6695C140.79 113.45 111.869 126.326 86.089 116.43C85.5927 116.24 85.1011 116.042 84.6144 115.838C84.3783 115.766 84.1431 115.686 83.9091 115.596L30.0742 94.9308C24.9182 92.9516 22.3428 87.1673 24.3221 82.0113C26.3013 76.8553 32.0855 74.2799 37.2415 76.2592L55.9106 83.4256C55.9103 83.4242 55.9099 83.4229 55.9095 83.4215L55.9133 83.423C61.0694 85.4022 66.8536 82.8269 68.8328 77.6709C70.812 72.5148 68.2367 66.7306 63.0807 64.7514L54.6786 61.5261C54.6787 61.5257 54.6788 61.5252 54.6789 61.5247L7.06565 43.2477Z" fill="currentColor"></path>
      </svg>
    </div>

    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
    }}>
      <div style={{
        display: 'block',
        margin: 'auto',
        borderRadius: '7px',
        padding: '10px',
        overflowX: 'auto'
      }}>

        <div className="header">
          <h1>{props.siteData.title}</h1>
          <p>{props.siteData.subtitle}</p>
        </div>

        <pre>
          <span className="blue">curl</span> -L -X GET <span className="green">'{baseUrl}/v1/fee-estimates'</span> -H <span class="green">'Accept: application/json'</span>
        </pre>

        <pre>
          {raw(JSON.stringify(props.estimates, null, 2))}
        </pre>

      </div>
    </div>
  </Layout>
);

/**
 * Returns the current fee estimates for the Bitcoin network, rendered as HTML.
 */
app.get('/', async (c) => {
  let estimates : Estimates | undefined;

  try {
    estimates = await getEstimates();

    // Set cache headers.
    c.res.headers.set('Cache-Control', `public, max-age=${stdTTL}`)

  } catch (error) {
    console.error(error);
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
    c.res.headers.set('Cache-Control', `public, max-age=${stdTTL}`)

    // Return the estimates.
    return c.json(estimates);

  } catch (error) {
    console.error(error);
    return c.text('Error fetching fee estimates', 500);
  }
});

export default {
  port,
  fetch: app.fetch,
}
