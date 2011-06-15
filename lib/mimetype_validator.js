var util = require('util'),
    fs = require('fs'),
    path = require('path'),
    exec = require('child_process').exec,
    EventEmitter = require('events').EventEmitter;

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

            form.removeListener('progress', validateMimetype);
        }
    });

    form.on('fileBegin', function catchTmpPath(_, fileInfo) {
        if (fileInfo.path) {
            tmpPath = fileInfo.path;
            form.removeListener('progress', catchTmpPath);
        }
    });
}

util.inherits(MimetypeValidator, EventEmitter);
exports.MimetypeValidator = MimetypeValidator;
