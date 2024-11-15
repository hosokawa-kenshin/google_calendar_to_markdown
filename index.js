const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');
const calendarIds = require('./calendarIds');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}
  
function parseDateString(dateStr, year) {
  const [month, day] = dateStr.split('/').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
  /**
   * Lists events on specified calendars within a given date range.
   * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
   * @param {string} timeMin The start date in ISO format.
   * @param {string} timeMax The end date in ISO format.
   */
async function listEvents(auth, timeMin, timeMax) {
    const calendar = google.calendar({version: 'v3', auth});
    let allEvents = [];
  
    for (const calendarId of calendarIds) {
      const res = await calendar.events.list({
        calendarId: calendarId,
        timeMin: timeMin,
        timeMax: timeMax,
        singleEvents: true,
        orderBy: 'startTime',
      });
      
      const events = res.data.items;
      if (events && events.length > 0) {
        allEvents = allEvents.concat(events.map(event => ({
          start: new Date(event.start.dateTime || event.start.date),
          summary: event.summary,
          calendarId: calendarId
        })));
      }
    }
  
    allEvents.sort((a, b) => a.start - b.start);
  
    console.log('Sorted events:');
    allEvents.forEach(event => {
      const startDate = event.start;
      const month = startDate.getMonth() + 1;
      const day = startDate.getDate();
      const formattedEvent = `+ (${month}/${day}) ${event.summary}`;
      console.log(formattedEvent);
    });
  }

async function listCalendars(auth) {
    const calendar = google.calendar({version: 'v3', auth});
    const res = await calendar.calendarList.list();
    const calendars = res.data.items;
    if (!calendars || calendars.length === 0) {
      console.log('No calendars found.');
      return;
    }
    console.log('Subscribed calendars:');
    calendars.map((cal) => {
      console.log(`${cal.summary} (ID: ${cal.id})`);
    });
}
  
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Please provide a start date and an end date in the format "MM/DD".');
  process.exit(1);
}

// authorize().then(listCalendars).catch(console.error);
const currentYear = new Date().getFullYear();
let startDate = parseDateString(args[0], currentYear);
let endDate = parseDateString(args[1], currentYear);

if (endDate < startDate) {
  endDate = parseDateString(args[1], currentYear + 1);
}

authorize().then((auth) => {
  listEvents(auth, startDate.toISOString(), endDate.toISOString());
}).catch(console.error);