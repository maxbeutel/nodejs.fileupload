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

    uploadService.on('begin', function() {
        console.log('### UPLOAD BEGINNING', arguments);
    });

    uploadService.on('progress', function() {
        console.log('### UPLOAD PROGRESSING', arguments);
    });

    uploadService.on('failedValidation', function() {
        console.log('### UPLOAD VALIDATION FAILED', arguments);
    });

    uploadService.on('failure', function() {
        console.log('### UPLOAD FAILED BECAUSE OF SYSTEM ERROR', arguments);
    });

    uploadService.on('success', function() {
        console.log('### UPLOAD SUCCEEDED', arguments);
    });

    req.form.complete();

    console.log('######');
    return;




    var uploadSessionId = req.session.uploadSessionId;
    var lastPercent = 0;
    var tmpPath = '';

    var validatorsState = {
        filesize: {executed: false, valid: true},
        mimetype: {executed: false, valid: true}
    };

    console.log('### Starting upload for: ', uploadSessionId);

    req.form.on('fileBegin', function catchTmpPath(_, fileInfo) {
        if (fileInfo.path) {
            console.log('### caught tmp path!');

            tmpPath = fileInfo.path;
            
            req.form.removeListener('fileBegin', catchTmpPath);
        }
    });

    req.form.on('fileBegin', function publishUploadStart(_, fileInfo) {
        if (fileInfo.name) {
            console.log('### FILENAME: ', fileInfo.name);

            redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({type: 'upload-start', filename: sanitize(fileInfo.name).xss()}));

            req.form.removeListener('fileBegin', publishUploadStart);
        }
    });

    req.form.on('fileBegin', function validateMimetype(_, fileInfo) {
        if (fileInfo.path) {
            var child = exec('file --mime-type ' + fileInfo.path, function (error, stdout, stderr) {
                validatorsState.mimetype.executed = true;

                var mimetype = stdout.substring(stdout.lastIndexOf(':') + 2, stdout.lastIndexOf('\n'));

                if (!ALLOWED_MIME_TYPES[mimetype]) {
                    validatorsState.mimetype.valid = false;

                    console.log('### ERROR: invalid mimetype');

                    req.form.removeAllListeners('end');
                    req.form.removeAllListeners('progress');
                    req.form.removeAllListeners('fileBegin');

                    redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({type: 'upload-failed', error: 'invalid file type'}));

                    fs.unlinkSync(tmpPath);
                } else {
                    validatorsState.mimetype.valid = true;
                }
            });

            req.form.removeListener('progress', validateMimetype);
        }
    });

    req.form.on('progress', function publishProgress(bytesReceived, bytesExpected) {
        console.log('### PROGRESS ARGS: ', arguments);

        var percent = (bytesReceived / bytesExpected * 100) | 0;

        // dont flood client with messages - check if progress really changed since last time
        if (percent != lastPercent) {
            redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({type: 'upload-progress', percent: percent}));
            console.log('Uploading: %' + percent + '\n');
        }

        lastPercent = percent;
    });

    req.form.on('progress', function validateMaxSize(bytesReceived, bytesExpected) {
        validatorsState.filesize.executed = true;

        if (bytesReceived > MAX_UPLOAD_SIZE) {
            validatorsState.filesize.valid = false;

            console.log('### ERROR: file too large');

            req.form.removeAllListeners('end');
            req.form.removeAllListeners('progress');
            req.form.removeAllListeners('fileBegin');

            redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({type: 'upload-failed', error: 'file too large'}));

            fs.unlinkSync(tmpPath);
        }
    });



    req.form.on('file', function(_, fileInfo) {
        //console.log('#### FILE EVENT');
        //console.log(arguments);

        if (!validatorsState.filesize.executed || !validatorsState.filesize.valid) {
            console.log('### Invalid state: filesize validator not executed or invalid!');

            res.redirect('back');

            return;
        }

        if (!validatorsState.mimetype.executed || !validatorsState.mimetype.valid) {
            console.log('### Invalid state: mimetype validator not executed or invalid!');

            res.redirect('back');

            return;
        }

        console.log('### uploaded to', fileInfo.path);

        path.exists(tmpPath, function(exists) {
            if (exists) {
                console.log('### upload succeeded');

                redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({type: 'upload-success'}));

                res.redirect('back');
            } else {
                console.log('### ERROR: uploaded file does not exists');

                redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({type: 'upload-failed'}));
            }
        });
    });

/*
    req.form.on('end', function() {
        if (!validatorsState.filesize.executed || !validatorsState.filesize.valid) {
            console.log('### Invalid state: filesize validator not executed or invalid!');
            
            res.redirect('back');

            return;
        }

        if (!validatorsState.mimetype.executed || !validatorsState.mimetype.valid) {
            console.log('### Invalid state: mimetype validator not executed or invalid!');

            res.redirect('back');

            return;
        }

        console.log('### uploaded to', tmpPath);

        path.exists(tmpPath, function(exists) {
            if (exists) {
                console.log('### upload succeeded');

                redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({ type: 'upload-success' }));

                res.redirect('back');
            } else {
                console.log('### ERROR: uploaded file does not exists');

                redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({ type: 'upload-failed' }));
            }
        });
    });
*/

    req.form.complete();
});

app.listen(3020);





