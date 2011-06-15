var util = require('util'),
    EventEmitter = require('events').EventEmitter;

var MAX_UPLOAD_SIZE = 20 * 1024 * 1024;

function FilesizeValidator(aForm) {
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

util.inherits(FilesizeValidator, EventEmitter);
exports.FilesizeValidator = FilesizeValidator;