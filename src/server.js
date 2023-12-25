const config = require('config');
const express = require('express');
const { createServer } = require('http');
const NodeCache = require('node-cache');

// Get application configuration values from the config package
const port = config.get('server.port');
const mempoolHostname = config.get('mempool.hostname');
const blockstreamHostname = config.get('blockstream.hostname');
const feeMultiplier = config.get('mempool.feeMultiplier');
const stdTTL = config.get('cache.stdTTL');
const checkperiod = config.get('cache.checkperiod');

console.log('---');
console.log(`Using port: ${port}`);
console.log(`Using mempool host: ${mempoolHostname}`);
console.log(`Using blockstream host: ${blockstreamHostname}`);
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

      // Fetch the current block hash.
      try {
        const response = await fetch(`https://${mempoolHostname}/api/blocks/tip/hash`);
        blocksTipHash = await response.text();
      } catch (error) {
        console.error(`Error fetching block tip hash from ${mempoolHostname}:`, error);

        try {
          const response = await fetch(`https://${blockstreamHostname}/api/blocks/tip/hash`);
          blocksTipHash = await response.text();
        } catch (error) {
          console.error(`Error fetching block tip hash from ${blockstreamHostname}:`, error);
        }
      }

      // Fetch fee estimates from mempool.space API.
      try {
        const response = await fetch(`https://${mempoolHostname}/api/v1/fees/recommended`);
        mempoolFeeEstimates = await response.json();
      } catch (error) {
        console.error(`Error fetching fee estimates from ${mempoolHostname}:`, error);
      }

      // Fetch fee estimates from Blockstream API.
      try {
        const response = await fetch(`https://${blockstreamHostname}/api/fee-estimates`);
        blockstreamFeeEstimates = await response.json();
      } catch (error) {
        console.error(`Error fetching fee estimates from ${blockstreamHostname}:`, error);
      }

      // Get the minimum fee from mempool.space (we use their economy rate).
      const minFee = mempoolFeeEstimates?.economyFee;

      // Use mempool.space fee estimates for upcoming blocks.
      if (mempoolFeeEstimates) {
        feeByBlockTarget = {
          1: Math.round(mempoolFeeEstimates.fastestFee * 1000 * feeMultiplier),
          2: Math.round(mempoolFeeEstimates.halfHourFee * 1000 * feeMultiplier), // usually between first and second block
          3: Math.round(mempoolFeeEstimates.hourFee * 1000 * feeMultiplier), // usually between second and third block
        };
      }

      // Calculate the minimum fee from the feeByBlockTarget object.
      const minMempoolFee = Math.min(...Object.values(feeByBlockTarget));

      // Merge Blockstream fee estimates into feeByBlockTarget.
      if (blockstreamFeeEstimates) {
        for (const [blockTarget, fee] of Object.entries(blockstreamFeeEstimates)) {
          const adjustedFee = Math.round(fee * 1000);
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