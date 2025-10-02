const axios = require('axios');

class ApiService {
  constructor() {
    this.domain = process.env.DOMAIN;
    this.apiKey = process.env.API_KEY;
    
    if (!this.domain || !this.apiKey) {
      console.warn('Warning: DOMAIN and API_KEY environment variables should be set');
    }
  }

  /**
   * Get the base axios configuration with common headers
   */
  getBaseConfig() {
    return {
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json'
      }
    };
  }

  /**
   * Fetch publications by region
   * @param {string} regionCode - Region code filter
   * @param {string} countryCode - Country code filter (default: 'US')
   * @param {number} size - Maximum number of results (default: 4000)
   * @returns {Promise<Array>} List of publications
   */
  async fetchPublications(regionCode = '', countryCode = 'US', size = 4000) {
    try {
      console.log('ApiService: Fetching publications from API...');
      
      if (!this.domain || !this.apiKey) {
        throw new Error('DOMAIN and API_KEY must be set in environment variables');
      }

      const url = `${this.domain}/api/publications/by-region`;
      const response = await axios.get(url, {
        ...this.getBaseConfig(),
        params: {
          region_code: regionCode,
          size: size
        }
      });

      console.log(`ApiService: Successfully fetched ${response.data.length} publications`);
      return response.data;
      
    } catch (error) {
      console.error('ApiService: Error fetching publications:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Fetch packages by publication UUID
   * @param {string} publicationUuid - Publication UUID
   * @returns {Promise<Object>} Package information
   */
  async fetchPackagesByPublication(publicationUuid) {
    try {
      console.log('ApiService: Fetching packages for publication:', publicationUuid);
      
      if (!this.domain || !this.apiKey) {
        throw new Error('DOMAIN and API_KEY must be set in environment variables');
      }

      const url = `${this.domain}/api/packages/by-publication/${publicationUuid}`;
      const response = await axios.get(url, this.getBaseConfig());

      console.log(`ApiService: Successfully fetched ${response.data.length} packages`);
      
      // Find the first package with type "OBITUARY", or return the first one if none found
      const obituaryPackage = response.data.find(pkg => pkg.type === 'OBITUARY') || response.data[0];
      
      if (!obituaryPackage) {
        throw new Error('No packages found for publication');
      }
      
      console.log('ApiService: Selected package:', obituaryPackage.uuid);
      return obituaryPackage;
      
    } catch (error) {
      console.error('ApiService: Error fetching packages:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Get pricing estimates for obituaries
   * @param {Array} obituaryData - Array of obituary objects for pricing
   * @returns {Promise<Array>} Pricing estimates
   */
  async getPricingEstimates(obituaryData) {
    try {
      console.log('ApiService: Making pricing API call...');
      
      if (!this.domain || !this.apiKey) {
        throw new Error('DOMAIN and API_KEY must be set in environment variables');
      }

      const url = `${this.domain}/api/price/estimate-all?estimator=machine-learning`;
      const response = await axios.post(url, obituaryData, this.getBaseConfig());

      console.log(`ApiService: Successfully received ${response.data.length} pricing estimates`);
      return response.data;
      
    } catch (error) {
      console.error('ApiService: Error getting pricing estimates:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Create standard obituary request data for pricing
   * @param {string} selectedUuid - Publication UUID
   * @param {string} formattedDate - Date in YYYY-MM-DD format
   * @param {string} packageUuid - Package UUID from package API
   * @returns {Array} Array of obituary objects
   */
  createPricingRequestData(selectedUuid, formattedDate, packageUuid) {
    return [
      {
        "first_name": "John",
        "last_name": "Small",
        "images": [],
        "obituary": "Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.",
        "package_uuid": packageUuid,
        "publication_uuids": [selectedUuid],
        "upsells": [],
        "print_object": {
          "template_name": "foobar",
          "depth": 1,
          "columns": 1,
          "schedule": [
            {
              "date": formattedDate,
              "publication_uuid": selectedUuid
            }
          ]
        }
      },
      {
        "first_name": "John",
        "last_name": "Medium",
        "obituary": "Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.  Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.  Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.  Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.",
        "package_uuid": packageUuid,
        "publication_uuids": [selectedUuid],
        "upsells": [],
        "print_object": {
          "template_name": "foobar",
          "depth": 1,
          "columns": 1,
          "schedule": [
            {
              "date": formattedDate,
              "publication_uuid": selectedUuid
            }
          ]
        }
      },
      {
        "first_name": "John",
        "last_name": "Large",
        "images": [
          {
            "name": "headshot",
            "uri": "https://s3.us-east-1.amazonaws.com/obituary.datastore/oldman.jpg"
          }
        ],
        "emblems": [
          {
            "name": "cross",
            "uri": "https://s3.us-east-1.amazonaws.com/obituary.datastore/Clipart/Emblems/cross.jpg"
          }
        ],
        "obituary": "Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.  Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.  Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.  Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.  Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.  Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.  Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.  Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.",
        "package_uuid": packageUuid,
        "publication_uuids": [selectedUuid],
        "upsells": [],
        "print_object": {
          "template_name": "foobar",
          "depth": 1,
          "columns": 1,
          "schedule": [
            {
              "date": formattedDate,
              "publication_uuid": selectedUuid
            }
          ]
        }
      }
    ];
  }

  /**
   * Format date from MM/DD/YYYY to YYYY-MM-DD
   * @param {string} inputDate - Date in MM/DD/YYYY or other format
   * @returns {string} Date in YYYY-MM-DD format
   */
  formatDateForApi(inputDate) {
    if (inputDate.includes('/')) {
      // Assume MM/DD/YYYY format
      const [month, day, year] = inputDate.split('/');
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } else {
      // Assume it's already in YYYY-MM-DD format or similar
      return inputDate;
    }
  }
}

module.exports = new ApiService();