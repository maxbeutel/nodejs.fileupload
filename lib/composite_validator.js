var util = require('util'),
    EventEmitter = require('events').EventEmitter;

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
exports.CompositeValidator = CompositeValidator;