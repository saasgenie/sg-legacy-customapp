const axios = require('axios');
const NodeCache = require('node-cache');
const { DateTime } = require('luxon');
const path = require('path');

class CalendarService {
  constructor() {
    // Cache for 24 hours (86400 seconds)
    this.cache = new NodeCache({ stdTTL: 86400 });
  }

  /**
   * Extract ICS filename from URL
   * @param {string} url - The ICS file URL
   * @returns {string} The filename without extension
   */
  extractIcsName(url) {
    try {
      const urlPath = new URL(url).pathname;
      const filename = path.basename(urlPath);
      // Remove .ics extension
      return filename.replace(/\.ics$/i, '');
    } catch (error) {
      console.error('Error extracting ICS name from URL:', error.message);
      return 'unknown';
    }
  }

  /**
   * Parse ICS content into structured events with advanced features
   * @param {string} icsContent - The raw ICS file content
   * @param {string} sourceUrl - The source URL for metadata
   * @returns {Array} Array of parsed calendar events
   */
  parseIcsContent(icsContent, sourceUrl = '') {
    console.log('CalendarService: Parsing ICS data...');
    
    // Extract RRULE data from raw ICS before processing
    const rruleMap = new Map();
    const eventBlocks = icsContent.split('BEGIN:VEVENT');
    
    for (const block of eventBlocks) {
      if (block.includes('UID:') && block.includes('RRULE:')) {
        const uidMatch = block.match(/UID:([^\r\n]+)/);
        const rruleMatch = block.match(/RRULE:([^\r\n]+)/);
        
        if (uidMatch && rruleMatch) {
          const fullUid = uidMatch[1].trim();
          const baseUid = fullUid.split('--')[0]; // Get the base UID before the --
          rruleMap.set(baseUid, rruleMatch[1].trim());
        }
      }
    }
    
    console.log(`CalendarService: Found ${rruleMap.size} recurring events in raw ICS data`);
    
    // Extract source name from URL
    const urlParts = sourceUrl.split('/');
    const filename = urlParts[urlParts.length - 1];
    const sourceName = filename.replace('.ics', '').replace(/-/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    // Generate session ID for this run
    const sessionId = DateTime.now().toFormat('yyyy-MM-dd') + '_' + Date.now();
    
    const today = DateTime.now().startOf('day');
    
    const eventsByDayPattern = new Map();
    const lines = icsContent.split('\n').map(line => line.trim());
    
    let currentEvent = null;
    let inEvent = false;
    let totalProcessed = 0;
    let futureEvents = 0;
    let pastEvents = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line === 'BEGIN:VEVENT') {
        inEvent = true;
        currentEvent = {};
      } else if (line === 'END:VEVENT' && inEvent) {
        if (currentEvent && Object.keys(currentEvent).length > 0) {
          totalProcessed++;
          
          // Handle recurrence rules
          const baseUid = currentEvent.uid ? currentEvent.uid.split('--')[0] : '';
          const rawRrule = rruleMap.get(currentEvent.uid) || rruleMap.get(baseUid);
          const isRecurringEvent = rawRrule || currentEvent.rrule;
          
          // For recurring events, keep them even if the start date is in the past
          // For non-recurring events, only include if they're in the future
          if (!isRecurringEvent && currentEvent.startDate) {
            const eventTimezone = currentEvent.startTimezone || 'America/New_York';
            const todayInEventTz = today.setZone(eventTimezone);
            if (currentEvent.startDate < todayInEventTz) {
              pastEvents++;
              currentEvent = null;
              inEvent = false;
              continue;
            }
          }
          futureEvents++;
          
          // Process the event
          this.processEvent(currentEvent, rawRrule, isRecurringEvent, today, eventsByDayPattern, sourceName, sessionId);
        }
        currentEvent = null;
        inEvent = false;
      } else if (inEvent && line.includes(':')) {
        const colonIndex = line.indexOf(':');
        const property = line.substring(0, colonIndex);
        const value = line.substring(colonIndex + 1);
        
        // Handle common VEVENT properties
        if (property.startsWith('DTSTART')) {
          const timezone = this.extractTimezone(line);
          currentEvent.startDate = this.parseIcsDate(value, timezone);
          currentEvent.startTimezone = timezone;
        } else if (property.startsWith('DTEND')) {
          const timezone = this.extractTimezone(line);
          currentEvent.endDate = this.parseIcsDate(value, timezone);
          currentEvent.endTimezone = timezone;
        } else {
          switch (property) {
            case 'SUMMARY':
              currentEvent.summary = value;
              break;
          case 'DESCRIPTION':
              currentEvent.description = value;
              break;
            case 'LOCATION':
              currentEvent.location = value;
              break;
            case 'UID':
              currentEvent.uid = value;
              break;
            case 'STATUS':
              currentEvent.status = value;
              break;
            case 'RRULE':
              currentEvent.rrule = value;
              break;
            case 'CATEGORIES':
              currentEvent.categories = value;
              break;
            case 'CREATED':
              currentEvent.created = this.parseIcsDate(value, 'UTC');
              break;
            case 'LAST-MODIFIED':
              currentEvent.lastModified = this.parseIcsDate(value, 'UTC');
              break;
            case 'X-PUB-DEADLINE-OFFSET':
              // Parse the deadline offset (number of days from run date to submission deadline)
              currentEvent.deadlineOffset = parseInt(value) || 0;
              break;
            default:
              // Store other properties in a generic way
              if (!currentEvent.otherProperties) {
                currentEvent.otherProperties = {};
              }
              currentEvent.otherProperties[property] = value;
          }
        }
      }
    }
    
    // Convert the map to an array
    const parsedEvents = Array.from(eventsByDayPattern.values());
    
    const recurringCount = parsedEvents.filter(e => e.isRecurring).length;
    const oneTimeCount = parsedEvents.length - recurringCount;
    
    console.log(`CalendarService: Processing Summary:`);
    console.log(`Total VEVENT entries processed: ${totalProcessed}`);
    console.log(`Past events filtered out: ${pastEvents}`);
    console.log(`Future events found: ${futureEvents}`);
    console.log(`Final unique events after deduplication: ${parsedEvents.length}`);
    console.log(`   - ${recurringCount} recurring events`);
    console.log(`   - ${oneTimeCount} one-time events`);
    console.log(`Session ID: ${sessionId}`);

    return parsedEvents;
  }

  /**
   * Process individual event with recurring logic
   */
  processEvent(currentEvent, rawRrule, isRecurringEvent, today, eventsByDayPattern, defaultSourceName, sessionId) {
    // Extract source from categories if available, otherwise use default
    let eventSource = defaultSourceName;
    if (currentEvent.categories) {
      // Convert categories like "lee-enterprises-incorporated-ppm" to "Lee Enterprises Incorporated Ppm"
      eventSource = currentEvent.categories
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
    
    let eventStartTime = currentEvent.startDate; // Already parsed with timezone
    let eventEndTime = currentEvent.endDate || currentEvent.startDate;
    const eventTimezone = currentEvent.startTimezone || 'America/New_York';
    
    // Convert today to the event's timezone for proper comparison
    const todayInEventTz = today.setZone(eventTimezone);
    
    // If this is a recurring event with a past start date, adjust to the next future occurrence
    if (isRecurringEvent && eventStartTime < todayInEventTz) {
      const eventDayOfWeek = eventStartTime.weekday; // Luxon weekday (1=Monday, 7=Sunday)
      const todayDayOfWeek = todayInEventTz.weekday;
      
      // Calculate days until the next occurrence of this day of week
      let daysToAdd = (eventDayOfWeek - todayDayOfWeek + 7) % 7;
      if (daysToAdd === 0) daysToAdd = 7; // If it's the same day, move to next week
      
      const nextOccurrence = todayInEventTz.plus({ days: daysToAdd }).set({
        hour: eventStartTime.hour,
        minute: eventStartTime.minute,
        second: eventStartTime.second
      });
      
      const duration = eventEndTime.diff(eventStartTime);
      const nextEndTime = nextOccurrence.plus(duration);
      
      eventStartTime = nextOccurrence;
      eventEndTime = nextEndTime;
    }
    
    const timeKey = `${eventStartTime.hour}:${eventStartTime.minute.toString().padStart(2, '0')}`;
    const baseUid = currentEvent.uid ? currentEvent.uid.split('--')[0] : '';
    
    // If this is a recurring event, create separate events for each day in the RRULE
    if (isRecurringEvent) {
      const dayNames = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
      let daysInRule = [];
      
      if (rawRrule && rawRrule.includes('BYDAY=')) {
        const bydayMatch = rawRrule.match(/BYDAY=([^;]+)/);
        if (bydayMatch) {
          daysInRule = bydayMatch[1].split(',');
        }
      }
      
      // If no BYDAY found, default to just this event's day
      if (daysInRule.length === 0) {
        daysInRule = [dayNames[eventStartTime.weekday === 7 ? 0 : eventStartTime.weekday]]; // Convert Luxon weekday to JS weekday
      }
      
      // Create a recurring event for each day in the rule
      for (const day of daysInRule) {
        const dayIndex = dayNames.indexOf(day);
        if (dayIndex === -1) continue;
        
        const dayPatternKey = `${baseUid}_${dayIndex}_${timeKey}`;
        
        if (!eventsByDayPattern.has(dayPatternKey)) {
          const singleDayRrule = `RRULE:FREQ=WEEKLY;BYDAY=${day}`;
          
          const parsedEvent = {
            summary: currentEvent.summary || 'Untitled Event',
            description: `${currentEvent.description || ''}\n\nSource: ${eventSource}\noriginalUuid: ${currentEvent.uid}\nsessionId: ${sessionId}`,
            start: {
              dateTime: eventStartTime.toISO(),
              timeZone: eventTimezone
            },
            end: {
              dateTime: eventEndTime.toISO(),
              timeZone: currentEvent.endTimezone || eventTimezone
            },
            recurrence: [singleDayRrule],
            source: eventSource,
            originalUid: currentEvent.uid,
            sessionId: sessionId,
            isRecurring: true,
            deadlineOffset: currentEvent.deadlineOffset !== undefined ? currentEvent.deadlineOffset : 2, // Default to 2 days if not specified
            // Legacy fields for backward compatibility
            startDate: eventStartTime.toISO(),
            endDate: eventEndTime.toISO(),
            uid: currentEvent.uid
          };
          
          eventsByDayPattern.set(dayPatternKey, parsedEvent);
        }
      }
    } else {
      // For non-recurring events, create a unique key and add them directly
      const oneTimeKey = `${currentEvent.uid}_${eventStartTime.toMillis()}`;
      if (!eventsByDayPattern.has(oneTimeKey)) {
        const parsedEvent = {
          summary: currentEvent.summary || 'Untitled Event',
          description: `${currentEvent.description || ''}\n\nSource: ${eventSource}\noriginalUuid: ${currentEvent.uid}\nsessionId: ${sessionId}`,
          start: {
            dateTime: eventStartTime.toISO(),
            timeZone: eventTimezone
          },
          end: {
            dateTime: eventEndTime.toISO(),
            timeZone: currentEvent.endTimezone || eventTimezone
          },
          source: eventSource,
          originalUid: currentEvent.uid,
          sessionId: sessionId,
          isRecurring: false,
          deadlineOffset: currentEvent.deadlineOffset !== undefined ? currentEvent.deadlineOffset : 2, // Default to 2 days if not specified
          // Legacy fields for backward compatibility
          startDate: eventStartTime.toISO(),
          endDate: eventEndTime.toISO(),
          uid: currentEvent.uid
        };
        
        eventsByDayPattern.set(oneTimeKey, parsedEvent);
      }
    }
  }

  /**
   * Extract timezone from ICS date value
   */
  extractTimezone(dateValue) {
    if (dateValue.includes('TZID=')) {
      const tzMatch = dateValue.match(/TZID=([^:]+):/);
      return tzMatch ? tzMatch[1] : 'America/New_York';
    }
    return dateValue.endsWith('Z') ? 'UTC' : 'America/New_York';
  }

  /**
   * Parse ICS date format to Luxon DateTime
   * @param {string} icsDate - Date in ICS format (YYYYMMDDTHHMMSSZ)
   * @param {string} timezone - Timezone to use for parsing (defaults to extracted timezone)
   * @returns {DateTime} Parsed Luxon DateTime object
   */
  parseIcsDate(icsDate, timezone = null) {
    try {
      // Determine the timezone to use
      let zone = timezone;
      if (!zone) {
        // If no timezone provided, determine from the date format
        zone = icsDate.endsWith('Z') ? 'UTC' : 'America/New_York';
      }
      
      // Handle basic YYYYMMDD format
      if (icsDate.length === 8) {
        const year = parseInt(icsDate.substring(0, 4));
        const month = parseInt(icsDate.substring(4, 6));
        const day = parseInt(icsDate.substring(6, 8));
        return DateTime.fromObject({ year, month, day }, { zone });
      }
      
      // Handle YYYYMMDDTHHMMSSZ format
      if (icsDate.includes('T')) {
        const dateTimeParts = icsDate.replace('Z', '').split('T');
        const datePart = dateTimeParts[0];
        const timePart = dateTimeParts[1] || '000000';
        
        const year = parseInt(datePart.substring(0, 4));
        const month = parseInt(datePart.substring(4, 6));
        const day = parseInt(datePart.substring(6, 8));
        const hour = parseInt(timePart.substring(0, 2));
        const minute = parseInt(timePart.substring(2, 4));
        const second = parseInt(timePart.substring(4, 6));
        
        // If original date ends with Z, it's UTC regardless of timezone parameter
        const finalZone = icsDate.endsWith('Z') ? 'UTC' : zone;
        return DateTime.fromObject({ year, month, day, hour, minute, second }, { zone: finalZone });
      }
      
      // Fallback: try to parse with Luxon's fromISO
      const parsed = DateTime.fromISO(icsDate);
      return timezone ? parsed.setZone(timezone) : parsed;
    } catch (error) {
      console.error('Error parsing ICS date:', icsDate, error.message);
      return DateTime.now().setZone(timezone || 'America/New_York'); // Return current time as fallback
    }
  }

  /**
   * Fetch and parse ICS file from URL
   * @param {string} icsUrl - URL of the ICS file
   * @returns {Promise<Object>} Object containing parsed events and metadata
   */
  async fetchAndParseIcs(icsUrl) {
    try {
      console.log('CalendarService: Fetching ICS file from:', icsUrl);
      
      const response = await axios.get(icsUrl, {
        headers: {
          'Accept': 'text/calendar, text/plain, */*',
          'User-Agent': 'CalendarService/1.0'
        },
        timeout: 10000 // 10 second timeout
      });

      console.log(`CalendarService: Successfully fetched ICS data (${response.data.length} characters)`);
      
      const events = this.parseIcsContent(response.data, icsUrl);
      const icsName = this.extractIcsName(icsUrl);
      
      const calendarData = {
        name: icsName,
        url: icsUrl,
        events: events,
        eventCount: events.length,
        fetchedAt: DateTime.now().toISO(),
        rawContent: response.data,
        // Enhanced summary data
        recurringEvents: events.filter(e => e.isRecurring).length,
        oneTimeEvents: events.filter(e => !e.isRecurring).length,
        sessionId: events.length > 0 ? events[0].sessionId : null
      };

      // Log summary like the customer's code
      console.log(`\nCalendarService: Event Summary:`);
      console.log(`Found ${events.length} upcoming events`);
      
      if (events.length > 0) {
        console.log(`Source: ${events[0].source}`);
        console.log(`Session ID: ${events[0].sessionId}`);
        console.log(`\nUpcoming events:`);
        
        events.slice(0, 5).forEach((event, index) => {
          const startDate = DateTime.fromISO(event.start.dateTime);
          const recurringText = event.isRecurring ? ' [RECURRING]' : '';
          console.log(`  ${index + 1}. ${event.summary} - ${startDate.toLocaleString(DateTime.DATE_SHORT)}${recurringText}`);
        });
        
        if (events.length > 5) {
          console.log(`  ... and ${events.length - 5} more events`);
        }
      }

      console.log(`CalendarService: Parsed ${events.length} events from ${icsName}`);
      return calendarData;
      
    } catch (error) {
      console.error('CalendarService: Error fetching ICS file:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response headers:', error.response.headers);
      }
      throw error;
    }
  }

  /**
   * Get calendar data from cache or fetch from URL
   * @param {string} icsUrl - URL of the ICS file
   * @returns {Promise<Object>} Cached or freshly fetched calendar data
   */
  async getCalendar(icsUrl) {
    const icsName = this.extractIcsName(icsUrl);
    const cacheKey = `calendar_${icsName}`;
    
    // Check cache first
    const cachedData = this.cache.get(cacheKey);
    if (cachedData) {
      console.log(`CalendarService: Returning cached calendar data for ${icsName}`);
      return cachedData;
    }

    // Fetch and cache new data
    try {
      const calendarData = await this.fetchAndParseIcs(icsUrl);
      this.cache.set(cacheKey, calendarData);
      console.log(`CalendarService: Cached calendar data for ${icsName}`);
      return calendarData;
    } catch (error) {
      console.error(`CalendarService: Failed to fetch calendar ${icsName}:`, error.message);
      throw error;
    }
  }

  /**
   * Get calendar data from cache only (no fetch)
   * @param {string} icsUrl - URL of the ICS file
   * @returns {Object|null} Cached calendar data or null
   */
  getCachedCalendar(icsUrl) {
    const icsName = this.extractIcsName(icsUrl);
    const cacheKey = `calendar_${icsName}`;
    return this.cache.get(cacheKey) || null;
  }

  /**
   * Clear specific calendar from cache
   * @param {string} icsUrl - URL of the ICS file
   * @returns {boolean} True if cleared, false if not found
   */
  clearCalendarCache(icsUrl) {
    const icsName = this.extractIcsName(icsUrl);
    const cacheKey = `calendar_${icsName}`;
    return this.cache.del(cacheKey) > 0;
  }

  /**
   * Clear all calendars from cache
   * @returns {Array<string>} Array of cleared cache keys
   */
  clearAllCalendars() {
    const keys = this.cache.keys();
    const calendarKeys = keys.filter(key => key.startsWith('calendar_'));
    this.cache.del(calendarKeys);
    console.log(`CalendarService: Cleared ${calendarKeys.length} calendars from cache`);
    return calendarKeys;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const keys = this.cache.keys();
    const calendarKeys = keys.filter(key => key.startsWith('calendar_'));
    
    return {
      totalCalendars: calendarKeys.length,
      cacheKeys: calendarKeys,
      cacheStats: this.cache.getStats()
    };
  }

  /**
   * Main function to retrieve and parse ICS data (matches customer's interface)
   * @param {string} icsUrl - URL of the ICS file
   * @returns {Promise<Array>} Array of parsed events
   */
  async retrieveAndParseIcs(icsUrl) {
    try {
      if (!icsUrl) {
        throw new Error("ICS URL is required");
      }
      
      console.log(`CalendarService: Retrieving and parsing ICS from: ${icsUrl}`);
      
      // Get calendar data (this will cache it automatically)
      const calendarData = await this.getCalendar(icsUrl);
      
      // Return just the events array to match customer's interface
      return calendarData.events;
      
    } catch (error) {
      console.error("CalendarService: Error retrieving and parsing ICS:");
      console.error("Error message:", error.message);
      throw error;
    }
  }

  /**
   * Find events by date range
   * @param {string} icsUrl - URL of the ICS file
   * @param {Date} startDate - Start date for search
   * @param {Date} endDate - End date for search
   * @returns {Promise<Array>} Array of events in date range
   */
  async findEventsByDateRange(icsUrl, startDate, endDate) {
    const calendarData = await this.getCalendar(icsUrl);
    
    return calendarData.events.filter(event => {
      if (!event.startDate) return false;
      
      const eventStart = DateTime.fromISO(event.startDate);
      const rangeStart = DateTime.fromJSDate(startDate);
      const rangeEnd = DateTime.fromJSDate(endDate);
      return eventStart >= rangeStart && eventStart <= rangeEnd;
    });
  }
}

module.exports = new CalendarService();