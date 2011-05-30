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
                // authentication failed
                if (!res) {
                    client.send({ type: 'authentication-failed' });
                    return;
                }

                // authentication succeeded
                redisClient.on('message', function(channel, message) {
                    if (channel != 'upload:session:' + client.sessionId) {
                        return;
                    }

                    console.log('### received pubsub message on upload:session:' + client.sessionId, message);
                });

                redisClient.subscribe('upload:session:' + client.sessionId);

                // fetch session data store upload session id in express session
                redisClient.get(sessionId, function(err, res) {
                    var sessionData = JSON.parse(res);
                    sessionData.uploadSessionId = client.sessionId;
                    redisClient.set(sessionId, JSON.stringify(res), function() {
                        // @TODO: send authentication success only after updating session data?
                       client.send({ type: 'authentication-success'/*, uploadSession: client.sessionId*/ });
                    });
                });
                
            });
        }
    });

});


