# Lnd Mempool.Space Integration

This project aims to integrate the [Lightning Network Daemon (lnd)](https://github.com/lightningnetwork/lnd) with [mempool.space](https://mempool.space/), a Bitcoin blockchain explorer. The primary feature of this integration is to provide fee estimates to lnd based on a combination of mempool-based estimates (from the mempool.space API) and history-based estimates (from the Blockstream API).

## Fee Estimates

This application uses two APIs to get fee estimates for Bitcoin transactions:

- [**mempool.space API**](https://mempool.space/docs/api/rest): This API is used to get mempool-based fee estimates for upcoming blocks. The application fetches the fastestFee, halfHourFee, hourFee, economyFee, and minimumFee from the mempool.space API and uses these estimates to calculate the fee for upcoming blocks. The application also multiplies these estimates by a configurable multiplier to ensure that can be used to ensure that the fee estimates are always slightly higher or lower than the mempool.space estimates.

- [**Blockstream API**](https://github.com/Blockstream/esplora/blob/master/API.md): This API is used to get history-based fee estimates for further future blocks. The application fetches the fee estimates from the Blockstream API (which gets its data from bitcoind) and adds them to the fee estimates if they are lower than the lowest fee estimate from the mempool.space API.

Fee estimates are cached for a configurable amount of time (15 seconds by default) to reduce the number of API calls. The cache is automatically cleared after the configured time has elapsed.

## API

This application exposes a single API endpoint at `/v1/fee-estimates.json`. This endpoint returns a JSON object with the following structure, which is compatible with the LND's `feeurl` setting:

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
3. Set the `feeurl` in your lnd configuration to point to the `/v1/fee-estimates.json` endpoint of this server.

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
feeurl = http://localhost:3000/v1/fee-estimates.json
```

Replace http://localhost:3000 with the address of your server.

Please ensure that your server is properly configured to allow connections from the machine where lnd is running. You may need to adjust your firewall settings or other security configurations to allow this.

In addition, you may need to adjust the settings of your mempool.space instance to allow API requests from this integration. Please refer to the mempool.space documentation for more information on this.

> **Note:** By default, this integration connects to the public API of mempool.space. However, for better performance and reliability, it is recommended to run your own instance of mempool.space and configure this integration to connect to it.

## Configuration Options

This project uses the [`config`](https://www.npmjs.com/package/config) package for configuration. The configuration options are stored in `default.json` and `custom-environment-variables.json` in the `config` directory.

Here are the available configuration options:

- `server.port`: The port on which the server runs. Default is `3000`.
- `mempool.hostname`: The hostname of the mempool.space instance to connect to. Default is `mempool.space`.
- `mempool.feeMultiplier`: The multiplier to apply to the mempool.space fee estimates. Default is `1.05`. (This is used to ensure that the fee estimates are always slightly higher than the mempool.space estimates.)
- `cache.stdTTL`: The standard time to live in seconds for every generated cache element. Default is `15`.
- `cache.checkperiod`: The period in seconds, used for the automatic delete check interval. Default is `20`.

You can override these options by setting the corresponding environment variables:

- `PORT`: Overrides `server.port`.
- `MEMPOOL_HOSTNAME`: Overrides `mempool.hostname`.
- `MEMPOOL_FEE_MULTIPLIER`: Overrides `mempool.feeMultiplier`.
- `CACHE_STDTTL`: Overrides `cache.stdTTL`.
- `CACHE_CHECKPERIOD`: Overrides `cache.checkperiod`.

For example, to run the server on port 4000 and connect to a local mempool.space instance, you can start the server like this:

```bash
PORT=4000 MEMPOOL_HOSTNAME=localhost npm start
```

## Docker

This project includes Docker support and an official Docker image is available. You can run the Docker image with the following command:

```bash
docker run -p 3000:3000 lnzap/lnd-mempoolspace:latest
```

This command will pull the latest `lnzap/lnd-mempoolspace` image from Docker Hub and run it. By default, the Docker image runs the server on port 3000.

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

## Releasing

Releasing a new version of this project involves cutting a new release on GitHub. 

When a new release is created on GitHub, it triggers a Docker build and push to Docker Hub. This is done through GitHub Actions, which is configured to automatically build a new Docker image and push it to Docker Hub whenever a new release is created.

Here are the steps to create a new release:

1. Merge your changes into the `master` branch.
2. Click on "Releases" in the right sidebar of the GitHub repository page.
3. Click on "Draft a new release".
4. Enter a tag version (e.g., `v1.0.1`), release title, and description.
5. Click on "Publish release".

Once the release is published, the Docker build and push process will start automatically. You can monitor the progress of the build on the "Actions" tab of the GitHub repository page.

Please note that you need to have the necessary permissions to create a release and push to Docker Hub.

## Contributing
We welcome contributions to this project. Please feel free to open an [issue](https://github.com/LN-Zap/lnd-mempoolspace/issues) or submit a [pull request](https://github.com/LN-Zap/lnd-mempoolspace/pulls).

## License
This project is licensed under the MIT License. See the [LICENSE](./LICENSE.md) file for more details.
