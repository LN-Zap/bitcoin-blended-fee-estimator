# Lnd Mempool.Space

This project provides some basic integration between lnd and mempool.space. It currently supports a single feature - the ability to provide fee estimates to lnd based on mempool.space's fee estimates.

## Usage

Set `feeurl` to the `/fee-estimates` endpoint of this server in your lnd config. For example:

```
feeurl = http://localhost:3000/fee-estimates
```