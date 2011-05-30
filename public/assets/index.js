// point socket.io to location of flash fallback
var WEB_SOCKET_SWF_LOCATION = '/nodejs-upload-assets/socket.io/lib/vendor/web-socket-js/WebSocketMain.swf';

$(document).ready(function() {
    var socket = new io.Socket(location.host, { port: 3030 });

    // initially authenticate with session id
    socket.on('connect', function() {
        socket.send({ type: 'authentication', sessionId: sessionId });
    });

    // handle message by type
    socket.on('message', function(message) {
        console.log('### received message', message);

        if (message.type == 'authentication-success') {
            $('#upload-form').html('<iframe src="/nodejs-upload/upload-form"></iframe>');
        }

        if (message.type == 'authentication-failed') {
            socket.disconnect();
            alert('Authentication failed');
        }

        if (message.type == 'progess-update') {

        }

        if (message.type == 'finish-success') {
            $('#upload-form').hide();
            socket.disconnect();
        }

        if (message.type == 'finish-failed') {
            socket.disconnect();
            alert('Upload failed');
        }
    });

    socket.connect();
});