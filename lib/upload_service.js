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

    var tmpPath;

    var self = this;

    this.isComplete = function() {
        return isComplete;
    }

    form.on('progress', function validateMimetype(bytesReceived, bytesExpected) {
        var percent = (bytesReceived / bytesExpected * 100) | 0;

        if (tmpPath && percent > 25) {
            var child = exec('file --mime-type ' + tmpPath, function (err, stdout, stderr) {
                var mimetype = stdout.substring(stdout.lastIndexOf(':') + 2, stdout.lastIndexOf('\n'));

                console.log('### file CALL OUTPUT', err, stdout, stderr);

                if (err || stderr) {
                    console.log('### ERROR: MIMETYPE COULD NOT BE DETECTED');

                    self.emit('error', 'Could not validate mimetype');
                } else if (!ALLOWED_MIME_TYPES[mimetype]) {
                    console.log('### ERROR: INVALID MIMETYPE', mimetype);

                    self.emit('error', 'Invalid mimetype');
                } else {
                    console.log('### MIMETYPE VALIDATION COMPLETE');

                    isComplete = true;
                    self.emit('complete');
                }
            });

            form.removeListener('fileBegin', validateMimetype);
        }
    });

    form.on('fileBegin', function(_, fileInfo) {
        if (fileInfo.path) {
            tmpPath = fileInfo.path;
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

    form.on('progress', function(bytesReceived, _) {
        if (bytesReceived > MAX_UPLOAD_SIZE) {
            console.log('### ERROR: FILE TOO LARGE');

            form.removeListener('end', fileUploaded);
            
            self.emit('error', 'File too large');
        }
    });

    form.on('end', function fileUploaded() {
        console.log('### FILESIZE VALIDATION COMPLETE');

        isComplete = true;
        self.emit('complete');
    });
}

util.inherits(RollingFileSizeValidator, EventEmitter);


function CompositeValidator() {
    var validators = [];

    var self = this;

    this.add = function() {
        validators.push.apply(validators, arguments);
        validators.forEach(addListeners);
    }

    function addListeners(validator) {
        validator.on('error', validationError);
        validator.on('complete', validationComplete);
    }

    function validationError(message) {
        self.emit('error', message);
    }

    function validationComplete() {
        console.log('### CHECKING IF ALL VALIDATORS ARE GOOD');

        if (validators.every(function(v) {
            console.log('', v, v.isComplete());
            return v.isComplete();
        })) {
            console.log('### ALL VALIDATORS A-OK!');

            self.emit('allComplete');
        }
    }
}

util.inherits(CompositeValidator, EventEmitter);



function UploadService(aForm) {
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
        console.log('### VALIDATION COMPLETED, CHECKING FOR FINISH');

        validatorsRan = true;
        checkForFinish();
    }
    
    function checkForFinish() {
        console.log('### CHECKING FOR FINISH: ', validatorsRan, fileUploaded);

        if (validatorsRan && fileUploaded) {
            console.log('### VALIDATORS RAN, FILE UPLOADED - CHECKING IF EXISTS');

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
            console.log('### TMP PATH SET');

            tmpPath = fileInfo.path;

            form.removeListener('fileBegin', catchTmpPath);
        }
    });

    form.on('fileBegin', function publishUploadStart(_, fileInfo) {
        if (fileInfo.name) {
            console.log('### BEGINNING FILENAME: ', fileInfo.name);

            self.emit('begin', fileInfo.name);

            form.removeListener('fileBegin', publishUploadStart);
        }
    });

    form.on('progress', function publishProgress(bytesReceived, bytesExpected) {
        console.log('### PROGRESSING');

        var percent = (bytesReceived / bytesExpected * 100) | 0;

        // dont flood client with messages - check if progress really changed since last time
        if (percent != lastPercent) {
            self.emit('progress', percent);
        }

        lastPercent = percent;
    });


    form.on('file', function() {
        console.log('### FILE UPLOADED, CHECKING FOR FINISH');

        fileUploaded = true;
        checkForFinish();
    });
}


util.inherits(UploadService, EventEmitter);
exports.UploadService = UploadService;