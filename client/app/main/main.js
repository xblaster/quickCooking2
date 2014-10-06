'use strict';

angular.module('quickCooking2App')
  .config(function ($routeProvider) {
    $routeProvider
      .when('/main', {
        templateUrl: 'app/main/main.html',
        controller: 'MainCtrl'
      });
  });