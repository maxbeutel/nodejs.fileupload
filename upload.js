require.paths.push(__dirname + '/node_modules', __dirname + '/lib');

var express = require('express'),
    redis = require('redis'),
    riak = require('riak-js'),
    form = require('connect-form'),
    fs = require('fs'),
    mime = require('mime'),
    sanitize = require('validator').sanitize,
    sys = require('sys'),
    path = require('path'),
    UploadService = require('upload_service').UploadService,
    exec = require('child_process').exec;

var app = express.createServer(form({keepExtensions: true}));
app.set('view engine', 'jade');

var RedisStore = require('connect-redis');
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({secret: 'oi098ahsd789jlkdasl', store: new RedisStore()}));

var redisPubSubClient = redis.createClient();


// @TODO would be nice to do some round-robin here/later on in order to not always connect to the same node
var riakClient = riak.getClient({host: '127.0.0.1', port: 8010});

// render page with upload form
app.get('/', function(req, res) {
    var sessionId = req.cookies['connect.sid'];
    res.render('index', {sessionId: sessionId});
});


// form
app.get('/upload-form', function(req, res) {
    var sessionId = req.cookies['connect.sid'];
    res.render('upload-form', {sessionId: sessionId});
});


// upload posted file
app.post('/', function(req, res, next) {
    var uploadSessionId = req.session.uploadSessionId;
    var uploadService = new UploadService(req.form);

    uploadService.on('begin', function(fileName) {
        console.log('### UPLOAD BEGINNING', arguments);
        
        redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({ type: 'upload-start', filename: sanitize(fileName).xss() }));
    });

    uploadService.on('progress', function(percent) {
        console.log('### UPLOAD PROGRESSING', arguments);

        redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({ type: 'upload-progress', percent: percent }));
    });

    uploadService.on('failedValidation', function(message) {
        console.log('### UPLOAD VALIDATION FAILED', arguments);
        
        redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({ type: 'upload-failed', error: message }));
        res.redirect('back');
    });

    uploadService.on('failure', function(message) {
        console.log('### UPLOAD FAILED BECAUSE OF SYSTEM ERROR', arguments);

        redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({ type: 'upload-failed', error: message }));
        res.redirect('back');
    });

    uploadService.on('success', function() {
        console.log('### UPLOAD SUCCEEDED', arguments);

        redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({ type: 'upload-success' }));
        res.redirect('back');
    });

    console.log('### Starting upload for: ', uploadSessionId);

    req.form.complete();
});

app.listen(3020);





