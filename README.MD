## Tinder-SMS

Tinder-SMS: chat with your Tinder buddies over SMS! Because Tindering in the workplace is never a good idea.

With Tinder-SMS, whenever you receive a Tinder message it will be forwarded to your phone as a text message. Go ahead and have your conversation over text: your responses will be turned into Tinder messages back to your match!

## In practice

![Screenshot](Screenshot.png)

## Setup

No effort has yet been put into making this easy to setup. Sorry 🙃

1. Rename EXAMPLE_TOKENS.js to TEMP_TOKENS.js and provide the necessary configuration. You no longer need to place facebook tokens in this file.
2. Facebook tokens and phone numbers should be placed in a mongo database running. See code for appropriate mongo setup / necessary db schema
3. node app.js
