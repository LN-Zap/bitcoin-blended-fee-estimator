# Bitcoin Blended Fee Estimator

This project provides bitcoin fee estimates using a blend of mempool-based and history-based estimations. The initial use case is to provide onchain fee estimates to [lnd](https://github.com/lightningnetwork/lnd), however it could easily be adapted/extended to be used by other applications.

## Fee Estimates

This application uses two APIs to get fee estimates for Bitcoin transactions:

- [**Mempool API**](https://github.com/mempool/mempool): This API is used to get mempool-based fee estimates for upcoming blocks. The application fetches the fastestFee, halfHourFee, hourFee, economyFee, and minimumFee from the Mempool API and uses these estimates to calculate the fee for upcoming blocks.

- [**Esplora API**](https://github.com/Blockstream/esplora/blob/master/API.md): This API is used to get history-based fee estimates for further future blocks. The application fetches fee estimates from the Esplora API (which gets its data from bitcoind) and adds them to the fee estimates if they are lower than the lowest fee estimate from the Mempool API.

Fee estimates are multipled by a configurable multiplier (1 by default) to allow a more conservative or aggressive approach, and cached for a configurable amount of time (15 seconds by default).

## API

This application exposes a single API endpoint at `/v1/fee-estimates`. This endpoint returns a JSON object with the following structure, which is compatible with lnd's `feeurl` setting:

```json
{
    "current_block_hash": "0000000000000000000044ab897830778c73d33fdeddde1f21e875fae2150378",
    "fee_by_block_target": {
        "1": 81900,
        "2": 78750,
        "3": 74550,
        "6": 68700,
        "144": 64951,
        "504": 53464,
        "1008": 28175
    }
}
```

## Setup & Usage

1. Clone this repository to your local machine.
2. Install the necessary dependencies (`bun install`)
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

In addition, you may need to adjust the settings of your Mempool or Esplora instance to allow API requests from this integration. Please refer to the respective documentation for more information on this.

> **Note:** By default, this integration connects to the public API of [mempool.space](https://mempool.space) and [blokstream.info](https://blockstream.info). However, for better performance and reliability, it is recommended to run your own instances of Mempool and Esplora and configure this integration to connect to those.

## Configuration Options

This project uses the [`config`](https://www.npmjs.com/package/config) package for configuration. The default configuration options are stored in [`config/default.json`](./config/default.json) and [`config/custom-environment-variables.json`](./config/custom-environment-variables.json). You can override these options by creating a `config/local.json` file or environment specific configuration files.

Here are the available configuration options:

### Application settings

| Config Key | Description | Default Value | Environment Variable |
| --- | --- | --- | --- |
| `server.port` | The port on which the server runs | `3000` | `PORT` |
| `server.baseUrl` | The base url port on which the server is accessible | `http://localhost:3000` | `BASE_URL` |
| `settings.logLevel` | The log level to use for the application | `debug` | `LOGLEVEL` |
| `settings.timeout` | Timeout to use when fetching data (ms) | `5000` | `TIMEOUT` |
| `settings.feeMultiplier` | The multiplier to apply to the fee estimates | `1` | `FEE_MULTIPLIER` |
| `settings.feeMinimum` | The minimum fee (sat/vB) to use for fee estimates if we could not determine from a configured data source | `2` | `FEE_MINIMUM` |
| `cache.stdTTL` | The standard time to live in seconds for every generated cache element | `15` | `CACHE_STDTTL` |
| `cache.checkperiod` | The period in seconds, used for the automatic delete check interval | `20` | `CACHE_CHECKPERIOD` |

### Mempool settings

| Config Key | Description | Default Value | Environment Variable |
| --- | --- | --- | --- |
| `mempool.baseUrl` | The base URL of the Mempool instance to connect to | `https://mempool.space` | `MEMPOOL_BASE_URL` |
| `mempool.fallbacekBaseUrl` | The base URL of the Mempool instance to fallback to if the primary instance is unavailable | - | `MEMPOOL_FALLBACK_BASE_URL` |
| `mempool.depth` | The number of blocks to use for mempool-based fee estimates | `6` | `MEMPOOL_DEPTH` |

### Esplora settings

| Config Key | Description | Default Value | Environment Variable |
| --- | --- | --- | --- |
| `esplora.baseUrl` | The base URL of the Esplora API instance to connect to. Set to `null` to disable. | `https://blockstream.info` | `ESPLORA_BASE_URL` |
| `esplora.fallbacekBaseUrl` | The base URL of the Esplora API instance to fallback to if the primary instance is unavailable | - | `ESPLORA_FALLBACK_BASE_URL` |

### Bitcoind settings

| Config Key | Description | Default Value | Environment Variable |
| --- | --- | --- | --- |
| `bitcoind.baseUrl` | The base URL of the bitcoind instance to connect to. Set to `null` to disable. | `http://localhost:8332` | `BITCOIND_BASE_URL` |
| `bitcoind.username` | The username to use for authenticating with the bitcoind instance | - | `BITCOIND_USERNAME` |
| `bitcoind.password` | The password to use for authenticating with the bitcoind instance | - | `BITCOIND_PASSWORD` |
| `bitcoind.confTargets` | The block targets to use for history-based fee estimates | `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 144, 504, 1008]` | `BITCOIND_CONF_TARGETS` |
| `bitcoind.estimateMode` | The estimate mode to use for fee estimates (`ECONOMICAL` or `CONSERVATIVE`) | `ECONOMICAL` | `BITCOIND_ESTIMATE_MODE` |

## Development

This project is a lightweight and performant javascript app, built using [Bun](https://bun.sh/) and [Hono](https://hono.dev/).

### Prerequisites

- [Bun](https://bun.sh/)

### Running the Server

```sh
bun run dev
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

- `docker:build`: Builds a Docker image of the project. You can run this script with `bun run docker:build`.
- `docker:run`: Runs the Docker image. You can run this script with `bun run docker:run`.

For example, to build and run the Docker image, you can use the following commands:

```bash
bun run docker:build
bun run docker:run
```

## Contributing
We welcome contributions to this project. Please feel free to open an [issue](https://github.com/LN-Zap/bitcoin-blended-fee-estimator/issues) or submit a [pull request](https://github.com/LN-Zap/bitcoin-blended-fee-estimator/pulls).

## License
This project is licensed under the MIT License. See the [LICENSE](./LICENSE.md) file for more details.
