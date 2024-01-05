import { Hono } from 'hono'
import { raw } from 'hono/html'
import { logger } from 'hono/logger'
import { etag } from 'hono/etag'
import { cors } from 'hono/cors'
import config from 'config'
import NodeCache from 'node-cache';

type MempoolFeeEstimates = {
  [key: string]: number | undefined;
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
};

type BlockstreamFeeEstimates = {
  [key: number]: number;
};

type FeeByBlockTarget = {
  [key: string]: number;
};

type Data = {
  current_block_hash: string | null;
  fee_by_block_target: FeeByBlockTarget;
};

type BlockTargetMapping = {
  [key: number]: string;
};

// Get application configuration values from the config package.
const port = config.get<number>('server.port');
const blockstreamHostname = config.get<string>('blockstream.hostname');
const mempoolHostname = config.get<string>('mempool.hostname');
const mempoolDepth = config.get<number>('mempool.depth');
const feeMultiplier = config.get<number>('settings.feeMultiplier');
const stdTTL = config.get<number>('cache.stdTTL');
const checkperiod = config.get<number>('cache.checkperiod');

// Set the timeout for fetch requests.
const TIMEOUT: number = 3000;

// Log the configuration values.
console.info('---');
console.info(`Using port: ${port}`);
console.info(`Using blockstream host: ${blockstreamHostname}`);
console.info(`Using mempool host: ${mempoolHostname}`);
console.info(`Using mempool depth: ${mempoolDepth}`);
console.info(`Using fee multiplier: ${feeMultiplier}`);
console.info(`Using cache stdTTL: ${stdTTL}`);
console.info(`Using cache checkperiod: ${checkperiod}`);
console.info('---');

// Initialize the cache.
const cache = new NodeCache({ stdTTL: stdTTL, checkperiod: checkperiod });

/**
 * Fetches data from the given URL with a timeout.
 */
// async function fetchWithTimeout(url: string, timeout: number = TIMEOUT): Promise<Response> {
//   const controller = new AbortController();
//   const id = setTimeout(() => controller.abort(), timeout);

//   console.debug(`Starting fetch request to ${url}`);

//   try {
//     const response = await fetch(url, { signal: controller.signal });
//     clearTimeout(id);

//     console.debug(`Successfully fetched data from ${url}`);
//     return response;
//   } catch (error: any) {
//     if (error.name === 'AbortError') {
//       console.error(`Fetch request to ${url} timed out after ${timeout} ms`);
//       throw new Error(`Request timed out after ${timeout} ms`);
//     } else {
//       console.error(`Error fetching data from ${url}:`, error);
//       throw error;
//     }
//   }
// }

// FIXME: fetch signal abortcontroller does not work on Bun. See https://github.com/oven-sh/bun/issues/2489
async function fetchWithTimeout(url: string, timeout: number = TIMEOUT): Promise<Response> {
  const fetchPromise = fetch(url);
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`Request timed out after ${timeout} ms`)), timeout)
  );

  return Promise.race([fetchPromise, timeoutPromise]);
}

/**
 * Fetches data from the given URL and returns the response as a string or object.
 */
async function fetchAndHandle(url: string): Promise<string | object | null> {
  try {
    const response = await fetchWithTimeout(url, TIMEOUT);
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
console.info(`Fee Estimates available at http://localhost:${port}/v1/fee-estimates`);

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

/**
 * Fetches the data from the mempool and blockstream APIs.
 */
async function fetchData() {
  const tasks = [
    fetchAndHandle(`https://${mempoolHostname}/api/blocks/tip/hash`),
    fetchAndHandle(`https://${blockstreamHostname}/api/blocks/tip/hash`),
    fetchAndHandle(`https://${mempoolHostname}/api/v1/fees/recommended`),
    fetchAndHandle(`https://${blockstreamHostname}/api/fee-estimates`)
  ];

  return await Promise.allSettled(tasks);
}

/**
 * Assigns the results of the fetch tasks to variables.
 */
function assignResults(results: PromiseSettledResult<any>[]) {
  let blocksTipHash, mempoolFeeEstimates, blockstreamFeeEstimates;

  if (results[0].status === "fulfilled" && results[0].value) {
    blocksTipHash = results[0].value;
  } else if (results[1].status === "fulfilled" && results[1].value) {
    blocksTipHash = results[1].value;
  }

  if (results[2].status === "fulfilled" && results[2].value) {
    mempoolFeeEstimates = results[2].value as MempoolFeeEstimates;
  }

  if (results[3].status === "fulfilled" && results[3].value) {
    blockstreamFeeEstimates = results[3].value as BlockstreamFeeEstimates;
  }

  return { blocksTipHash, mempoolFeeEstimates, blockstreamFeeEstimates };
}

/**
 * Calculates the fee estimates for the Bitcoin network.
 */
function calculateFees(mempoolFeeEstimates: MempoolFeeEstimates | null | undefined, blockstreamFeeEstimates: BlockstreamFeeEstimates | null | undefined) {
  let feeByBlockTarget: FeeByBlockTarget = {};
  const minFee = mempoolFeeEstimates?.economyFee;

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

  const values = Object.values(feeByBlockTarget);
  const minMempoolFee = values.length > 0 ? Math.min(...values) : undefined;

  if (blockstreamFeeEstimates) {
    for (const [blockTarget, fee] of Object.entries(blockstreamFeeEstimates)) {
      if (!feeByBlockTarget.hasOwnProperty(blockTarget)) {
        const adjustedFee = Math.round(fee * 1000 * feeMultiplier);
        if ((!minMempoolFee || adjustedFee < minMempoolFee) && (!minFee || adjustedFee > minFee)) {
          feeByBlockTarget[blockTarget] = adjustedFee;
        }
      }
    }
  }

  return feeByBlockTarget;
}

// Define the layout components.

interface SiteData {
  title: string
  children?: any
}

const Layout = (props: SiteData) => {
  return (
    <html>
      <head>
        <title>{props.title}</title>
        <meta name="color-scheme" content="light dark"/>
      </head>
      <body style={{
        padding: 0,
        margin: 0,
        backgroundColor: '#000000',
      }}>{props.children}</body>
    </html>
  )
}

const Content = (props: { siteData: SiteData; data: object }) => (
  <Layout {...props.siteData}>
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
    }}>
      <pre style={{
        display: 'block',
        margin: 'auto',
        maxWidth: '80%',
        borderRadius: '10px',
        padding: '20px',
        backgroundColor: '#1A1A1A',
        overflowX: 'auto'
      }}>
        <h1>{props.siteData.title}</h1>
        {raw(JSON.stringify(props.data, null, 2))}
      </pre>
    </div>
  </Layout>
);

/**
 * Returns the current fee estimates for the Bitcoin network.
 */
app.get('/v1/fee-estimates', async (c) => {
  try {
    let data: Data | undefined = cache.get('data');

    if (!data) {
      const results = await fetchData();
      console.debug('Fetch tasks completed', results);

      const { blocksTipHash, mempoolFeeEstimates, blockstreamFeeEstimates } = assignResults(results);

      const feeByBlockTarget = calculateFees(mempoolFeeEstimates, blockstreamFeeEstimates);

      data = {
        current_block_hash: blocksTipHash,
        fee_by_block_target: feeByBlockTarget
      };

      cache.set('data', data);
    }

    // Set cache headers.
    c.res.headers.set('Cache-Control', `public, max-age=${stdTTL}`)

    // Return html if the request accepts it.
    if (c.req.raw.headers.get('Accept')?.includes('text/html')) {
      const props = {
        siteData: {
          title: 'Bitcoin Blended Fee Estimator',
        },
        data,
      }
      return c.html(<Content {...props} />)
    }

    // Otherwise return json.
    return c.json(data);

  } catch (error) {
    console.error(error);
    return c.text('Error fetching fee estimates', 500);
  }
});

export default {
  port,
  fetch: app.fetch,
}
