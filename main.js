const BeamClient = require('beam-client-node');
const BeamSocket = require('beam-client-node/lib/ws');
const config = require('./config');
const firebase = require('firebase'); // <- is this necessary with firebase-admin?
const admin = require('firebase-admin');
const fs = require('fs');
var serviceAccount = require('./effbot-key.json');
var gameConfig = require('./game-config.json');

const botToken = config.token;
const username = config.username;

let userInfo;
let targetChannelId;
var botActive = true;
var subNumber = gameConfig.subNumber;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: config.firebaseURL
})

var db = admin.database();
var ref = db.ref('/users');

const client = new BeamClient();

client.use('oauth', {
  tokens: {
    access: botToken,
    expires: Date.now() + (365 * 24 * 60 * 60 * 1000)
  },
});

client.request('GET', 'users/current').then(response => {
  console.log(response.body);
  userInfo = response.body;
  return client.request('GET', 'channels/' + username).then(response2 => {
    targetChannelId = response2.body.id;
    return client.chat.join(targetChannelId);
  })
})
.then(response => {
  const body = response.body;
  console.log(body);
  console.log(userInfo.channel.id);
  return createChatSocket(userInfo.id, targetChannelId, body.endpoints, body.authkey);
})
.catch(error => {
  console.log("Sorry, an error occurred: ", error);
});

function createChatSocket(userId, channelId, endpoints, authkey) {
  const socket = new BeamSocket(endpoints).boot();

      var autoMessage = setInterval(function(){ socket.call('msg', ['Howdy Folks! I am EffBot, EffingController\'s custom chat bot! Type !help for a list of commands.']); }, (5*60*1000));

      socket.on('ChatMessage', data => {
        if (botActive === true) {

          if (data.message.message[0].data.toLowerCase().startsWith('!shutdown') && (data.user_name === 'EffingController') )
          {
            socket.call('msg', ['Shutting the Eff down!']);
            clearInterval(autoMessage);
            botActive = false;
          }

          if (data.message.message[0].data.toLowerCase().startsWith('!help')) {
            socket.call('whisper', [data.user_name, "Here's a list of commands: !help, !links"])
          }

          if (data.message.message[0].data.toLowerCase().startsWith('!links')) {
            socket.call('whisper', [data.user_name, 'YOUTUBE: www.youtube.com/effingcontroller | TWITTER: @effingctrlr | PATREON: www.patreon.com/effingcontroller | STREAMJAR: streamjar.tv/tip/effingcontroller | YOU\'RE WELCOME.'])
          }

          if (data.message.message[0].data.toLowerCase().startsWith('!enlist')) {
            var userRef = db.ref("users/" + data.user_name.toLowerCase());
            userRef.on("value", function(snapshot){
              if (snapshot.val() === null) {
                subNumber ++;
                boatNum = "U-" + subNumber.toString();
                userRef.set({
                  "boat": boatNum,
                  "boatClass": "Type II",
                  "torpedoes": 5,
                  "renown": 0
                })
                socket.call('whisper', [data.user_name, "Welcome aboard, captain!"]);
                var shipNameObj = { "subNumber": subNumber};
                fs.writeFile("./game-config.json", JSON.stringify(shipNameObj), (err) => {
                  if (err) {
                    console.error(err);
                    return;
                  };
                  console.log("Sub number updated");
                });
              }
              else {
                socket.call('whisper', [data.user_name, 'You\'re already enlisted!']);
              }
            })
          }

          /* --- This is a test function to see if the sub number gets iterated and then saved to a JSON config file
          if (data.message.message[0].data.toLowerCase().startsWith('!iterate')) {
            subNumber ++;
            console.log(subNumber);
            var shipNameObj = { "subNumber": subNumber};
            fs.writeFile("./game-config.json", JSON.stringify(shipNameObj), (err) => {
              if (err) {
                console.error(err);
                return;
              };
              console.log("Sub number updated");
            })
          } */

          if (data.message.message[0].data.toLowerCase().startsWith('!status')) {
            var userRef = db.ref("users/" + data.user_name.toLowerCase());
            //should this use child(data.user_name.toLowerCase()).once('value') ??
            userRef.on("value", function(snapshot){
              if (snapshot.val() === null) {
                console.log("!status command failed for " + data.user_name.toLowerCase() );
                socket.call('whisper', [data.user_name, 'Sorry, it looks like you haven\'t enlisted yet. Type !enlist to join the Effing Navy!']);
              }
              else {
                var userInfo = snapshot.val();
                socket.call('whisper', [data.user_name, 'Your boat is called the ' + userInfo.boat + ", a " + userInfo.boatClass + " submarine. She's armed with " + userInfo.torpedoes + " torpedoes. You currently have " + userInfo.renown + " points of renown."]);
                console.log(snapshot.key, "\n\n");
                console.log(snapshot.ref.toString(), "\n\n");
                console.log(snapshot.val());
              }
            })
          }
        }
      })


  socket.on('error', error => {
    console.error('Socket error: ', error);
  });

  return socket.auth(channelId, userId, authkey)
  .then(() => {
    console.log('Authentication successful.');
  });
}
