// Image update checking
export { checkImageUpdates } from "./image-updates";
export type { ImageUpdateInfo } from "./image-updates";

// Self-update (updating Compoza itself)
export { selfUpdate } from "./self-update";
export type { SelfUpdateResult } from "./self-update";

// Shared utilities
export { pullLatestImage } from "./pull";

// Cache management
export { getAllCachedUpdates, getCacheStats, clearCachedUpdates } from "./cache";
export type { CachedUpdate } from "./cache";
