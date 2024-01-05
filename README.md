# Bitcoin Blended Fee Estimator

This project provides bitcoin fee estimates using a blend of mempool-based and history-based estimations. The initial use case is to provide onchain fee estimates to [lnd](https://github.com/lightningnetwork/lnd), however it could easily be adapted/extended to be used by other applications.

## Fee Estimates

This application uses two APIs to get fee estimates for Bitcoin transactions:

- [**mempool.space API**](https://mempool.space/docs/api/rest): This API is used to get mempool-based fee estimates for upcoming blocks. The application fetches the fastestFee, halfHourFee, hourFee, economyFee, and minimumFee from the mempool.space API and uses these estimates to calculate the fee for upcoming blocks.

- [**Blockstream API**](https://github.com/Blockstream/esplora/blob/master/API.md): This API is used to get history-based fee estimates for further future blocks. The application fetches the fee estimates from the Blockstream API (which gets its data from bitcoind) and adds them to the fee estimates if they are lower than the lowest fee estimate from the mempool.space API.

Fee estimates are multipled by a configurable multiplier (1.05 by default) to provide estimates are always slightly higher or lower than the raw estimates (allows a more conservative or aggressive approach), and cached for a configurable amount of time (15 seconds by default).

## API

This application exposes a single API endpoint at `/v1/fee-estimates`. This endpoint returns a JSON object with the following structure, which is compatible with the lnd's `feeurl` setting:

```json
{
    "current_block_hash": "0000000000000000000044ab897830778c73d33fdeddde1f21e875fae2150378",
    "fee_by_block_target": {
        "1": 81900,
        "2": 78750,
        "3": 74550,
        "144": 64951,
        "504": 53464,
        "1008": 28175
    }
}
```

## Setup & Usage

1. Clone this repository to your local machine.
2. Install the necessary dependencies (`npm install`)
3. Set the `feeurl` in your lnd configuration to point to the `/v1/fee-estimates` endpoint of this server.

For example:

```ini
[Application Options]

; Optional URL for external fee estimation. If no URL is specified, the method
; for fee estimation will depend on the chosen backend and network. Must be set
; for neutrino on mainnet.
; Default:
;   feeurl=
; Example:
;   feeurl=https://nodes.lightning.computer/fees/v1/btc-fee-estimates.json
feeurl = http://localhost:3000/v1/fee-estimates
```

Replace http://localhost:3000 with the address of your server.

Please ensure that your server is properly configured to allow connections from the machine where lnd is running. You may need to adjust your firewall settings or other security configurations to allow this.

In addition, you may need to adjust the settings of your mempool.space instance to allow API requests from this integration. Please refer to the mempool.space documentation for more information on this.

> **Note:** By default, this integration connects to the public API of mempool.space. However, for better performance and reliability, it is recommended to run your own instance of mempool.space and configure this integration to connect to it.

## Configuration Options

This project uses the [`config`](https://www.npmjs.com/package/config) package for configuration. The configuration options are stored in `default.json` and `custom-environment-variables.json` in the `config` directory.

Here are the available configuration options:

- `server.port`: The port on which the server runs. Default is `3000`.
- `blockstream.hostname`: The hostname of the Blockstream API instance to connect to. Default is `blockstream.api`.
- `mempool.hostname`: The hostname of the mempool.space instance to connect to. Default is `mempool.space`.
- `mempool.depth`: The number of blocks to use for mempool-based fee estimates. Default is `6`. Valid options are `1`, `3`, and `6`.
- `settings.feeMultiplier`: The multiplier to apply to the fee estimates. Default is `1` (a conservative approach to ensure that the fee estimates are always slightly higher than the raw estimates).
- `cache.stdTTL`: The standard time to live in seconds for every generated cache element. Default is `15`.
- `cache.checkperiod`: The period in seconds, used for the automatic delete check interval. Default is `20`.

You can override these options by setting the corresponding environment variables:

- `PORT`: Overrides `server.port`.
- `BLOCKSTREAM_HOSTNAME`: Overrides `blockstream.hostname`.
- `MEMPOOL_HOSTNAME`: Overrides `mempool.hostname`.
- `MEMPOOL_DEPTH`: Overrides `mempool.depth`.
- `FEE_MULTIPLIER`: Overrides `settings.feeMultiplier`.
- `CACHE_STDTTL`: Overrides `cache.stdTTL`.
- `CACHE_CHECKPERIOD`: Overrides `cache.checkperiod`.

For example, to run the server on port 4000 and connect to a local mempool.space instance, you can start the server like this:

```bash
PORT=4000 MEMPOOL_HOSTNAME=localhost npm start
```

## Docker

This project includes Docker support and an official Docker image is available. You can run the Docker image with the following command:

```bash
docker run -p 3000:3000 lnzap/bitcoin-blended-fee-estimator:latest
```

This command will pull the latest `lnzap/bitcoin-blended-fee-estimator` image from Docker Hub and run it. By default, the Docker image runs the server on port 3000.

Please ensure that Docker is installed and running on your machine before running these commands.

### Docker Development

You can build a Docker image from the source and run it with the following scripts:

- `docker:build`: Builds a Docker image of the project. You can run this script with `npm run docker:build`.
- `docker:run`: Runs the Docker image. You can run this script with `npm run docker:run`.

For example, to build and run the Docker image, you can use the following commands:

```bash
npm run docker:build
npm run docker:run
```

## Contributing
We welcome contributions to this project. Please feel free to open an [issue](https://github.com/LN-Zap/bitcoin-blended-fee-estimator/issues) or submit a [pull request](https://github.com/LN-Zap/bitcoin-blended-fee-estimator/pulls).

## License
This project is licensed under the MIT License. See the [LICENSE](./LICENSE.md) file for more details.
