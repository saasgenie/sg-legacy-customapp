const express = require('express');
const router = express.Router();
const publicationsService = require('../services/publicationsService');
const apiService = require('../services/apiService');
const utils = require('../services/utilis');
const calendarService = require('../services/calendarService');

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
router.post('/initialize', utils.createIntercomMiddleware(), (req, res) => {
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
        "id": `uuid__${pub.uuid}|${pub.publisher_name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`,
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
                "text": "*Enter Desired Run Date and Confirm Newspaper*",
                "style": "header"
              },
              {
                "type": "input",
                "id": "date",
                "label": "Date (optional)",
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
    const id = body.component_id.split('__')[1];
    const selectedUuid = id.split('|')[0];
    const publisherName = id.split('|')[1];
    try {
      // Construct S3 URL for the ICS file
      const icsUrl = `https://s3.amazonaws.com/obituary.datastore/prod/static/calendar/${publisherName}.ics`;
      console.log(`Downloading and parsing ICS file for UUID: ${publisherName}`);
      console.log(`ICS URL: ${icsUrl}`);

      // Download and parse the ICS file using calendar service
      // This will automatically cache the result if not already cached
      const calendarEvents = await calendarService.retrieveAndParseIcs(icsUrl);
      console.log(`Successfully parsed ${calendarEvents.length} events from ICS file`);

      // Filter events by selectedUuid (publication UUID) - match against the first part of UID before "--"
      const filteredEvents = calendarEvents.filter(event => {
        if (!event.originalUid) return false;
        
        // Split the UID by "--" and get the first part
        const uidParts = event.originalUid.split('--');
        const eventPublicationId = uidParts[0]; // e.g., "5409_Adpay" from "5409_Adpay--69bec25c-98bb-406e-b4eb-5b17e756cfb0"
        
        // Check if the selectedUuid is contained in the event's publication ID
        return eventPublicationId.includes(selectedUuid);
      });

      console.log(`Filtered ${filteredEvents.length} events matching UUID: ${selectedUuid}`);

      // Limit results to prevent overwhelming the UI (e.g., 50 events max)
      const limitedEvents = filteredEvents.slice(0, 50);
      console.log(`Limited to ${limitedEvents.length} events for display`);

      // Store the events in cache using UUID as key for quick access
      // Note: The calendar service already caches by filename, but we can add UUID-based caching too

      // Get publication name for display
      let publications = publicationsService.getPublications();
      if (!publications) {
        publications = await publicationsService.fetchPublications();
      }
      const selectedPublication = publications.find(pub => pub.uuid === selectedUuid);
      const publicationName = selectedPublication ? selectedPublication.name : publisherName;

      // Create components array starting with paper details
      const components = [
        {
          "type": "text",
          "text": "*Paper Details:*",
          "style": "header",
          "bottom_margin": "none"
        },
        {
          "type": "text",
          "text": `${publicationName}`,
          "style": "paragraph",
          "bottom_margin": "none"
        },
        {
          "type": "spacer",
          "size": "s"
        },
        {
          "type": "text",
          "text": "*Next Available Run Dates:*",
          "style": "header",
          "bottom_margin": "none"
        }
      ];

      // Process events to show next available run dates
      if (limitedEvents.length > 0) {
        // Sort events by start date
        const sortedEvents = limitedEvents.sort((a, b) => {
          const dateA = new Date(a.start.dateTime);
          const dateB = new Date(b.start.dateTime);
          return dateA - dateB;
        });

        // Show next few upcoming events (limit to 10 for UI purposes)
        const upcomingEvents = sortedEvents.slice(0, 10);

        upcomingEvents.forEach(event => {
          const eventDate = new Date(event.start.dateTime);
          
          // Format the run date (e.g., "Mon 9/29/25")
          const dayNames = ['Sun', 'Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat'];
          const dayName = dayNames[eventDate.getDay()];
          const month = eventDate.getMonth() + 1;
          const day = eventDate.getDate();
          const year = eventDate.getFullYear().toString().slice(-2);
          const formattedRunDate = `${dayName} ${month}/${day}/${year}`;

          // Calculate submission deadline (typically 2 days before run date)
          const submissionDate = new Date(eventDate);
          submissionDate.setDate(eventDate.getDate() - 2);
          const subDayName = dayNames[submissionDate.getDay()];
          const subMonth = submissionDate.getMonth() + 1;
          const subDay = submissionDate.getDate();
          const subYear = submissionDate.getFullYear().toString().slice(-2);
          const formattedSubDate = `${subDayName} ${subMonth}/${subDay}/${subYear}`;

          // Extract time from the event (default to 3:00pm if not specified)
          const eventTime = new Date(event.start.dateTime);
          const timeString = eventTime.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true 
          });

          // Add run date header
          components.push({
            "type": "text",
            "text": `*${formattedRunDate}*`,
            "style": "muted",
            "bottom_margin": "none"
          });

          // Add submission deadline
          components.push({
            "type": "text",
            "text": `Submit by ${timeString} on ${formattedSubDate}`,
            "style": "paragraph"
          });
        });
      } else {
        // No events found
        components.push({
          "type": "text",
          "text": "No upcoming run dates found for this publication.",
          "style": "muted"
        });
      }

      // Add final spacer and back button
      components.push(
        {
          "type": "spacer",
          "size": "s"
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
      );

      // Create success canvas with the dynamic components
      const successCanvas = {
        canvas: {
          content: {
            components: components
          }
        }
      };

      return res.json(successCanvas);

    } catch (error) {
      console.error('Error downloading or parsing ICS file:', error.message);

      // Check if it's a network/download error or parsing error
      const isNetworkError = error.message.includes('ENOTFOUND') ||
        error.message.includes('404') ||
        error.message.includes('Network Error');

      const errorTitle = isNetworkError ?
        "Calendar File Not Found" :
        "Failed to Parse Calendar Data";

      const errorMessage = isNetworkError ?
        `Could not download calendar file for ${publisherName}. The file may not exist or the server is unavailable.` :
        `Error parsing calendar data: ${error.message}`;

      // Return error canvas
      const calendarErrorCanvas = {
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

      return res.json(calendarErrorCanvas);
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