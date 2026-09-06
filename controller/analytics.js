const BrandBlock = require("../model/BrandBlock");

/**
 * In-memory cache so repeated hits never touch MongoDB.
 * The value is refreshed every CACHE_TTL_MS milliseconds in the background.
 */
const CACHE_TTL_MS = 60 * 1000; // 1 minute

let cachedCount = null;
let lastFetchedAt = 0;
let isFetching = false; // prevents stampede

/**
 * Refresh the in-memory cache from MongoDB.
 * Uses countDocuments which hits the paymentStatus index directly (index-only scan).
 */
async function refreshCache() {
  if (isFetching) return; // already in-flight
  isFetching = true;
  try {
    cachedCount = await BrandBlock.countDocuments({ paymentStatus: "success" });
    lastFetchedAt = Date.now();
  } finally {
    isFetching = false;
  }
}

// Warm the cache on server startup (non-blocking)
refreshCache().catch(() => {});

/**
 * GET /api/analytics/total-brands
 *
 * Returns the total number of brands with paymentStatus === "success".
 * Serves from in-memory cache for sub-10ms responses.
 * Cache is refreshed every 60 seconds in the background.
 */
const getTotalBrandsCount = async (req, res) => {
  try {
    const now = Date.now();
    const isStale = now - lastFetchedAt > CACHE_TTL_MS;

    // If cache is stale, trigger a background refresh (stale-while-revalidate)
    if (isStale) {
      refreshCache().catch(() => {});
    }

    // If cache was never populated (cold start), wait for first fetch
    if (cachedCount === null) {
      await refreshCache();
    }

    return res.status(200).json({
      success: true,
      totalBrands: cachedCount,
      cachedAt: new Date(lastFetchedAt).toISOString(),
    });
  } catch (error) {
    console.error("[Analytics] getTotalBrandsCount error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch total brands count",
    });
  }
};

module.exports = { getTotalBrandsCount };
