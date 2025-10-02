const express = require('express');
const router = express.Router();
const publicationsService = require('../services/publicationsService');

// Cache status endpoint
router.get('/status', (req, res) => {
  const cacheStats = publicationsService.getCacheStats();
  res.json({
    cache: cacheStats,
    publications: {
      cached: cacheStats.hasCachedPublications,
      count: cacheStats.hasCachedPublications ? publicationsService.getPublications().length : 0
    }
  });
});

// Clear cache endpoint
router.delete('/clear', (req, res) => {
  try {
    publicationsService.clearCache();
    res.json({
      success: true,
      message: 'Cache cleared successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;