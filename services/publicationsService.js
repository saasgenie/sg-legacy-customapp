const NodeCache = require('node-cache');
const apiService = require('./apiService');

class PublicationsService {
  constructor() {
    // Initialize cache with 8 hours TTL (8 * 60 * 60 seconds)
    this.cache = new NodeCache({ stdTTL: 8 * 60 * 60 });
    this.cacheKey = 'publications_data';
  }

  async fetchPublications() {
    try {
      console.log('PublicationsService: Delegating to ApiService...');

      // Use apiService to fetch publications
      let publications = await apiService.fetchPublications();

      const static_one = {
        "uuid": "BRD-Bradenton Herald",
        "name": "BRD-Bradenton Herald",
        "description": "Publishes daily (Saturday is an e-edition only)",
        "type": "PRINT",
        "affiliate_uid": "9999",
        "image_uri": "",
        "city_name": "",
        "region_code": "",
        "country_code": "US",
        "publisher_name": "Spokesman-Review",
        "publication_link": "BRD-Bradenton Herald"
      }
      publications.push(static_one)

      // Store in cache
      this.cache.set(this.cacheKey, publications);

      return publications;
    } catch (error) {
      console.error('PublicationsService: Error fetching publications:', error.message);
      throw error;
    }
  }

  getPublications() {
    const cachedData = this.cache.get(this.cacheKey);
    if (cachedData) {
      console.log('Returning cached publications data');
      return cachedData;
    }
    return null;
  }

  async getPublicationsWithFallback() {
    let publications = this.getPublications();

    if (!publications) {
      console.log('No cached data found, fetching from API...');
      publications = await this.fetchPublications();
    }

    return publications;
  }

  clearCache() {
    this.cache.del(this.cacheKey);
    console.log('Publications cache cleared');
  }

  getCacheStats() {
    const keys = this.cache.keys();
    const stats = this.cache.getStats();
    return {
      keys,
      stats,
      hasCachedPublications: this.cache.has(this.cacheKey)
    };
  }
}

module.exports = new PublicationsService();