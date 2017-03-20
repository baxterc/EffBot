const BeamClient = require('beam-client-node');
const BeamSocket = require('beam-client-node/lib/ws');
const config = require('./config');
const firebase = require('firebase'); // <- is this necessary with firebase-admin?
const admin = require('firebase-admin');
const fs = require('fs');
var serviceAccount = require('./effbot-key.json');
var gameConfig = require('./game-config.json');

const botToken = config.token;
const ownerName = config.username;

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
//var ref = db.ref('/users');

const client = new BeamClient();

client.use('oauth', {
  tokens: {
    access: botToken,
    expires: Date.now() + (365 * 24 * 60 * 60 * 1000)
  },
});

client.request('GET', 'users/current').then(response => {
  userInfo = response.body;
  return client.request('GET', 'channels/' + ownerName).then(response2 => {
    targetChannelId = response2.body.id;
    return client.chat.join(targetChannelId);
  })
})
.then(response => {
  const body = response.body;
  return createChatSocket(userInfo.id, targetChannelId, body.endpoints, body.authkey);
})
.catch(error => {
  console.log("Sorry, an error occurred: ", error);
});

function createChatSocket(userId, channelId, endpoints, authkey) {
  const socket = new BeamSocket(endpoints).boot();
      var autoMessage = setInterval(function(){ socket.call('msg', ['Howdy Folks! I am EffBot, EffingController\'s digital manservant! Type !help for a list of commands.']); }, (5*60*1000)); // this should only fire if the bot is actuve
      socket.on('ChatMessage', data => {
        if (botActive === true) {
          if (data.message.message[0].data.toLowerCase().startsWith('!shutdown') && (data.user_name === ownerName) )
          {
            socket.call('msg', ['Shutting the Eff down!']);
            clearInterval(autoMessage);
            botActive = false;
          }

          if (data.message.message[0].data.toLowerCase().startsWith('!help')) {
            socket.call('whisper', [data.user_name, "Here's a list of commands: !help, !links, !addquote"])
          }

          if (data.message.message[0].data.toLowerCase().startsWith('!links')) {
            socket.call('whisper', [data.user_name, 'YOUTUBE: www.youtube.com/effingcontroller | DISCORD: discord.gg/AnZkHTX | TWITTER: @effingctrlr | PATREON: www.patreon.com/effingcontroller | STREAMJAR: streamjar.tv/tip/effingcontroller | YOU\'RE WELCOME.'])
          }

          if (data.message.message[0].data.toLowerCase().startsWith('!enlist')) {
            enlistUser(data.user_name);
          }

          if (data.message.message[0].data.toLowerCase().startsWith('!status')) {
            getStatus(data.user_name);
          }

          if (data.message.message[0].data.toLowerCase().startsWith('!startpatrol') && data.user_name === ownerName && gameState === false) {
            gameStart();
          }

          if (data.message.message[0].data.toLowerCase().startsWith('!endpatrol') && data.user_name === ownerName && gameState === true) {
            gameState = false;
            console.log("Game ended!");
          }

          if (data.message.message[0].data.toLowerCase().startsWith('!spawn') && data.user_name === ownerName && gameState === true) {
            createTarget();
          }

          if (data.message.message[0].data.toLowerCase().startsWith('!fire')){
            resolveShot(data.user_name);
          }
          if (data.message.message[0].data.toLowerCase().startsWith('!addquote')){
            var quoteString = (data.message.message[0].data).slice(9);
            var username = data.user_name;
            saveQuote(username, quoteString.trim());
          }
        }
      })


  socket.on('error', error => {
    console.error('Socket error: ', error);
  });

  return socket.auth(channelId, userId, authkey)
  .then(() => {
    console.log('Authentication successful. EffBot is online!');
  });

  function getStatus(username) {
    var userRef = db.ref("users/" + username.toLowerCase());
    userRef.once("value", function(snapshot){
      if (snapshot.val() === null) {
        socket.call('whisper', [username, 'Sorry, it looks like you haven\'t enlisted yet. Type !enlist to join the Effing Navy!']);
      }
      else {
        var userInfo = snapshot.val();
        socket.call('whisper', [username, 'Your boat is called the ' + userInfo.boat + ", a " + userInfo.boatClass + " submarine. She's armed with " + userInfo.torpedoes + " torpedoes. You currently have " + userInfo.renown + " points of renown."]);
      }
    })
  }

  function enlistUser(username) {
    var userRef = db.ref("users/" + username.toLowerCase());
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
        socket.call('whisper', [username, "Welcome aboard, captain!"]);
        var shipNameObj = { "subNumber": subNumber};
        fs.writeFile("./game-config.json", JSON.stringify(shipNameObj), (err) => {
          if (err) {
            console.error(err);
            return;
          };
        });
      }
      else {
        socket.call('whisper', [username, 'You\'re already enlisted!']);
      }
    })
  }

  function gameStart() {
    console.log("Game started!");
    gameState = true;
    socket.call('msg', ['The patrol has begun! Destroy any enemy ships you encounter!']);
    var shipInterval = Math.floor(1+ (Math.random() * config.shipTime));
    console.log(shipInterval);
    setTimeout(function(){createTarget()}, (shipInterval * 60 * 1000));
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

  function resolveShot(username) {
    // game is not started;
    if (gameState === false) {
      socket.call('whisper', [username, 'The game isn\'t running ya goober!']);
    }
    // game is started;
    else {
      var userRef = db.ref("users/" + username.toLowerCase());
      userRef.once("value", function(snapshot){
        // userRef should be null if the player hasn't used the "!enlist" command.
        if (snapshot.val() === null) {
          socket.call('whisper', [username, 'Sorry, it looks like you haven\'t enlisted yet. Type !enlist to join the Effing Navy!']);
        }
        // user is !enlisted
        else {
          var playerSub = snapshot.val();
          //player has no torpedoes; no torpedo fired, but the player gets ridiculed.
          if(playerSub.torpedoes <= 0) {
            socket.call('msg', ['@' + username + ' is all out of torpedoes! What a dingus!']);
          } else {
            if (shipSighted === false) {
              //game started, no ship in sight, but player has a torpedo; a torpedo is fired at nothing.
              console.log("fire triggered with no ship");
              socket.call('msg', ['@' + username + ' got excited and shot a torpedo too early! Don\'t worry, it happens to all of us.']);
              var torps = playerSub.torpedoes - 1;
              console.log(torps)
              userRef.set({
                "boat": playerSub.boat,
                "boatClass": playerSub.boatClass,
                "torpedoes": torps,
                "renown": playerSub.renown
              });
            }
            // ship has been spawned
            else {
              var shotHit = Math.floor((Math.random() * 4));
              console.log("fire triggered with ship sighted");
              //player misses; 25% chance of a miss, basically
              if (shotHit < 1) {
                var torps = playerSub.torpedoes - 1;
                console.log(torps)
                socket.call('msg', [username + " missed!"]);
                userRef.set({
                  "boat": playerSub.boat,
                  "boatClass": playerSub.boatClass,
                  "torpedoes": torps,
                  "renown": playerSub.renown
                });
              }
              //hit registered
              else {
                shipDestroyed(username, activeShip.tonnage);
              }
            }
          }
        }
      })
    }
  }

  function shipDestroyed(username, renown) {
    var userRef = db.ref("users/" + username.toLowerCase());
    userRef.once("value", function(snapshot){
      var playerSub = snapshot.val()
      var torps = playerSub.torpedoes - 1;
      shipSighted = false;
      activeShip = null;
      socket.call('msg', ['Target destroyed! @' + username + " receives " + renown + " points of renown!"]);
      userRef.set({
        "boat": playerSub.boat,
        "boatClass": playerSub.boatClass,
        "torpedoes": torps,
        "renown": playerSub.renown + renown
      });
      var shipInterval = Math.floor(1+ (Math.random() * config.shipTime));
      console.log(shipInterval);
      setTimeout(function(){createTarget()}, (shipInterval * 60 * 1000));
    })
  }

  function saveQuote(username, quote) {
    var quoteRef = db.ref("quotes/");
    quoteRef.push({
      text: quote,
      user: username
    })
  }
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
