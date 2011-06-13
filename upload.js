require.paths.push(__dirname + '/node_modules');

var MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
var ALLOWED_MIME_TYPES = {'application/pdf': 'pdf', 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/gif': 'gif'};

var express = require('express'),
    redis = require('redis'),
    riak = require('riak-js'),
    form = require('connect-form'),
    fs = require('fs'),
    mime = require('mime');

var app = express.createServer(form({ keepExtensions: true }));
app.set('view engine', 'jade');

var RedisStore = require('connect-redis');
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({ secret: 'oi098ahsd789jlkdasl', store: new RedisStore() }));

var redisPubSubClient = redis.createClient();

// @TODO would be nice to do some round-robin here/later on in order to not always connect to the same node
var riakClient = riak.getClient({ host: '127.0.0.1', port: 8010 });

// render page with upload form
app.get('/', function(req, res) {
    var sessionId = req.cookies['connect.sid'];
    res.render('index', { sessionId: sessionId });
});

// form
app.get('/upload-form', function(req, res) {
    var sessionId = req.cookies['connect.sid'];
    res.render('upload-form', { sessionId: sessionId });
});


// upload posted file
app.post('/', function(req, res, next) {
    var uploadSessionId = req.session.uploadSessionId;
    var lastPercent = 0;
    var tmpPath = '';
    var didMimetypeLookup = false;
    var uploadFailed = false;

    console.log('### Starting upload for: ', uploadSessionId);

    req.form.on('fileBegin', function(filedName, fileInfo) {
        tmpPath = fileInfo.path;
    });

    req.form.on('progress', function(bytesReceived, bytesExpected) {
        var percent = (bytesReceived / bytesExpected * 100) | 0;

        if (bytesReceived > MAX_UPLOAD_SIZE) {
            console.log('### ERROR: file too large');
            req.form.removeAllListeners('progress');
            redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({ type: 'upload-failed', message: 'file too large' }));
            uploadFailed = true;
            return;
        }

        // this is rather ugly
        // and sucks anyway as mime only makes an lookup based on file extesion not based on file header
        // @FIXME find something that works
        if (tmpPath != '' && !didMimetypeLookup) {
            didMimetypeLookup = true;

            var mimetype = mime.lookup(tmpPath);
            
            if (!ALLOWED_MIME_TYPES[mimetype]) {
                console.log('### ERROR: invalid mimetype');
                req.form.removeAllListeners('progress');
                redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({ type: 'upload-failed', message: 'invalid file type' }));
                uploadFailed = true;
                return;
            }
        }

        // dont flood client with messages - check if progress really changed since last time
        if (percent != lastPercent) {
            redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({ type: 'upload-progress', percent: percent }));
            console.log('Uploading: %' + percent + '\n');
        }

        lastPercent = percent;
    });

    req.form.complete(function(err, fields, files) {
        // @TODO remove global state variable, this is ugly
        if (uploadFailed) {
            fs.unlinkSync(tmpPath);
            console.log('### upload failed, deleting tmp file');
            res.redirect('back');
            return;
        }

        console.log('### uploaded %s to %s',  files.image.filename, tmpPath);

        if (err) {
            redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({ type: 'upload-failed' }));
            next(err);
        } else {
            fs.readFile(files.image.path, 'binary', function(err, image) {
                if (err) {
                    redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({ type: 'upload-failed' }));
                    next(err);
                } else {
                    // @TODO maybe store some custom data
                    // @TODO use correct mimetype
                    // @TODO escape user provided filename!

                    // leave riak out for now
                    //riakClient.save('images', files.image.filename, image, { contentType: 'jpeg' });
                    redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({ type: 'upload-success' }));
                    res.redirect('back');
                }
            });
        }
    });
});

app.listen(3020);





