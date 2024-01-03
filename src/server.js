const config = require('config');
const express = require('express');
const { createServer } = require('http');
const NodeCache = require('node-cache');

// Get application configuration values from the config package
const port = config.get('server.port');
const blockstreamHostname = config.get('blockstream.hostname');
const mempoolHostname = config.get('mempool.hostname');
const mempoolDepth = config.get('mempool.depth');
const feeMultiplier = config.get('settings.feeMultiplier');
const stdTTL = config.get('cache.stdTTL');
const checkperiod = config.get('cache.checkperiod');

const TIMEOUT = 5000;

console.log('---');
console.log(`Using port: ${port}`);
console.log(`Using blockstream host: ${blockstreamHostname}`);
console.log(`Using mempool host: ${mempoolHostname}`);
console.log(`Using mempool depth: ${mempoolDepth}`);
console.log(`Using fee multiplier: ${feeMultiplier}`);
console.log(`Using cache stdTTL: ${stdTTL}`);
console.log(`Using cache checkperiod: ${checkperiod}`);
console.log('---');

const myCache = new NodeCache({ stdTTL: stdTTL, checkperiod: checkperiod });

/**
 * Fetches a URL with a specified timeout.
 *
 * @param {string} url - The URL to fetch.
 * @param {number} [timeout=5000] - The timeout for the fetch request in milliseconds.
 * @returns {Promise<Response>} - The fetch Response object.
 * @throws {Error} - Throws an error if the fetch request times out or if any other error occurs.
 */
async function fetchWithTimeout(url, timeout = TIMEOUT) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  console.debug(`Starting fetch request to ${url}`);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);

    console.debug(`Successfully fetched data from ${url}`);
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`Fetch request to ${url} timed out after ${timeout} ms`);
      throw new Error(`Request timed out after ${timeout} ms`);
    } else {
      console.error(`Error fetching data from ${url}:`, error);
      throw error;
    }
  }
}

/**
 * Fetches a URL with a specified timeout and handles the response.
 *
 * @param {string} url - The URL to fetch.
 * @returns {Promise<string|object|null>} - The response data parsed as JSON or text, or null if an error occurs.
 */
async function fetchAndHandle(url) {
  try {
    const response = await fetchWithTimeout(url, TIMEOUT);
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    } else {
      return await response.text();
    }
  } catch (error) {
    console.error(`Error fetching from ${url}:`, error);
    return null;
  }
}

// Initialize the Express app
const app = express();

// Start the server and log the URL to the console
const server = createServer(app).listen(port, function() {
  console.log(`Server started on http://localhost:${port}`);
});

// Enable JSON and URL-encoded request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add a health/ready endpoint
app.get('/health/ready', (req, res) => {
  return res.sendStatus(200);
});

// Add a health/live endpoint
app.get('/health/live', (req, res) => {
  return res.sendStatus(200);
});

/**
 * Returns the current fee estimates for the Bitcoin network.
 */
app.get('/v1/fee-estimates.json', async (req, res) => {
  try {
    // Check if the response is cached.
    let data = myCache.get('data');

    // If the response is not cached, fetch it .
    if (!data) {
      let blocksTipHash, mempoolFeeEstimates, blockstreamFeeEstimates, feeByBlockTarget = {};

      // Define the fetch tasks
      const tasks = [
        fetchAndHandle(`https://${mempoolHostname}/api/blocks/tip/hash`),
        fetchAndHandle(`https://${blockstreamHostname}/api/blocks/tip/hash`),
        fetchAndHandle(`https://${mempoolHostname}/api/v1/fees/recommended`),
        fetchAndHandle(`https://${blockstreamHostname}/api/fee-estimates`)
      ];

      const results = await Promise.allSettled(tasks);
      console.info('Fetch tasks completed');

      // Assign the results
      blocksTipHash = results[0].value || results[1].value;
      mempoolFeeEstimates = results[2].value;
      blockstreamFeeEstimates = results[3].value;

      // Get the minimum fee from mempool.space (we use their economy rate).
      const minFee = mempoolFeeEstimates?.economyFee;

      // Use mempool.space fee estimates for upcoming blocks.
      if (mempoolFeeEstimates) {
        const blockTargetMapping = {
          1: 'fastestFee',
          3: 'halfHourFee',
          6: 'hourFee'
        };
        for (let i = 1; i <= mempoolDepth; i++) {
          const feeProperty = blockTargetMapping[i];
          if (feeProperty && mempoolFeeEstimates[feeProperty]) {
            feeByBlockTarget[i] = Math.round(mempoolFeeEstimates[feeProperty] * 1000 * feeMultiplier);
          }
        }
      }

      // Calculate the minimum fee from the feeByBlockTarget object.
      const minMempoolFee = Math.min(...Object.values(feeByBlockTarget));

      // Merge Blockstream fee estimates into feeByBlockTarget.
      if (blockstreamFeeEstimates) {
        for (const [blockTarget, fee] of Object.entries(blockstreamFeeEstimates)) {
          const adjustedFee = Math.round(fee * 1000 * feeMultiplier);
          if (!feeByBlockTarget.hasOwnProperty(blockTarget) && adjustedFee < minMempoolFee) {
            feeByBlockTarget[blockTarget] = adjustedFee;
          }
        }
      }

      // Create the response object.
      data = {
        current_block_hash: blocksTipHash,
        fee_by_block_target: feeByBlockTarget
      };

      // Cache the response object.
      myCache.set('data', data);
    }

    // Set cache headers
    res.set('Cache-Control', `public, max-age=${stdTTL}`);

    // Check the Accept header and return the appropriate response
    if (req.headers.accept.includes('text/html')) {
      // Return a pretty HTML response
      res.send(`
        <head>
          <meta name="color-scheme" content="light dark">
        </head>
        <body>
          <pre>${JSON.stringify(data, null, 2)}</pre>
        </body>
      `);
    } else {
      // Return a JSON response
      res.json(data);
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching fee estimates');
  }
});

// Error handling middleware
app.use(function(err, req, res, next) {
  // Handle HTTP errors using http-errors
  if (err instanceof createError.HttpError) {
    res.status(err.statusCode).send(err.message);
  } else {
    // Log the error to the console and send a generic error response back to the client
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Handle SIGINT signal
process.on('SIGINT', () => {
  server.close(() => {
    console.log('Server has been gracefully shut down');
    process.exit(0);
  });
});