// MempoolFeeEstimates represents the fee estimates for different transaction speeds.
type MempoolFeeEstimates = {
  [key: string]: number; // dynamic keys with number as value (sat/vb)
  fastestFee: number; // fee for the fastest transaction speed (sat/vb)
  halfHourFee: number; // fee for half an hour transaction speed (sat/vb)
  hourFee: number; // fee for an hour transaction speed (sat/vb)
  economyFee: number; // fee for economy transaction speed (sat/vb)
  minimumFee: number; // minimum relay fee (sat/vb)
};

// FeeByBlockTarget represents the fee by block target.
type FeeByBlockTarget = {
  [key: number]: number; // fees by confirmation target
};

// Estimates represents the current block hash and fee by block target.
type Estimates = {
  current_block_hash: string | null; // current block hash
  current_block_height: number | null; // current block height
  fee_by_block_target: FeeByBlockTarget; // fee by block target (in sat/kb)
};

// BlockTargetMapping represents the mapping of block targets.
type BlockTargetMapping = {
  [key: number]: string; // dynamic numeric keys with string as value
};

// SiteData represents the data of a site.
interface SiteData {
  title: string; // title of the site
  subtitle: string; // subtitle of the site
  children?: any; // children of the site (optional)
}

// ExpectedResponseType represents the expected response type for an http request.
type ExpectedResponseType = "json" | "text"; // can be either 'json' or 'text'

// BatchRequest represents a bitcoind batch request response.
interface BitcoindRpcBatchResponse {
  result?: EstimateSmartFeeResponse;
  error?: any;
}

// EstimateSmartFeeResponse represents the response of the estimatesmarttee method.
interface EstimateSmartFeeResponse {
  feerate?: number; // estimate fee rate in BTC/kB (only present if no errors were encountered)
  errors?: [string]; // errors encountered during processing (if there are any)
  blocks?: number; // block number where estimate was found
}

// EstimateMode represents the mode for fee estimation.
type EstimateMode = "ECONOMICAL" | "CONSERVATIVE"; // estimate mode can be either 'ECONOMICAL' or 'CONSERVATIVE'

interface Provider {
  getBlockHeight(): Promise<number>;
  getBlockHash(): Promise<string>;
  getFeeEstimates(): Promise<FeeByBlockTarget>;
  getAllData(): Promise<ProviderData>;
}

type ProviderData = [number, string, FeeByBlockTarget];
