var fs = require('fs');

fs.readFile('not-there.jpg', 'binary', function(err, img) {
console.log(err);
});

