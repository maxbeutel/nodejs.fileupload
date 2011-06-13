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

var redisPubSubClient = redis.createClient();
var redisDataClient = redis.createClient();

var socket = io.listen(app);
// we got a new client connected, wait for client to send authenticaction request
socket.on('connection', function(client) {
    client.on('message', function(message) {
        console.log('### received message', message);

        // check if session exists for connected user
        // if authentication succeeded, subscribe to redis channel
        if (message.type == 'authentication') {
            var sessionId = message.sessionId;

            redisDataClient.exists(sessionId, function(err, res) {
                // authentication failed
                if (!res) {
                    client.send({ type: 'authentication-failed' });
                    return;
                }

                // fetch session data store upload session id in express session
                redisDataClient.get(sessionId, function(err, res) {
                    var uploadSessionId = client.sessionId;

                    var sessionData = JSON.parse(res);
                    sessionData.uploadSessionId = uploadSessionId;

                    // @TODO dont use magic number here for session timeout
                    redisDataClient.setex(sessionId, 14400, JSON.stringify(sessionData), function() {
                        // session data was set, subscribe to channel
                        redisPubSubClient.on('message', function(channel, message) {
                            if (channel != 'upload:session:' + uploadSessionId) {
                                return;
                            }

                            message = JSON.parse(message);

                            console.log('### received pubsub message on upload:session:' + uploadSessionId, message);

                            //
                            // handle specific message types, pass message through to client
                            //

                            if (message.type == 'upload-progress') {
                                // nothing to do for us for now
                            }

                            if (message.type == 'upload-failed') {
                                // this totally didn´t work, unsubscribe from channel, let client handle error
                                redisPubSubClient.unsubscribe('upload:session:' + uploadSessionId);
                            }

                            if (message.type == 'upload-success') {
                                // we´re done here, unsubscribe from channel
                                redisPubSubClient.unsubscribe('upload:session:' + uploadSessionId);
                            }

                            client.send(message);
                        });

                        redisPubSubClient.subscribe('upload:session:' + uploadSessionId);

                        client.send({ type: 'authentication-success' });
                    });
                });
            });
        }
    });

});


