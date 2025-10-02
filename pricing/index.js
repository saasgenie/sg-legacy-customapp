const express = require('express');
const router = express.Router();
const publicationsService = require('../services/publicationsService');
const apiService = require('../services/apiService');
const utils = require('../services/utilis');

const initialCanvas = {
    canvas: {
        content: {
            components: [
                {
                    "type": "text",
                    "text": "*Look Up Newspaper ID*",
                    "style": "header"
                },
                {
                    "type": "input",
                    "id": "newspaper",
                    "label": "Newspaper Name",
                    "placeholder": "Enter the newspaper name..."
                },
                {
                    "type": "spacer",
                    "size": "s"
                },
                {
                    "type": "button",
                    "id": "submit-search-newspaper",
                    "label": "Look Up Newspaper",
                    "style": "primary",
                    "action": {
                        "type": "submit"
                    }
                }
            ],
        },
    },
};

// Initialize pricing endpoint
router.post('/initialize', utils.createIntercomMiddleware(), (req, res) =>  {
    res.json(initialCanvas);
});

// Submit pricing endpoint
router.post('/submit', utils.createIntercomMiddleware(), async (req, res) => {
    console.log('Received pricing submission:', req.body);
    const body = req.body;

    if (body.component_id === 'submit-search-newspaper') {
        const searchTerm = body.input_values.newspaper;
        console.log('Searching for newspaper:', searchTerm);

        // Validate that searchTerm is not empty
        if (!searchTerm || searchTerm.trim() === '') {
            const errorCanvas = {
                canvas: {
                    content: {
                        components: [
                            {
                                "type": "image",
                                "url": `${process.env.BASE_URL}/icons/cross.png`,
                                "width": 40,
                                "height": 40,
                                "align": "center"
                            },
                            {
                                "type": "text",
                                "text": "Please enter a newspaper name",
                                "align": "center",
                                "style": "header"
                            },
                            {
                                "type": "button",
                                "id": "back-to-home",
                                "label": "Back",
                                "style": "primary",
                                "action": {
                                    "type": "submit"
                                }
                            }
                        ]
                    }
                }
            };
            return res.json(errorCanvas);
        }

        try {
            // Get publications from cache or fetch if not available
            let publications = publicationsService.getPublications();

            if (!publications) {
                console.log('Cache not found, fetching publications...');
                publications = await publicationsService.fetchPublications();
            }

            // Search against name and description fields
            const filteredPublications = publications.filter(pub => {
                const nameMatch = pub.name && pub.name.toLowerCase().includes(searchTerm.toLowerCase());
                const descriptionMatch = pub.description && pub.description.toLowerCase().includes(searchTerm.toLowerCase());
                return nameMatch || descriptionMatch;
            });

            console.log(`Found ${filteredPublications.length} matching publications`);

            // Convert filtered results to canvas list items
            const listItems = filteredPublications.slice(0, 10).map(pub => ({ // Limit to 10 results
                "type": "item",
                "id": `uuid_${pub.uuid}`,
                "title": pub.name,
                "subtitle": `${pub.city_name}, ${pub.region_code}`,
                "tertiary_text": pub.publisher_name,
                "action": {
                    "type": "submit"
                }
            }));

            const canvasWithResults = {
                canvas: {
                    content: {
                        components: [
                            {
                                "type": "text",
                                "text": "*Enter Publication Date and Confirm Newspaper*",
                                "style": "header"
                            },
                            {
                                "type": "input",
                                "id": "date",
                                "label": "Date",
                                "placeholder": "Enter as MM/DD/YYYY"
                            },
                            {
                                "type": "list",
                                "id": "newspaper-selection",
                                "label": `Select Newspaper (${filteredPublications.length} found)`,
                                "items": listItems.length > 0 ? listItems : [
                                    {
                                        "type": "item",
                                        "id": "no-results",
                                        "title": "No newspapers found",
                                        "subtitle": `No results for "${searchTerm}"`,
                                        "tertiary_text": "Try a different search term"
                                    }
                                ]
                            },
                            {
                                "type": "spacer",
                                "size": "s"
                            },
                            {
                                "type": "button",
                                "id": "back-to-home",
                                "label": "Back",
                                "style": "secondary",
                                "action": {
                                    "type": "submit"
                                }
                            }
                        ],
                    },
                },
            };

            return res.json(canvasWithResults);

        } catch (error) {
            console.error('Error searching publications:', error.message);

            // Return error canvas
            const errorCanvas = {
                canvas: {
                    content: {
                        components: [
                            {
                                "type": "text",
                                "text": "Error searching publications. Please try again later."
                            },
                            {
                                "type": "button",
                                "id": "retry",
                                "label": "Retry Search",
                                "style": "primary",
                                "action": {
                                    "type": "submit"
                                }
                            },
                            {
                                "type": "button",
                                "id": "back-to-home",
                                "label": "Back",
                                "style": "secondary",
                                "action": {
                                    "type": "submit"
                                }
                            }
                        ],
                    },
                },
            };

            return res.json(errorCanvas);
        }
    }
    else if (body.component_id === 'back-to-home') {
        return res.json(initialCanvas);
    }
    else if (body.component_id && body.component_id.startsWith('uuid_')) {
        const selectedUuid = body.component_id.replace('uuid_', '');
        if (body.input_values.date) {
            try {
                console.log('Making pricing API call for UUID:', selectedUuid, 'Date:', body.input_values.date);

                // Format the date for the API
                const formattedDate = apiService.formatDateForApi(body.input_values.date);

                // First, fetch the package information for the selected publication
                console.log('Fetching package information for publication:', selectedUuid);
                const packageInfo = await apiService.fetchPackagesByPublication(selectedUuid);
                console.log('Selected package:', packageInfo.uuid);

                // Create request data using the API service with the dynamic package UUID
                const requestData = apiService.createPricingRequestData(selectedUuid, formattedDate, packageInfo.uuid);

                // Make the pricing API call with timeout
                const response = await Promise.race([
                    apiService.getPricingEstimates(requestData),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('API_TIMEOUT')), 8000) // 8 second timeout to be safe
                    )
                ]);

                console.log('Pricing API response received:', response);

                // Get publication name from cache
                let publications = publicationsService.getPublications();
                if (!publications) {
                    publications = await publicationsService.fetchPublications();
                }
                const selectedPublication = publications.find(pub => pub.uuid === selectedUuid);
                const publicationName = selectedPublication ? selectedPublication.name : selectedUuid;

                // Create success canvas with pricing details
                const successCanvas = {
                    canvas: {
                        content: {
                            components: [
                                {
                                    "type": "text",
                                    "text": "*Paper Details:*",
                                    "style": "header",
                                    "bottom_margin": "none"
                                },
                                {
                                    "type": "text",
                                    "text": `- ${publicationName}`,
                                    "style": "paragraph",
                                    "bottom_margin": "none"
                                },
                                {
                                    "type": "text",
                                    "text": `- Publish Date: ${body.input_values.date}`,
                                    "style": "paragraph"
                                },
                                {
                                    "type": "spacer",
                                    "size": "s"
                                },
                                {
                                    "type": "text",
                                    "text": "*Pricing Details:*",
                                    "style": "header",
                                    "bottom_margin": "none"
                                },
                                {
                                    "type": "text",
                                    "text": `*Short (~60 Words)*`,
                                    "style": "muted",
                                    "bottom_margin": "none"
                                },
                                {
                                    "type": "text",
                                    "text": `$${response[0].total_price}`,
                                    "style": "paragraph"
                                },
                                {
                                    "type": "text",
                                    "text": `*Medium (~250 Words)*`,
                                    "style": "muted",
                                    "bottom_margin": "none"
                                },
                                {
                                    "type": "text",
                                    "text": `$${response[1].total_price}`,
                                    "style": "paragraph"
                                },
                                {
                                    "type": "text",
                                    "text": `*Long (425 Words)*`,
                                    "style": "muted",
                                    "bottom_margin": "none"
                                },
                                {
                                    "type": "text",
                                    "text": `$${response[2].total_price}`,
                                    "style": "paragraph"
                                },
                                {
                                    "type": "spacer",
                                    "size": "s"
                                },
                                {
                                    "type": "button",
                                    "id": "back-to-home",
                                    "label": "Look Up Other Newspaper",
                                    "style": "secondary",
                                    "action": {
                                        "type": "submit"
                                    }
                                }
                            ]
                        }
                    }
                };

                return res.json(successCanvas);

            } catch (error) {
                console.error('Error making pricing API call:', error.message);

                // Check if it's a timeout error
                const isTimeout = error.message === 'API_TIMEOUT' || error.status === 500;
                const errorTitle = isTimeout ?
                    "Pricing Request Timed Out" :
                    "Failed to get pricing estimates";
                const errorMessage = isTimeout ?
                    "Please consult ObitPortal for pricing this newspaper. API pricing estimates for this specific newspaper are not available." :
                    (error.response?.data?.message || error.message);

                // Return error canvas
                const apiErrorCanvas = {
                    canvas: {
                        content: {
                            components: [
                                {
                                    "type": "image",
                                    "url": `${process.env.BASE_URL}/icons/cross.png`,
                                    "width": 40,
                                    "height": 40,
                                    "align": "center"
                                },
                                {
                                    "type": "text",
                                    "text": errorTitle,
                                    "align": "center",
                                    "style": "header"
                                },
                                {
                                    "type": "text",
                                    "text": errorMessage,
                                    "align": "center",
                                    "style": "muted"
                                },
                                {
                                    "type": "button",
                                    "id": "back-to-home",
                                    "label": "Back to Home",
                                    "style": "primary",
                                    "action": {
                                        "type": "submit"
                                    }
                                }
                            ]
                        }
                    }
                };

                return res.json(apiErrorCanvas);
            }
        }
        else {
            // throw error with a done icon
            const errorCanvas = {
                canvas: {
                    content: {
                        components: [
                            {
                                "type": "image",
                                "url": `${process.env.BASE_URL}/icons/cross.png`,
                                "width": 40,
                                "height": 40,
                                "align": "center"
                            },
                            {
                                "type": "text",
                                "id": "error",
                                "text": "Please enter the date before selecting the Newspaper",
                                "align": "center",
                                "style": "muted"
                            },
                            {
                                "type": "button",
                                "id": "back-to-home",
                                "label": "Back",
                                "style": "secondary",
                                "action": {
                                    "type": "submit"
                                }
                            }
                        ]
                    }
                }
            };

            return res.json(errorCanvas);
        }
    }

    // Default canvas for other submissions
    const canvasWithResults = {
        canvas: {
            content: {
                components: [
                    {
                        "type": "input",
                        "id": "date",
                        "label": "Enter Publishing Date",
                        "placeholder": "Enter date in YYYY-MM-DD"
                    },
                    {
                        "type": "list",
                        "id": "label",
                        "label": "Select Newspaper",
                        "items": [
                            {
                                "type": "item",
                                "id": "bug",
                                "title": "Option One",
                                "subtitle": "Sub One",
                                "tertiary_text": "test",
                                "action": {
                                    "type": "submit"
                                }
                            },
                            {
                                "type": "item",
                                "id": "feedback",
                                "title": "Option Two",
                                "subtitle": "Sub Two",
                                "tertiary_text": "test",
                                "action": {
                                    "type": "submit"
                                }
                            }
                        ]
                    }
                ],
            },
        },
    };
    res.json(canvasWithResults);
});

module.exports = router;