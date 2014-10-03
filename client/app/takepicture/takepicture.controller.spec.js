'use strict';

describe('Controller: TakepictureCtrl', function () {

  // load the controller's module
  beforeEach(module('quickCooking2App'));

  var TakepictureCtrl, scope;

  // Initialize the controller and a mock scope
  beforeEach(inject(function ($controller, $rootScope) {
    scope = $rootScope.$new();
    TakepictureCtrl = $controller('TakepictureCtrl', {
      $scope: scope
    });
  }));

  it('should ...', function () {
    expect(1).toEqual(1);
  });
});
