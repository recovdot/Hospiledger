export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS_PER_ASSET = 10;

/** Extra photo slots beyond the four required types must be type `damage`. */
export const MAX_PHOTOS_PER_REQUIRED_TYPE = 1;

export const MIN_PHOTO_WIDTH = 640;
export const MIN_PHOTO_HEIGHT = 480;

/** Signed storage URLs are short-lived; browsers fetch photos immediately after a page load. */
export const SIGNED_URL_TTL_SECONDS = 300;

/** Signer balance below this many lamports logs an alert before each anchor job. */
export const LOW_SIGNER_BALANCE_LAMPORTS = 5_000_000;

/** Anchor attempts before a record is marked `failed`; the passport stays `approved`. */
export const ANCHOR_RETRY_LIMIT = 3;

/** How long an anchor job waits for transaction confirmation before treating the attempt as failed. */
export const ANCHOR_CONFIRM_TIMEOUT_MS = 30_000;

/** Base delay for exponential anchor backoff: attempt n waits `ANCHOR_BACKOFF_BASE_MS * 2 ** (n - 1)`. */
export const ANCHOR_BACKOFF_BASE_MS = 2_000;

/** Recognition confidence below this threshold is flagged for seller attention, never shown as fact. */
export const AI_CONFIDENCE_FLAG_THRESHOLD = 0.7;

export const PUBLIC_VERIFY_RATE_LIMIT = 30;
export const PUBLIC_VERIFY_RATE_WINDOW_MS = 60_000;
