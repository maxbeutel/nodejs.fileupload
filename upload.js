require.paths.push(__dirname + '/node_modules');

var express = require('express'),
    form = require('connect-form');

var app = express.createServer(form({ keepExtensions: true }));
app.set('view engine', 'jade');

var RedisStore = require('connect-redis');
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({ secret: 'oi098ahsd789jlkdasl', store: new RedisStore() }));


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
    req.form.complete(function(err, fields, files) {
        if (err) {
            next(err);
        } else {
            console.log('\nuploaded %s to %s',  files.image.filename, files.image.path);
            res.redirect('back');
        }
    });

    req.form.on('progress', function(bytesReceived, bytesExpected) {
        var percent = (bytesReceived / bytesExpected * 100) | 0;
        console.log('Uploading: %' + percent + '\n');
    });
});

app.listen(3020);





