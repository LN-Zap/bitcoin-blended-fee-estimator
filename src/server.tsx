import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import { etag } from "hono/etag";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import config from "config";

import { logger } from "./lib/logger";
import { DataProviderManager } from "./lib/DataProviderManager";
import { MempoolProvider } from "./providers/mempool";
import { EsploraProvider } from "./providers/esplora";
import { BitcoindProvider } from "./providers/bitcoind";
import { Content } from "./components";

// Get application configuration values.
const PORT = config.get<number>("server.port");
const BASE_URL = config.get<string>("server.baseUrl");

const ESPLORA_BASE_URL = config.get<string>("esplora.baseUrl");
const ESPLORA_FALLBACK_BASE_URL = config.get<string>("esplora.fallbackBaseUrl");

const MEMPOOL_BASE_URL = config.get<string>("mempool.baseUrl");
const MEMPOOL_FALLBACK_BASE_URL = config.get<string>("mempool.fallbackBaseUrl");
const MEMPOOL_DEPTH = config.get<number>("mempool.depth");

const BITCOIND_BASE_URL = config.get<string>("bitcoind.baseUrl");
const BITCOIND_USERNAME = config.get<string>("bitcoind.username");
const BITCOIND_PASSWORD = config.get<string>("bitcoind.password");
const BITCOIND_CONF_TARGETS = config.get<number[]>("bitcoind.confTargets");
const BITCOIND_ESTIMATE_MODE = config.get<EstimateMode>(
  "bitcoind.estimateMode",
);

const LOGLEVEL = config.get<string>("settings.loglevel");
const TIMEOUT = config.get<number>("settings.timeout");
const FEE_MULTIPLIER = config.get<number>("settings.feeMultiplier");
const FEE_MINIMUM = config.get<number>("settings.feeMinimum");
const MAX_HEIGHT_DELTA = config.get<number>("settings.maxHeightDelta");
const CACHE_STD_TTL = config.get<number>("cache.stdTTL");
const CACHE_CHECKPERIOD = config.get<number>("cache.checkperiod");

const log = logger(LOGLEVEL, "server");

const middlewareLogger = (message: string, ...rest: string[]) => {
  log.info({ message, ...rest });
};

// Log the configuration values.
log.info(config.util.toObject());

// Register data provider service.
const service = new DataProviderManager(
  {
    stdTTL: CACHE_STD_TTL,
    checkperiod: CACHE_CHECKPERIOD,
  },
  MAX_HEIGHT_DELTA,
  FEE_MULTIPLIER,
  FEE_MINIMUM,
);

// Register data providers.
MEMPOOL_BASE_URL &&
  service.registerProvider(
    new MempoolProvider(MEMPOOL_BASE_URL, MEMPOOL_DEPTH, TIMEOUT),
  );

MEMPOOL_FALLBACK_BASE_URL &&
  service.registerProvider(
    new MempoolProvider(MEMPOOL_FALLBACK_BASE_URL, MEMPOOL_DEPTH, TIMEOUT),
  );

BITCOIND_BASE_URL &&
  service.registerProvider(
    new BitcoindProvider(
      BITCOIND_BASE_URL,
      BITCOIND_USERNAME,
      BITCOIND_PASSWORD,
      BITCOIND_CONF_TARGETS,
      BITCOIND_ESTIMATE_MODE,
    ),
  );

ESPLORA_BASE_URL &&
  service.registerProvider(
    new EsploraProvider(ESPLORA_BASE_URL, 1008, TIMEOUT),
  );

ESPLORA_FALLBACK_BASE_URL &&
  service.registerProvider(
    new EsploraProvider(ESPLORA_FALLBACK_BASE_URL, 1008, TIMEOUT),
  );

// Define the app.

// Initialize the Express app.
const app = new Hono();
log.info({
  message: `Fee Estimates available at ${BASE_URL}/v1/fee-estimates`,
});
log.info({ message: `Website available at ${BASE_URL}` });

// Add a health/ready endpoint.
app.get("/health/ready", async (c) => {
  return c.text("OK");
});

// Add a health/live endpoint.
app.get("/health/live", async (c) => {
  return c.text("OK");
});

// Add middleware.
app.use("*", honoLogger(middlewareLogger));
app.use("*", etag());
app.use("*", cors({ origin: "*" }));
app.use("/static/*", serveStatic({ root: "./" }));

// Define the routes.

/**
 * Returns the current fee estimates for the Bitcoin network, rendered as HTML.
 */
app.get("/", async (c) => {
  let data: Estimates;

  try {
    data = await service.getData();
    // Set cache headers.
    c.res.headers.set("Cache-Control", `public, max-age=${CACHE_STD_TTL}`);
  } catch (error) {
    log.error(error);
    data = {
      current_block_height: 0,
      current_block_hash: "",
      fee_by_block_target: {},
    };
  }

  const props = {
    siteData: {
      baseUrl: BASE_URL,
      title: "Bitcoin Blended Fee Estimator",
      subtitle:
        "A blend of mempool-based and history-based Bitcoin fee estimates.",
    },
    data,
  };

  return c.html(<Content {...props} />);
});

/**
 * Returns the current fee estimates for the Bitcoin network, rendered as JSON.
 */
app.get("/v1/fee-estimates", async (c) => {
  let data: Estimates;

  try {
    data = await service.getData();

    // Set cache headers.
    c.res.headers.set("Cache-Control", `public, max-age=${CACHE_STD_TTL}`);

    // Return the estimates.
    return c.json(data);
  } catch (error) {
    log.error(error);
    return c.text("Error fetching fee estimates", 500);
  }
});

export default {
  port: PORT,
  fetch: app.fetch,
};

process.on("SIGINT", function () {
  log.info({ message: "Caught interrupt signal. Exiting." });
  process.exit();
});
