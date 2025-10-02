// Load environment variables
require('dotenv').config();

const express = require('express');
const pricingRoutes = require('./pricing');
const timelineRoutes = require('./timeline');
const cacheRoutes = require('./cache');
const publicationsService = require('./services/publicationsService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving for icons
app.use('/icons', express.static('icons'));

// Health endpoint
app.get('/health', (req, res) => {
  const cacheStats = publicationsService.getCacheStats();
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'canvas-app',
    cache: {
      publicationsLoaded: cacheStats.hasCachedPublications,
      cacheStats: cacheStats.stats
    }
  });
});

// Publications endpoint
app.get('/publications', async (req, res) => {
  try {
    const publications = await publicationsService.getPublicationsWithFallback();
    res.json({
      success: true,
      count: publications.length,
      data: publications
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mount route modules
app.use('/pricing', pricingRoutes);
app.use('/timeline', timelineRoutes);
app.use('/cache', cacheRoutes);

// Default route
app.get('/', (req, res) => {
  res.json({
    message: 'Canvas App API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      publications: '/publications',
      icons: '/icons/*',
      cache: {
        status: '/cache/status',
        clear: 'DELETE /cache/clear'
      },
      pricing: {
        initialize: '/pricing/initialize',
        submit: '/pricing/submit'
      },
      timeline: {
        initialize: '/timeline/initialize',
        submit: '/timeline/submit'
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

app.listen(PORT, async () => {
  console.log(`Canvas App server is running on port ${PORT}`);
  
  // Initialize publications data on startup
  try {
    console.log('Initializing publications data...');
    await publicationsService.fetchPublications();
    console.log('Publications data loaded successfully');
  } catch (error) {
    console.error('Failed to load publications data on startup:', error.message);
    console.log('App will continue to run, but publications data will be loaded on first request');
  }
});

module.exports = app;
