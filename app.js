'use strict';

const _ = require('lodash');
const async = require('async');
const spawn = require('child_process').spawn;
const moment = require('moment');
const process = require('process');
const request = require('request');
const util = require('util');

const facebookAuthToken = require('./fbAuthToken');
const TEMP_TOKENS = require('./TEMP_TOKENS');

const MongoUrl = 'mongodb://localhost:27017/tinder-messenger';
const MongoClient = require('mongodb').MongoClient;

// require the Twilio module and create a REST client
const twilioId = TEMP_TOKENS.twilioId;
const twilioAuthToken = TEMP_TOKENS.twilioAuthToken;
const client = require('twilio')(twilioId, twilioAuthToken);

const host = 'https://api.gotinder.com'
const baseHeaders = {
  'app_version': '6.9.4',
  'platform': 'ios',
  'content-type': 'application/json',
  'User-agent': 'Tinder/7.5.3 (iPhone; iOS 10.3.2; Scale/2.00)',
};

let tinderSelfId;

const express = require('express')
const app = express()
app.use(express.static('public'))

const bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const MessagingResponse = require('twilio').twiml.MessagingResponse;
app.post('/sms', async (req, res, next) => {
  const messageBody = req.body.Body;
  const senderPhoneNumber = req.body.From;
  const twiml = new MessagingResponse();
  // TODO (nw): figure out how to not have invalid body here (works but Twilio sends annoying email)
  twiml.message('');

  res.writeHead(200, {'Content-Type': 'text/xml'});
  res.end(twiml.toString());

  // TODO (nw): refactor the dupe code
  const db = await util.promisify(MongoClient.connect)(MongoUrl);
  const usersColl = db.collection('users');
  const user = _.first(await usersColl.find({ phoneNumber: senderPhoneNumber }).toArray());
  const { facebookAccessToken, facebookId } = user;
  const [authToken, selfId] = await getAuthToken(facebookAccessToken, facebookId);
  const mostRecentMatch = await getMostRecentMatch(authToken);
  // TODO (nw): it would be good to have a demo mode flag which doesn't actually send messages
  sendMessage(mostRecentMatch._id, messageBody, authToken);
});

app.post('/api/users', async (req, res, next) => {
  console.log('req.body', req.body);
  try {
    const { phoneNumber, facebookUsername, facebookPassword } = req.body;
    const py = spawn('python', ['./get_facebook_tokens.py', facebookUsername, facebookPassword]);
    let tokens = '';
    py.stdout.on('data', function(data) {
      tokens += data;
    });
    py.stdout.on('end', async function() {
      try {
        // TODO (nw): refactor the dupe code
        const { facebookId, facebookAccessToken } = JSON.parse(tokens);
        const db = await util.promisify(MongoClient.connect)(MongoUrl);
        const usersColl = db.collection('users');
        const newUser = { facebookId, facebookAccessToken, phoneNumber };
        usersColl.insert(newUser).then(() => {
          console.log(`added ${JSON.stringify(newUser)} to database`);
          res.sendStatus(200);
        });
      } catch(e) {
        return res.sendStatus(400);
      }
    });
    py.stdout.on('err', function() {
      res.sendStatus(400);
    });
  } catch(e) {
    res.sendStatus(400);
  }
});

app.listen(2674, () => console.log(`${moment().format()}: Example app listening on port 2674!`))

async function sendMessage(matchId, message, facebookAccessToken, facebookId) {
  if (process.env.NODE_ENV === 'DEV') {
    console.log('not sending tinder message due to NODE_ENV=DEV', message);
    return;
  }

  console.log('sending tinder message', message);
  const [authToken, selfId] = await getAuthToken(facebookAccessToken, facebookId);
  const headers = _.extend(baseHeaders, {
    ['X-Auth-Token']: authToken,
  });
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
    headers: baseHeaders,
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

async function getMatches(authToken) {
  const url = `${host}/v2/matches`;
  const headers = _.extend(baseHeaders, {
    ['X-Auth-Token']: authToken,
  });
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

async function getMostRecentMatch(authToken) {
  const matches = await getMatches(authToken);
  return _.first(matches);
}


// Super MVP mode: just check to see if you've received a message in the last 5 minutes
// And set that equal to the poll time
// Ya this is lame and not great...oh well
function checkMatchHasRecentMessage(match) {
  const recencyThreshold = moment().subtract(24, 'months').valueOf();
  const lastMessageSentDate = _.get(match, 'messages[0].sent_date') || 0;
  return moment(lastMessageSentDate).valueOf() > recencyThreshold;
}

async function getNewMessagesForMatch(match, authToken) {
  // TODO (nw): dedupe this
  const db = await util.promisify(MongoClient.connect)(MongoUrl);
  const messagesColl = db.collection('messages');
  // TODO (nw): grab only messages for the specific user
  const allSavedMessages = await messagesColl.find({}).toArray();
  const messageCache = _.keyBy(allSavedMessages, '_id');

  const url = `${host}/v2/matches/${match._id}/messages?count=100&locale=en`;
  const headers = _.extend(baseHeaders, {
    ['X-Auth-Token']: authToken,
  });
  const requestOpts = { url, headers };
  return new Promise((resolve, reject) => {
    request.get(requestOpts, function(err, res, body) {
      if (err) return reject(err);

      const parsedBody = JSON.parse(body);
      // Boooo side effects figure out better pattern here
      // TODO (nw): should be able to just do a _.diff now
      const newMessages = _.filter(parsedBody.data.messages, message => {
        const isNewMessage = !messageCache[message._id];
        // messageCache[message._id] = message;
        return isNewMessage && message.from !== tinderSelfId;
      });
      const newMessagesWithName = _.map(newMessages, message => {
        message.name = match.person.name
        return message;
      });
      if (_.isEmpty(newMessagesWithName)) {
        return resolve([]);
      }
      return messagesColl.insertMany(newMessagesWithName).then(() => resolve(newMessagesWithName));
    });
  });
}

async function sendSMS(body, phoneNumber) {
  if (process.env.NODE_ENV === 'DEV') {
    console.log('not sending SMS due to NODE_ENV=dev', body);
    return;
  }
  console.log('sending SMS', body);
  return client.messages
    .create({
      to: phoneNumber,
      from: TEMP_TOKENS.twilioPhoneNumber,
      body,
    })
    .then((message) => console.log(`Message sent: ${message.sid}`));
}

function generateMessageBody(message) {
  return `From: ${message.name}

    ${message.message}`;
}

async function run(init) {
  // Should be moved out of here; we don't want to connect every run.
  const db = await util.promisify(MongoClient.connect)(MongoUrl);
  const usersColl = db.collection('users');
  const users = await usersColl.find({}).toArray();
  _.each(users, async user => {
    const { facebookAccessToken, facebookId } = user;
    const [authToken, selfId] = await getAuthToken(facebookAccessToken, facebookId);
    tinderSelfId = selfId;
    const matches = await getMatches(authToken);
    const peopleWithNewMessages = _.filter(matches, checkMatchHasRecentMessage);
    const newMessages = await Promise.all(_.map(peopleWithNewMessages, 
      personWithNewMessage => getNewMessagesForMatch(personWithNewMessage, authToken)));
    const formattedMessages = _.map(_.flatten(newMessages), generateMessageBody);
    // Don't send messages the first time we startup: this is just to populate the cache
    if (!init) {
      _.each(formattedMessages, formattedMessage => sendSMS(formattedMessage, user.phoneNumber));
    }
  });
}

run(true);
setInterval(() => {
  run(false);
}, 60000);
