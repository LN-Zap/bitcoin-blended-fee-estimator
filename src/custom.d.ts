type MempoolFeeEstimates = {
  [key: string]: number | undefined;
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
};

type EsploraFeeEstimates = {
  [key: number]: number;
};

type FeeByBlockTarget = {
  [key: string]: number;
};

type Data = {
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