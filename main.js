const BeamClient = require('beam-client-node');
const BeamSocket = require('beam-client-node/lib/ws');
const config = require('./config');

const botToken = config.token;
const username = config.username;

let userInfo;
let targetChannelId;
var botActive = true;

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
            botActive = false;
            console.log(botActive);
          }

          if (data.message.message[0].data.toLowerCase().startsWith('!help')) {
            console.log(data);
            socket.call('whisper', [data.user_name, "Here's a list of commands: !help, !links"])
          }

          if (data.message.message[0].data.toLowerCase().startsWith('!links')) {
            socket.call('whisper', [data.user_name, 'YOUTUBE: www.youtube.com/effingcontroller | TWITTER: @effingctrlr | PATREON: www.patreon.com/effingcontroller | STREAMJAR: streamjar.tv/tip/effingcontroller | YOU\'RE WELCOME.'])
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
