var util = require('util'),
    fs = require('fs'),
    path = require('path'),
    exec = require('child_process').exec,
    EventEmitter = require('events').EventEmitter;

var MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
var ALLOWED_MIME_TYPES = {'application/pdf': 'pdf', 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/gif': 'gif'};


function MimetypeValidator(aForm) {
    var form = aForm;
    var isComplete = false;

    var self = this;

    this.isComplete = function() {
        return isComplete;
    }

    form.on('fileBegin', function validateMimetype(_, fileInfo) {
        if (fileInfo.path) {
            var child = exec('file --mime-type ' + fileInfo.path, function (err, stdout, stderr) {
                var mimetype = stdout.substring(stdout.lastIndexOf(':') + 2, stdout.lastIndexOf('\n'));

                if (err || stderr) {
                    self.emit('error', 'Could not validate mimetype');
                } else if (!ALLOWED_MIME_TYPES[mimetype]) {
                    self.emit('error', 'Wrong mimetype');
                } else {
                    isComplete = true;
                    self.emit('complete');
                }
            });

            form.removeListener('fileBegin', validateMimetype);
        }
    });
}

util.inherits(MimetypeValidator, EventEmitter);

function RollingFileSizeValidator(aForm) {
    var form = aForm;
    var isComplete = false;

    var self = this;

    this.isComplete = function() {
        return isComplete;
    }

    form.on('progress', function(bytesReceived, bytesExpected) {
        if (bytesReceived > MAX_UPLOAD_SIZE) {
            form.removeListener('end', fileUploaded);
            self.emit('error', 'File too large');
        }
    });

    form.on('end', function fileUploaded() {
        isComplete = true;
        self.emit('complete');
    });
}

util.inherits(RollingFileSizeValidator, EventEmitter);


function CompositeValidator() {
    var validators = [];

    this.add = function() {
        validators.forEach(addListeners);
        validators.push.apply(validators, arguments);
    }

    function addListeners(validator) {
        validator.on('error', validationError);
        validator.on('complete', validationComplete);
    }

    function validationError(message) {
        this.emit('error', message);
    }

    function validationComplete() {
        if (validators.every(function(v) {
            return v.isComplete();
        })) {
            this.emit('allComplete');
        }
    }
}

util.inherits(CompositeValidator, EventEmitter);



function UploadService(aUploadSessionId, aForm) {
    if (!(this instanceof UploadService)) return new UploadService;
    EventEmitter.call(this);

    var uploadSessionId = aUploadSessionId;
    var form = aForm;

    var self = this;

    var tmpPath;
    var lastPercent;

    
    var validatorsRan = false;
    var fileUploaded = false;


    var compositeValidator = new CompositeValidator();
    compositeValidator.add(new MimetypeValidator(form), new RollingFileSizeValidator(form));
    compositeValidator.on('error', validationError);
    compositeValidator.on('allComplete', validationComplete);

    function validationError(message) {
        form.removeAllListeners('progress');
        form.removeAllListeners('fileBegin');
        form.removeAllListeners('file');
        form.removeAllListeners('end');

        fs.unlinkSync(tmpPath);

        self.emit('failedValidation', message);
    }



    function validationComplete() {
        validatorsRan = true;
        checkForFinish();
    }
    
    function checkForFinish() {
        if (validatorsRan && fileUploaded) {
            path.exists(tmpPath, function(exists) {
                if (exists) {
                    self.emit('success');
                } else {
                    self.emit('failure');
                }
            });
        }
    }


    form.on('fileBegin', function catchTmpPath(_, fileInfo) {
        if (fileInfo.path) {
            console.log('### caught tmp path');

            tmpPath = fileInfo.path;

            form.removeListener('fileBegin', catchTmpPath);
        }
    });

    form.on('fileBegin', function publishUploadStart(_, fileInfo) {
        if (fileInfo.name) {
            console.log('### FILENAME: ', fileInfo.name);

            self.emit('begin');

            form.removeListener('fileBegin', publishUploadStart);
        }
    });

    form.on('progress', function publishProgress(bytesReceived, bytesExpected) {
        var percent = (bytesReceived / bytesExpected * 100) | 0;

        // dont flood client with messages - check if progress really changed since last time
        if (percent != lastPercent) {
            self.emit('progress', percent);
        }

        lastPercent = percent;
    });





    form.on('progress', function validateMaxSize(bytesReceived, bytesExpected) {
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

    

    form.on('file', function() {
        fileUploaded = true;
        checkForFinish();
    });



}


util.inherits(UploadService, EventEmitter);
exports.UploadService = UploadService;