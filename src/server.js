const config = require('config');
const express = require('express');
const { createServer } = require('http');
const mempoolJS = require('@mempool/mempool.js');

// Get application configuration values from the config package
const port = config.get('server.port');
const mempoolHostname = config.get('mempool.hostname');

console.log('---');
console.log(`Using port: ${port}`);
console.log(`Using mempool host: ${mempoolHostname}`);
console.log('---');

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
    // Fetch the current block hash
    const { bitcoin: { blocks } } = mempool;
    const blocksTipHash = await blocks.getBlocksTipHash();
    
    // Fetch fee estimates
    const { bitcoin: { fees } } = mempool;
    const feeEstimates = await fees.getFeesMempoolBlocks();

    // Transform the fee estimates to match the desired format
    let feeByBlockTarget = {};
    feeEstimates.forEach((estimate, index) => {
      feeByBlockTarget[index + 1] = Math.round(estimate.medianFee * 1000 * 1.05)
    });

    res.json({
      current_block_hash: blocksTipHash,
      fee_by_block_target: feeByBlockTarget
    });
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