'use strict';

angular.module('quickCooking2App')
    .controller('TakepictureCtrl', function($scope) {
        $scope.message = 'Hello';


        $scope.onInit = function() {
        	//code retrieved from http://stackoverflow.com/questions/17886803/is-it-possible-now-to-use-getusermedia-api-to-read-video-stream-from-web-camera
            function onVideoFail(e) {
                console.log('webcam fail!', e);
            };

            function hasGetUserMedia() {
                // Note: Opera is unprefixed.
                return !!(navigator.getUserMedia || navigator.webkitGetUserMedia ||
                    navigator.mozGetUserMedia || navigator.msGetUserMedia);
            }

            if (hasGetUserMedia()) {
                // Good to go!
            } else {
                alert('getUserMedia() is not supported in your browser');
            }

            window.URL = window.URL || window.webkitURL;
            navigator.getUserMedia = navigator.getUserMedia ||
                navigator.webkitGetUserMedia ||
                navigator.mozGetUserMedia ||
                navigator.msGetUserMedia;

            var video = document.querySelector('video');
            var streamRecorder;
            var webcamstream;

            if (navigator.getUserMedia) {
                navigator.getUserMedia({
                    audio: true,
                    video: true
                }, function(stream) {
                    video.src = window.URL.createObjectURL(stream);
                    webcamstream = stream;
                    //  streamrecorder = webcamstream.record();
                }, onVideoFail);
            } else {
                alert('failed');
            }

            function startRecording() {
                streamRecorder = webcamstream.record();
                setTimeout(stopRecording, 10000);
            }

            function stopRecording() {
                streamRecorder.getRecordedData(postVideoToServer);
            }

            function postVideoToServer(videoblob) {

                var data = {};
                data.video = videoblob;
                data.metadata = 'test metadata';
                data.action = "upload_video";
                jQuery.post("http://www.kongraju.in/uploadvideo.php", data, onUploadSuccess);
            }

            function onUploadSuccess() {
                alert('video uploaded');
            }
        }

        $scope.takePicture = function() {
        	var v = $("video")[0];


		    var canvas = $('#c')[0];
		    var context = canvas.getContext('2d');

		    var cw = canvas.width;
		    var ch = canvas.height

			/*v.addEventListener('play', function(){
			        draw(v,context,cw,ch);
			    },false);*/

			//function draw(v,c,w,h) {
			  //  if(v.paused || v.ended) return false;
		    context.drawImage(v,0,0,cw,ch);
		    window.location=canvas.toDataURL("image/png");
			    //setTimeout(draw,20,v,c,w,h);
			//}
        }

		




        $scope.onInit();

    });
