export type SolanaCluster = "devnet" | "testnet" | "mainnet-beta";

export type ApiConfig = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  AI_API_KEY: string;
  AI_API_BASE_URL: string;
  AI_VISION_MODEL: string;
  SOLANA_CLUSTER: SolanaCluster;
  SOLANA_RPC_URL: string;
  SOLANA_SIGNER_SECRET: string;
};
