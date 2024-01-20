type MempoolFeeEstimates = {
  [key: string]: number | undefined;
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
};

type EsploraFeeEstimates = {
  [key: number]: number;
};

type FeeByBlockTarget = {
  [key: string]: number;
};

type Estimates = {
  current_block_hash: string | null;
  fee_by_block_target: FeeByBlockTarget;
};

type BlockTargetMapping = {
  [key: number]: string;
};

interface SiteData {
  title: string,
  subtitle: string,
  children?: any
}

type ExpectedResponseType = 'json' | 'text';