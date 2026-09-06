const BrandBlock = require("../model/BrandBlock");

const CACHE_TTL_MS = 60 * 1000; 

let cachedCount = null;
let lastFetchedAt = 0;
let isFetching = false; 

async function refreshCache() {
  if (isFetching) return; 
  isFetching = true;
  try {
    cachedCount = await BrandBlock.countDocuments({ paymentStatus: "success" });
    lastFetchedAt = Date.now();
  } finally {
    isFetching = false;
  }
}
refreshCache().catch(() => {});

const getTotalBrandsCount = async (req, res) => {
  try {
    const now = Date.now();
    const isStale = now - lastFetchedAt > CACHE_TTL_MS;

   
    if (isStale) {
      refreshCache().catch(() => {});
    }

   
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
