const express = require('express');
const mempoolJS = require('@mempool/mempool.js');

const app = express();
const port = 3000;

const mempool = mempoolJS({
  hostname: 'mempool.space'
});

app.get('/fee-estimates', async (req, res) => {
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

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
