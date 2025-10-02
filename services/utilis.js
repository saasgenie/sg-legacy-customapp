const crypto = require('crypto');

class Utils {
  constructor() {
    // Store multiple client secrets for different Intercom apps
    this.intercomSecrets = {
      pricing: process.env.INTERCOM_CLIENT_SECRET_PRICING,
      timeline: process.env.INTERCOM_CLIENT_SECRET_TIMELINE,
      // Default fallback
      default: process.env.INTERCOM_CLIENT_SECRET || process.env.INTERCOM_CLIENT_SECRET_PRICING
    };
  }

  /**
   * Get Intercom client secret by app identifier
   * @param {string} appId - App identifier ('pricing', 'timeline', or 'default')
   * @returns {string} Client secret for the specified app
   */
  getIntercomSecret(appId = 'default') {
    const secret = this.intercomSecrets[appId] || this.intercomSecrets.default;
    if (!secret) {
      throw new Error(`Intercom client secret not found for app: ${appId}`);
    }
    return secret;
  }

  /**
   * Determine which Intercom app to use based on request context
   * You can customize this logic based on your needs
   * @param {Object} req - Express request object
   * @returns {string} App identifier
   */
  determineIntercomApp(req) {
    // Option 1: Use a header to specify the app
    const appHeader = req.headers['x-intercom-app'];
    if (appHeader && this.intercomSecrets[appHeader]) {
      return appHeader;
    }

    // Option 2: Use query parameter
    const appQuery = req.query.app;
    if (appQuery && this.intercomSecrets[appQuery]) {
      return appQuery;
    }

    // Option 3: Use different endpoints/paths
    const baseUrl = req.baseUrl;
    if (baseUrl.includes('/pricing') || baseUrl.includes('-pricing')) {
      return 'pricing';
    }
    if (baseUrl.includes('/timeline') || baseUrl.includes('-timeline')) {
      return 'timeline';
    }

    // Option 4: Use request body to determine app
    if (req.body && req.body.app_id) {
      return req.body.app_id;
    }

    // Default fallback
    return 'default';
  }

  /**
   * Verify Intercom Canvas webhook signature with support for multiple apps
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @param {string} appId - Optional app identifier, will auto-detect if not provided
   */
  verifyIntercomCanvas(req, res, next, appId = null) {
    try {
      const signature = req.headers['x-body-signature'];
      if (!signature) {
        console.warn('No canvas signature provided');
        return res.status(401).json({ error: 'No signature provided' });
      }

      // Determine which app to use
      const targetApp = appId || this.determineIntercomApp(req);
      console.log(`Verifying Intercom signature for app: ${targetApp}`);

      // Get the appropriate client secret
      let clientSecret;
      try {
        clientSecret = this.getIntercomSecret(targetApp);
      } catch (error) {
        console.error('Failed to get Intercom secret:', error.message);
        return res.status(500).json({ error: 'Configuration error' });
      }

      // Compute the expected signature
      const computedSignature = crypto
        .createHmac('sha256', clientSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      const expectedSignature = `${computedSignature}`;
      
      // Use timing-safe comparison to prevent timing attacks
      if (signature.length !== expectedSignature.length || 
          !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        console.warn(`Invalid canvas signature for app: ${targetApp}`);
        return res.status(401).json({ error: 'Invalid signature' });
      }

      console.log(`Canvas signature verified successfully for app: ${targetApp}`);
      
      // Store the verified app ID in the request for later use
      req.intercomApp = targetApp;
      
      next();
    } catch (error) {
      console.error('Error verifying canvas signature:', error.message);
      res.status(500).json({ error: 'Signature verification failed' });
    }
  }

  /**
   * Create a middleware function for specific Intercom app
   * @param {string} appId - App identifier
   * @returns {Function} Express middleware function
   */
  createIntercomMiddleware(appId) {
    return (req, res, next) => {
      this.verifyIntercomCanvas(req, res, next, appId);
    };
  }

  /**
   * Verify signature against multiple possible client secrets
   * Useful when you're not sure which app the request is for
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  verifyIntercomCanvasMultiple(req, res, next) {
    try {
      const signature = req.headers['x-body-signature'];
      if (!signature) {
        console.warn('No canvas signature provided');
        return res.status(401).json({ error: 'No signature provided' });
      }

      const bodyString = JSON.stringify(req.body);
      let verifiedApp = null;

      // Try each client secret until one works
      for (const [appId, clientSecret] of Object.entries(this.intercomSecrets)) {
        if (!clientSecret) continue;

        const computedSignature = crypto
          .createHmac('sha256', clientSecret)
          .update(bodyString)
          .digest('hex');

        const expectedSignature = `${computedSignature}`;
        
        if (signature.length === expectedSignature.length && 
            crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
          verifiedApp = appId;
          break;
        }
      }

      if (!verifiedApp) {
        console.warn('Canvas signature did not match any configured apps');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      console.log(`Canvas signature verified successfully for app: ${verifiedApp}`);
      
      // Store the verified app ID in the request
      req.intercomApp = verifiedApp;
      
      next();
    } catch (error) {
      console.error('Error verifying canvas signature:', error.message);
      res.status(500).json({ error: 'Signature verification failed' });
    }
  }

  /**
   * Get configuration for a specific Intercom app
   * @param {string} appId - App identifier
   * @returns {Object} Configuration object
   */
  getIntercomConfig(appId = 'default') {
    return {
      clientSecret: this.getIntercomSecret(appId),
      appId: appId
    };
  }

  /**
   * Log request details for debugging
   * @param {Object} req - Express request object
   * @param {string} context - Context description
   */
  logRequestDetails(req, context = 'Request') {
    console.log(`${context} Details:`, {
      method: req.method,
      path: req.path,
      headers: {
        'x-body-signature': req.headers['x-body-signature'],
        'x-intercom-app': req.headers['x-intercom-app'],
        'content-type': req.headers['content-type']
      },
      query: req.query,
      bodySize: req.body ? JSON.stringify(req.body).length : 0,
      intercomApp: req.intercomApp
    });
  }
}

module.exports = new Utils();
