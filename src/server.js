const config = require('config');
const express = require('express');
const { createServer } = require('http');
const mempoolJS = require('@mempool/mempool.js');
const NodeCache = require('node-cache');

// Get application configuration values from the config package
const port = config.get('server.port');
const mempoolHostname = config.get('mempool.hostname');
const feeMultiplier = config.get('mempool.feeMultiplier');
const stdTTL = config.get('cache.stdTTL');
const checkperiod = config.get('cache.checkperiod');

console.log('---');
console.log(`Using port: ${port}`);
console.log(`Using mempool host: ${mempoolHostname}`);
console.log(`Using mempool fee multiplier: ${feeMultiplier}`);
console.log(`Using cache stdTTL: ${stdTTL}`);
console.log(`Using cache checkperiod: ${checkperiod}`);
console.log('---');

const myCache = new NodeCache({ stdTTL: stdTTL, checkperiod: checkperiod });

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

const mempool = mempoolJS({
  hostname: mempoolHostname
});

/**
 * Returns the current fee estimates for the Bitcoin network.
 */
app.get('/v1/fee-estimates.json', async (req, res) => {
  try {
    // Check if the response is cached.
    let data = myCache.get('data');

    // If the response is not cached, fetch it from the mempool.space API.
    if (!data) {
      // Fetch the current block hash.
      const { bitcoin: { blocks } } = mempool;
      const blocksTipHash = await blocks.getBlocksTipHash();

      // Fetch fee estimates.
      const { bitcoin: { fees } } = mempool;
      const feeEstimates = await fees.getFeesRecommended();
      const mempoolBlocks = await fees.getFeesMempoolBlocks();

      const minFee = feeEstimates.minimumFee * feeMultiplier;

      // Transform the fee estimates to match the desired format.
      const feeByBlockTarget = {
        1: Math.round(feeEstimates.fastestFee * 1000 * feeMultiplier),
        2: Math.round(feeEstimates.halfHourFee * 1000 * feeMultiplier), // usually between first and second block
        3: Math.round(feeEstimates.hourFee * 1000 * feeMultiplier), // usually between second and third block
        36: Math.max(Math.round(mempoolBlocks[2].medianFee * 1000 * feeMultiplier), minFee), // 6 hours to get 3 blocks deep
        72: Math.max(Math.round(mempoolBlocks[4].medianFee * 1000 * feeMultiplier), minFee), // 12 hours to get 5 blocks deep
        144: Math.max(Math.round(mempoolBlocks[6].medianFee * 1000 * feeMultiplier), minFee), // 24 hours to get 7 blocks deep
        720: Math.round(feeEstimates.economyFee * 1000 * feeMultiplier), // 5 days to get to 2x above economy
        1008: Math.round(feeEstimates.minimumFee * 1000 * feeMultiplier) // 7 days to get to the minimum fee
      };

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

    // Send the response.
    res.json(data);
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