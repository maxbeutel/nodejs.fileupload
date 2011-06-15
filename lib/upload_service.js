var util = require('util'),
    fs = require('fs'),
    path = require('path'),
    exec = require('child_process').exec,
    EventEmitter = require('events').EventEmitter,
    MimetypeValidator = require('mimetype_validator').MimetypeValidator,
    FilesizeValidator = require('filesize_validator').FilesizeValidator,
    CompositeValidator = require('composite_validator').CompositeValidator;

function UploadService(aForm) {
    var form = aForm;

    var self = this;

    var tmpPath;
    var lastPercent;

    
    var validatorsRan = false;
    var fileUploaded = false;

    var compositeValidator = new CompositeValidator();
    compositeValidator.add(new MimetypeValidator(form), new FilesizeValidator(form));
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