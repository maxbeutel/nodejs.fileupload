require.paths.push(__dirname + '/node_modules');

var http = require('http'),
    io = require('socket.io')
    redis = require('redis'),
    express = require('express');



var app = express.createServer();

app.get('/', function(req, res){
    res.send('Nothing to see here');
});

app.listen(3030);


var socket = io.listen(app);
socket.on('connection', function(client) {
    var redisClient = redis.createClient();

    client.on('message', function(message) {
        console.log('### received message', message);

        // check if session exists for connected user
        // if authentication succeeded, subscribe to redis channel
        if (message.type == 'authentication') {
            var sessionId = message.sessionId;

            redisClient.exists(sessionId, function(err, res) {
                // authentication succeeded
                if (res) {
                    redisClient.on('message', function(channel, message) {
                        if (channel != 'upload:session:' + client.sessionId) {
                            return;
                        }

                        console.log('### received pubsub message on upload:session:' + client.sessionId, message);
                    });

                    redisClient.subscribe('upload:session:' + client.sessionId);
                    client.send({ type: 'authentication-success', uploadSession: client.sessionId });
                // authentication failed
                } else {
                    client.send({ type: 'authentication-failed' });
                }
            });
        }
    });

});


