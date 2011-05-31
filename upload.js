require.paths.push(__dirname + '/node_modules');

var express = require('express'),
    redis = require('redis'),
    riak = require('riak-js'),
    form = require('connect-form');

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
    // @ TOD check mimetype && size of uploaded image
    var uploadSessionId = req.session.uploadSessionId;
    var lastPercent = 0;
    
    console.log('### Starting upload for: ', uploadSessionId);

    req.form.on('progress', function(bytesReceived, bytesExpected) {
        var percent = (bytesReceived / bytesExpected * 100) | 0;

        if (percent != lastPercent) {
            redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({ type: 'upload-progress', percent: percent }));
            console.log('Uploading: %' + percent + '\n');
        }

        lastPercent = percent;
    });

    req.form.complete(function(err, fields, files) {
        console.log('\nuploaded %s to %s',  files.image.filename, files.image.path);

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
                    riakClient.save('images', files.image.filename, image, { contentType: 'jpeg' });
                    redisPubSubClient.publish('upload:session:' + uploadSessionId, JSON.stringify({ type: 'upload-success' }));
                    res.redirect('back');
                }
            });
        }
    });
});

app.listen(3020);





