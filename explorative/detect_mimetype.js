var sys = require('sys')
var exec = require('child_process').exec;
var child;

child = exec('file --mime-type ' + __filename, function (error, stdout, stderr) {
    console.log('stdout:', '|' + stdout.substring(stdout.lastIndexOf(':') + 2, stdout.lastIndexOf('\n')) + '|');
    console.log('stderr:', stderr);
    
    if (error !== null) {
        console.log('exec error:', error);
    }
});