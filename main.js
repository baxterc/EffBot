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
let activeShip;
var botActive = true;
var gameState = false;
var shipSighted = false;
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

      var autoMessage = setInterval(function(){ socket.call('msg', ['Howdy Folks! I am EffBot, EffingController\'s digital manservant! Type !help for a list of commands.']); }, (5*60*1000));

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
            userRef.once("value", function(snapshot){
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

          if (data.message.message[0].data.toLowerCase().startsWith('!status')) {
            var userRef = db.ref("users/" + data.user_name.toLowerCase());
            //should this use child(data.user_name.toLowerCase()).once('value') ??
            userRef.once("value", function(snapshot){
              if (snapshot.val() === null) {
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


          if (data.message.message[0].data.toLowerCase().startsWith('!startpatrol') && data.user_name === config.username && gameState === false) {
            gameStart();
          }

          if (data.message.message[0].data.toLowerCase().startsWith('!endpatrol') && data.user_name === config.username && gameState === true) {
            gameState = false;
            console.log("Game ended!");
          }

          if (data.message.message[0].data.toLowerCase().startsWith('!spawn') && data.user_name === config.username && gameState === true) {
            createTarget()
          }

          if (data.message.message[0].data.toLowerCase().startsWith('!fire')){

            // game is not started;
            if (gameState === false) {
              socket.call('whisper', [data.user_name, 'The game isn\'t running ya goober!']);
            }

            else {
              var userRef = db.ref("users/" + data.user_name.toLowerCase());
              userRef.once("value", function(snapshot){

                // userRef should be null if the player hasn't used the "!enlist" command.
                if (snapshot.val() === null) {
                  socket.call('whisper', [data.user_name, 'Sorry, it looks like you haven\'t enlisted yet. Type !enlist to join the Effing Navy!']);
                }

                else {
                  if (shipSighted === false) {
                    var playerSub = snapshot.val();
                    //player has no torpedoes; no torpedo fired, but the player gets ridiculed.
                    if(playerSub.torpedoes <= 0) {
                      socket.call('msg', ['@' + data.user_name + ' is all out of torpedoes! What a dingus!']);
                    }
                    //game started, no ship in sight, but player has a torpedo; a torpedo is fired at nothing.
                    else {
                      console.log("fire triggered with no ship");
                      socket.call('msg', ['@' + data.user_name + ' got excited and shot a torpedo too early! Don\'t worry, it happens to all of us.']);
                      var torps = playerSub.torpedoes - 1;
                      console.log(torps)
                      userRef.set({
                        "boat": playerSub.boat,
                        "boatClass": playerSub.boatClass,
                        "torpedoes": torps,
                        "renown": playerSub.renown
                      });
                    }
                  }

                  else {
                    var playerSub = snapshot.val();
                    //player has no torpedoes; no torpedo fired, but the player gets ridiculed.
                    if(playerSub.torpedoes <= 0) {
                      socket.call('msg', ['@' + data.user_name + ' is all out of torpedoes! What a dingus!']);
                    }
                    //game is live, player is defined and has a torpedo, ship is in sight -- calculate whether a hit is registered
                    else {
                      console.log("fire triggered with ship sighted");
                      var torps = playerSub.torpedoes - 1;
                      console.log(torps)
                      userRef.set({
                        "boat": playerSub.boat,
                        "boatClass": playerSub.boatClass,
                        "torpedoes": torps,
                        "renown": playerSub.renown
                      });
                      //for now, !fire will result in a hit and destruction of target
                      shipDestroyed(data.user_name, activeShip.tonnage);
                    }
                  }
                }
              })
            }
/*
            // game started, but no ship in sight -- starts by checking the DB to see if the player is even registered for the game.
            if (gameState === true && shipSighted === false) {
              var userRef = db.ref("users/" + data.user_name.toLowerCase());
              userRef.once("value", function(snapshot){

                // userRef should be null if the player hasn't used the "!enlist" command.
                if (snapshot.val() === null) {
                  socket.call('whisper', [data.user_name, 'Sorry, it looks like you haven\'t enlisted yet. Type !enlist to join the Effing Navy!']);
                }

                // userRef should have a value if the player has enlisted. From here, check to see if a torpedo is subtracted...
                else {
                  var playerSub = snapshot.val();

                  //player has no torpedoes; no torpedo fired, but the player gets ridiculed.
                  if(playerSub.torpedoes <= 0) {
                    socket.call('msg', ['@' + data.user_name + ' is all out of torpedoes! What a dingus!']);
                  }

                  //game started, no ship in sight, but player has a torpedo; a torpedo is fired at nothing.
                  else {
                    console.log("fire triggered with no ship");
                    socket.call('msg', ['@' + data.user_name + ' got excited and shot a torpedo too early! Don\'t worry, it happens to all of us.']);
                    var torps = playerSub.torpedoes - 1;
                    console.log(torps)
                    userRef.set({
                      "boat": playerSub.boat,
                      "boatClass": playerSub.boatClass,
                      "torpedoes": torps,
                      "renown": playerSub.renown
                    });
                  }
                }
              })
            }
            //game started and ship is in sight -- check to see if player is registered -- refactor so that this branches to the other logic checks
            if (gameState === true && shipSighted === true) {
              var userRef = db.ref("users/" + data.user_name.toLowerCase());
              userRef.once("value", function(snapshot){

                // userRef should be null if the player hasn't used the "!enlist" command.
                if (snapshot.val() === null) {
                  socket.call('whisper', [data.user_name, 'Sorry, it looks like you haven\'t enlisted yet. Type !enlist to join the Effing Navy!']);
                }

                // userRef should have a value if the player has enlisted. From here, check to see if a torpedo is subtracted...
                else {
                  var playerSub = snapshot.val();

                  //player has no torpedoes; no torpedo fired, but the player gets ridiculed.
                  if(playerSub.torpedoes <= 0) {
                    socket.call('msg', ['@' + data.user_name + ' is all out of torpedoes! What a dingus!']);
                  }

                  //game is live, player is defined and has a torpedo, ship is in sight -- calculate whether a hit is registered
                  else {
                    console.log("fire triggered with ship sighted");
                    var torps = playerSub.torpedoes - 1;
                    console.log(torps)
                    userRef.set({
                      "boat": playerSub.boat,
                      "boatClass": playerSub.boatClass,
                      "torpedoes": torps,
                      "renown": playerSub.renown
                    });
                    //for now, !fire will result in a hit and destruction of target
                    shipDestroyed(data.user_name, activeShip.tonnage);
                  }
                }
              })
            }
            */
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

  function gameStart() {
    console.log("Game started!");
    gameState = true;
    socket.call('msg', ['The patrol has begun! Destroy any enemy ships you encounter!']);
    var shipInterval = Math.floor(1+ (Math.random() * config.shipTime));
    console.log(shipInterval);
    setTimeout(function(){createTarget()}, 5000);
  }

  function createTarget() {
    shipSighted = true;
    var shipSelect = Math.floor(Math.random() * 10);
    console.log('createTarget called');
    if (shipSelect <= 4) {
      shipTonnage = Math.floor(1000 + (Math.random() * 500));
      activeShip = { shipClass: 'Small Freighter', tonnage: shipTonnage }
    } else if (shipSelect > 4 && shipSelect <= 6) {
      shipTonnage = Math.floor(4000 + (Math.random() * 1000));
      activeShip = { shipClass: 'Medium Cargo', tonnage: shipTonnage }
    } else if (shipSelect > 6 && shipSelect <= 7) {
      shipTonnage = Math.floor(10000 + (Math.random() * 2000));
      activeShip = { shipClass: 'Large Cargo', tonnage: shipTonnage }
    } else if (shipSelect === 8) {
      shipTonnage = Math.floor(15000 + (Math.random() * 2500));
      activeShip = { shipClass: 'Passenger Liner', tonnage: shipTonnage }
    } else {
      shipTonnage = Math.floor(20000 + (Math.random() * 5000));
      activeShip = { shipClass: 'Battleship', tonnage: shipTonnage }
    }
    socket.call('msg', ['ＳＣＨＩＦＦ ＧＥＳＩＣＨＴＥＴ! There\'s an enemy ' + activeShip.shipClass + ' in sight!']);
    console.log(activeShip);
  }

  function shipDestroyed(username, renown) {
    var userRef = db.ref("users/" + username.toLowerCase());
    userRef.once("value", function(snapshot){
      var playerSub = snapshot.val()
      shipSighted = false;
      activeShip = null;
      socket.call('msg', ['Target destroyed! ' + username + " receives " + renown + " points of renown!"]);
      userRef.set({
        "boat": playerSub.boat,
        "boatClass": playerSub.boatClass,
        "torpedoes": playerSub.torpedoes,
        "renown": playerSub.renown + renown
      });
    })
  }
}
