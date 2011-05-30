// point socket.io to location of flash fallback
var WEB_SOCKET_SWF_LOCATION = '/nodejs-upload-assets/socket.io/lib/vendor/web-socket-js/WebSocketMain.swf';

$(document).ready(function() {
    $('#upload-form-wrap').hide();

    var socket = new io.Socket(location.host, { port: 3030 });

    // initially authenticate with session id
    socket.on('connect', function() {
        socket.send({ type: 'authentication', sessionId: sessionId });
    });

    // handle message by type
    socket.on('message', function(message) {
        //console.log('### received message', message);

        if (message.type == 'authentication-success') {
            $('#upload-form-wrap').show();
            $('#upload-form').html('<iframe src="/nodejs-upload/upload-form"></iframe>');
        }

        if (message.type == 'authentication-failed') {
            socket.disconnect();
            alert('Authentication failed');
        }

        if (message.type == 'upload-start') {
            console.log('### Starting upload', message);
        }

        if (message.type == 'upload-progress') {
            console.log('### Updating progress');
            $('#upload-status').html('Uploading: ' + message.percent + '%');
        }

        if (message.type == 'upload-success') {
            $('#upload-form-wrap').hide();
            socket.disconnect();
            alert('Upload success');
        }

        if (message.type == 'upload-failure') {
            $('#upload-form-wrap').hide();
            socket.disconnect();
            alert('Upload failed');
        }
    });

    socket.connect();
});