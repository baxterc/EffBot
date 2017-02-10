const BeamClient = require('beam-client-node');
const BeamSocket = require('beam-client-node/lib/ws');
const config = require('./config');

const botToken = config.token;
const username = config.username;

let userInfo;
let targetChannelId;
//var targetChannelId = 440882;

const client = new BeamClient();

client.use('oauth', {
  tokens: {
    access: botToken,
    expires: Date.now() + (365 * 24 * 60 * 60 * 1000)
  },
});

/*client.request('GET', 'channels/' + username ).then(response => {
  targetChannelId = response.body.id;
  console.log('channelId for target chat is: ' + targetChannelId);
})*/

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

  /*socket.on('ChatMessage', data => {
    if (data.message.message[0].data.toLowerCase().startsWith('!ping')) {
      socket.call('msg', [`@${data.user_name} PONG!`]);
      console.log(`Ponged ${data.user_name}`);
    }
  });*/

  socket.on('error', error => {
    console.error('Socket error: ', error);
  });

  return socket.auth(channelId, userId, authkey)
  .then(() => {
    console.log('Authentication successful.');
  });
}
