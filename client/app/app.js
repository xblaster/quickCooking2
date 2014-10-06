'use strict';

angular.module('quickCooking2App', [
  'ngCookies',
  'ngResource',
  'ngSanitize',
  'ngRoute',
  'ui.bootstrap'
])
  .config(function ($routeProvider, $locationProvider) {
    $routeProvider
      .otherwise({
        redirectTo: '/takepicture'
      });

    $locationProvider.html5Mode(true);
  });



