# FUTURE WORK 

### TODOs:

Things necessary for public demo:
1. Multiple user support
2. Persistence
3. ??

Things necessary for full launch:
1. Payment options
2. Landing page / signup flow
3. ??

Features that would be really good to have but are not essential:
1. Multiple phone numbers (one per conversation)
2. ??

-----------

### Implementation Details:

Multiple user support / persistence:

- What needs to be stored? API tokens from users. Anything else? Right now we have a message cache which is done per user. We will want to persist that as well.
- We may hit API rate limits when we're handling multiple users. Unclear how we'd handle that issue if it does exist
- We also need to be associate incoming messages with the phone number they're from
- How do you plan on adding the users to the public demo? Prob just by hand to get it out faster

Data model example:
```
{
  _id: uuid.v4(),
  phoneNumber: string,
  facebookId: string,
  facebookAuthToken: string,
  cachedMessages: {
    [uuid.v4()]: {
      /* message body from Tinder API */
    }
  },
}
```

Application flow: once per minute per user, we:
- retrieve the user and tokens from the DB
- auth as that user
- check for new Tinder messages for the user
- send any new messages to the user