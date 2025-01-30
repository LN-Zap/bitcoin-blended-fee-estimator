interface Provider {
  getBlockHeight(): Promise<number>;
  getBlockHash(): Promise<string>;
  getFeeEstimates(): Promise<FeeByBlockTarget>;
  getMinRelayFeeRate(): Promise<number>;
  getAllData(): Promise<ProviderData>;
}

type DataPoint = {
  provider: Provider;
  blockHeight: number;
  blockHash: string;
  feeEstimates: FeeByBlockTarget;
  minRelayFeeRate: number;
};

// CacheConfig represents the configuration for the cache.
type CacheConfig = {
  stdTTL: number;
  checkperiod: number;
};

// MempoolFeeEstimates represents the data returned by the Mempool API.
type MempoolFeeEstimates = {
  [key: string]: number; // dynamic keys with number as value (sat/vb)
  fastestFee: number; // fee for the fastest transaction speed (sat/vb)
  halfHourFee: number; // fee for half an hour transaction speed (sat/vb)
  hourFee: number; // fee for an hour transaction speed (sat/vb)
  economyFee: number; // fee for economy transaction speed (sat/vb)
  minimumFee: number; // minimum relay fee (sat/vb)
};

// MempoolFeeEstimates represents the data returned by the Esplora API.
type EsploraFeeEstimates = {
  [key: string]: number;
};

// FeeByBlockTarget represents the fee by block target.
type FeeByBlockTarget = {
  [target: string]: number; // fees by confirmation target
};

// ExpectedResponseType represents the expected response type for an http request.
type ExpectedResponseType = "json" | "text"; // can be either 'json' or 'text'

// EstimateMode represents the mode for fee estimation.
type EstimateMode = "ECONOMICAL" | "CONSERVATIVE"; // estimate mode can be either 'ECONOMICAL' or 'CONSERVATIVE'

// BatchRequest represents a bitcoind batch request response.
interface EstimateSmartFeeBatchResponse {
  result?: EstimateSmartFeeResponse;
  error?: any;
}

// EstimateSmartFeeResponse represents the response of the estimatesmarttee method.
interface EstimateSmartFeeResponse {
  feerate?: number; // estimate fee rate in BTC/kB (only present if no errors were encountered)
  errors?: [string]; // errors encountered during processing (if there are any)
  blocks?: number; // block number where estimate was found
}

interface BlockCountResponse {
  result: number;
}

interface BestBlockHashResponse {
  result: string;
}

interface MemPoolInfoResponse {
  result: MemPoolInfo;
}

interface MemPoolInfo {
  mempoolminfee: number;
}

type ProviderData = {
  blockHeight: number;
  blockHash: string;
  feeEstimates: FeeByBlockTarget;
  minRelayFeeRate: number;
};

// Estimates represents the current block hash and fee by block target.
type Estimates = {
  current_block_hash: string | null; // current block hash
  current_block_height: number | null; // current block height
  fee_by_block_target: FeeByBlockTarget; // fee by block target (in sat/kb)
  min_relay_feerate: number | null; // minimum relay fee rate (in sat/kb)
};

// SiteData represents the data of a site.
interface SiteData {
  baseUrl: string; // base url of the site
  title: string; // title of the site
  subtitle: string; // subtitle of the site
  children?: any; // children of the site (optional)
}
