'use strict';

angular.module('quickCooking2App')
  .config(function ($routeProvider) {
    $routeProvider
      .when('/takepicture', {
        templateUrl: 'app/takepicture/takepicture.html',
        controller: 'TakepictureCtrl'
      });
  });
