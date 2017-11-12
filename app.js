'use strict';

const _ = require('lodash');
const moment = require('moment');
const request = require('request');

const facebookAuthToken = require('./fbAuthToken');

const host = 'https://api.gotinder.com'
const headers = {
  'app_version': '6.9.4',
  'platform': 'ios',
  'content-type': 'application/json',
  'User-agent': 'Tinder/7.5.3 (iPhone; iOS 10.3.2; Scale/2.00)',
};


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

      resolve(JSON.parse(body).token);
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
  const url = `${host}/v2/matches/${match._id}/messages?count=100&locale=en&page_token=MjAxNy0xMS0xMlQwMjo0NToyNC44MzNa`;
  const requestOpts = { url, headers };
  return new Promise((resolve, reject) => {
    request.get(requestOpts, function(err, res, body) {
      if (err) return reject(err);

      const parsedBody = JSON.parse(body);
      // Boooo side effects figure out better pattern here
      const newMessages = _.filter(parsedBody.data.messages, message => {
        const isNewMessage = !messageCache[message._id];
        messageCache[message._id] = message;
        return isNewMessage;
      });

      resolve(newMessages);
    });
  });
}

// TODO (nw): every fucking name here is terrible, fix
async function run() {
  const authToken = await getAuthToken(facebookAuthToken.getFacebookAccessToken(), facebookAuthToken.getFacebookId());
  // TODO (nw): ewwww hacky side effects, fix this
  headers['X-Auth-Token'] = authToken;
  const matches = await getMatches();
  const peopleWithNewMessages = _.filter(matches, checkMatchHasRecentMessage);
  const newMessages = await Promise.all(_.map(peopleWithNewMessages, getNewMessagesForMatch));
}

run();
setInterval(() => {
  run();
}, 5000);
