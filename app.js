'use strict';

const _ = require('lodash');
const moment = require('moment');
const request = require('request');

const facebookAuthToken = require('./fbAuthToken');
const TEMP_TOKENS = require('./TEMP_TOKENS');

// require the Twilio module and create a REST client
const twilioId = TEMP_TOKENS.twilioId;
const twilioAuthToken = TEMP_TOKENS.twilioAuthToken;
const client = require('twilio')(twilioId, twilioAuthToken);

const host = 'https://api.gotinder.com'
const headers = {
  'app_version': '6.9.4',
  'platform': 'ios',
  'content-type': 'application/json',
  'User-agent': 'Tinder/7.5.3 (iPhone; iOS 10.3.2; Scale/2.00)',
};

let tinderSelfId;

const express = require('express')
const app = express()
const bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const MessagingResponse = require('twilio').twiml.MessagingResponse;
app.post('/sms', async (req, res, next) => {
  const messageBody = req.body.Body;
  const twiml = new MessagingResponse();
  twiml.message('');

  res.writeHead(200, {'Content-Type': 'text/xml'});
  res.end(twiml.toString());

  const mostRecentMatch = await getMostRecentMatch();
  sendMessage(mostRecentMatch._id, messageBody);
});

app.listen(1337, () => console.log('Example app listening on port 1337!'))

async function sendMessage(matchId, message) {
  console.log('sending tinder message', message);
  const url = `${host}/user/matches/${matchId}`;
  const requestOpts = {
    url,
    headers,
    body: JSON.stringify({ message }),
  };
  return new Promise((resolve, reject) => {
    request.post(requestOpts, function(err, res, body) {
      if (err) return reject(err);

      resolve();
    });
  });
}

async function getAuthToken(facebook_token, facebook_id, cb) {
  const url = `${host}/auth`;
  const requestOpts = {
    url,
    headers,
    body: JSON.stringify({ facebook_token, facebook_id }),
  };
  // Use a conversion library this sucks
  return new Promise((resolve, reject) => {
    request.post(requestOpts, function(err, res, body) {
      if (err) return reject(err);
      const parsedBody = JSON.parse(body);

      resolve([parsedBody.token, parsedBody.user._id]);
    });
  });
};

async function getMatches() {
  const url = `${host}/v2/matches`;
  const requestOpts = {
    url,
    headers,
  };
  return new Promise((resolve, reject) => {
    request.get(requestOpts, function(err, res, body) {
      if (err) return reject(err);

      resolve(JSON.parse(body).data.matches);
    });
  });
}

async function getMostRecentMatch() {
  const matches = await getMatches();
  return _.first(matches);
}


// Super MVP mode: just check to see if you've received a message in the last 5 minutes
// And set that equal to the poll time
// Ya this is lame and not great...oh well
function checkMatchHasRecentMessage(match) {
  // const recencyThreshold = moment().subtract(5, 'minutes').valueOf();
  const recencyThreshold = moment().subtract(5, 'months').valueOf();
  const lastMessageSentDate = _.get(match, 'messages[0].sent_date') || 0;
  return moment(lastMessageSentDate).valueOf() > recencyThreshold;
}

const messageCache = {};
async function getNewMessagesForMatch(match) {
  const url = `${host}/v2/matches/${match._id}/messages?count=100&locale=en`;
  const requestOpts = { url, headers };
  return new Promise((resolve, reject) => {
    request.get(requestOpts, function(err, res, body) {
      if (err) return reject(err);

      const parsedBody = JSON.parse(body);
      // Boooo side effects figure out better pattern here
      const newMessages = _.filter(parsedBody.data.messages, message => {
        const isNewMessage = !messageCache[message._id];
        messageCache[message._id] = message;
        return isNewMessage && message.from !== tinderSelfId;
      });
      const newMessagesWithName = _.map(newMessages, message => {
        message.name = match.person.name
        return message;
      });

      resolve(newMessagesWithName);
    });
  });
}

async function sendSMS(body) {
  console.log('sending SMS', body);
  return client.messages
    .create({
      to: TEMP_TOKENS.myPhoneNumber,
      from: TEMP_TOKENS.twilioPhoneNumber,
      body,
    })
    .then((message) => console.log(`Message sent: ${message.sid}`));
}

function generateMessageBody(message) {
  return `From: ${message.name}
    
    ${message.message}`;
}

async function run(sendMessages) {
  const [authToken, selfId] = await getAuthToken(facebookAuthToken.getFacebookAccessToken(), facebookAuthToken.getFacebookId());
  tinderSelfId = selfId;
  headers['X-Auth-Token'] = authToken;
  const matches = await getMatches();
  const peopleWithNewMessages = _.filter(matches, checkMatchHasRecentMessage);
  const newMessages = await Promise.all(_.map(peopleWithNewMessages, getNewMessagesForMatch));
  const formattedMessages = _.map(_.flatten(newMessages), generateMessageBody);
  // Don't send messages the first time we startup: this is just to populate the cache
  if (sendMessages) {
    _.each(formattedMessages, sendSMS);
  }
}

run(false);
setInterval(() => {
  run(true);
}, 5000);
