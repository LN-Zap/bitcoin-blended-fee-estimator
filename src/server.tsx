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
console.info(`Using Esplora host: ${esploraBaseUrl}`);
console.info(`Using Mempool base URL: ${mempoolBaseUrl}`);
console.info(`Using Mempool estimation depth: ${mempoolDepth}`);
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
  console.debug(`Starting fetch request to ${url}`);
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
    fetchAndHandle(`${mempoolBaseUrl}/api/blocks/tip/hash`),
    fetchAndHandle(`${esploraBaseUrl}/api/blocks/tip/hash`),
    fetchAndHandle(`${mempoolBaseUrl}/api/v1/fees/recommended`),
    fetchAndHandle(`${esploraBaseUrl}/api/fee-estimates`)
  ];

  return await Promise.allSettled(tasks);
}

/**
 * Assigns the results of the fetch tasks to variables.
 */
function assignResults(results: PromiseSettledResult<any>[]) {
  let blocksTipHash, mempoolFeeEstimates, esploraFeeEstimates;

  if (results[0].status === "fulfilled" && results[0].value) {
    blocksTipHash = results[0].value;
  } else if (results[1].status === "fulfilled" && results[1].value) {
    blocksTipHash = results[1].value;
  }

  if (results[2].status === "fulfilled" && results[2].value) {
    mempoolFeeEstimates = results[2].value as MempoolFeeEstimates;
  }

  if (results[3].status === "fulfilled" && results[3].value) {
    esploraFeeEstimates = results[3].value as EsploraFeeEstimates;
  }

  return { blocksTipHash, mempoolFeeEstimates, esploraFeeEstimates: esploraFeeEstimates };
}

/**
 * Calculates the fee estimates for the Bitcoin network.
 */
function calculateFees(mempoolFeeEstimates: MempoolFeeEstimates | null | undefined, esploraFeeEstimates: EsploraFeeEstimates | null | undefined) {
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

  if (esploraFeeEstimates) {
    for (const [blockTarget, fee] of Object.entries(esploraFeeEstimates)) {
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

const Content = (props: { siteData: SiteData; data: object }) => (
  <Layout {...props.siteData}>

    <div style="display: flex; justify-content: center; margin-top: 26px;">
      <svg width="20" height="20" viewBox="0 0 155 120" fill="none" xmlns="http://www.w3.org/2000/svg" data-theme="dark" focusable="false">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M7.06565 43.2477C1.90963 41.2685 -0.665684 35.4843 1.31353 30.3283C3.29274 25.1722 9.07699 22.5969 14.233 24.5761L51.4526 38.8634C51.4937 38.8798 51.535 38.896 51.5765 38.9119L70.2481 46.0792C75.4041 48.0584 81.1883 45.4831 83.1675 40.3271C85.1468 35.1711 82.5714 29.3868 77.4154 27.4076L77.4132 27.4068C77.4139 27.4064 77.4145 27.406 77.4151 27.4056L58.7436 20.2383C53.5876 18.2591 51.0123 12.4749 52.9915 7.31885C54.9707 2.16283 60.755 -0.412485 65.911 1.56673L120.828 22.6473C120.959 22.6977 121.089 22.7506 121.217 22.8059C121.453 22.8928 121.69 22.9815 121.926 23.0721C147.706 32.9681 160.583 61.8894 150.686 87.6695C140.79 113.45 111.869 126.326 86.089 116.43C85.5927 116.24 85.1011 116.042 84.6144 115.838C84.3783 115.766 84.1431 115.686 83.9091 115.596L30.0742 94.9308C24.9182 92.9516 22.3428 87.1673 24.3221 82.0113C26.3013 76.8553 32.0855 74.2799 37.2415 76.2592L55.9106 83.4256C55.9103 83.4242 55.9099 83.4229 55.9095 83.4215L55.9133 83.423C61.0694 85.4022 66.8536 82.8269 68.8328 77.6709C70.812 72.5148 68.2367 66.7306 63.0807 64.7514L54.6786 61.5261C54.6787 61.5257 54.6788 61.5252 54.6789 61.5247L7.06565 43.2477Z" fill="currentColor"></path>
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

        <div class="header">
          <h1>{props.siteData.title}</h1>
          <p>{props.siteData.subtitle}</p>
        </div>

        <pre>
          <span class="blue">curl</span> -L -X GET <span class="green">'{baseUrl}/v1/fee-estimates'</span> -H <span class="green">'Accept: application/json'</span>
        </pre>

        <pre>
          {raw(JSON.stringify(props.data, null, 2))}
        </pre>

      </div>
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

      const { blocksTipHash, mempoolFeeEstimates, esploraFeeEstimates: esploraFeeEstimates } = assignResults(results);
      const feeByBlockTarget = calculateFees(mempoolFeeEstimates, esploraFeeEstimates);

      data = {
        current_block_hash: blocksTipHash,
        fee_by_block_target: feeByBlockTarget
      };

      cache.set('data', data);
    }

    console.debug('Returning data', data);

    // Set cache headers.
    c.res.headers.set('Cache-Control', `public, max-age=${stdTTL}`)

    // Return html if the request accepts it.
    if (c.req.raw.headers.get('Accept')?.includes('text/html')) {
      const props = {
        siteData: {
          title: 'Bitcoin Blended Fee Estimator',
          subtitle: 'A blend of mempool-based and history-based Bitcoin fee estimates.',
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
