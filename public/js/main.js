'use strict';

$(document).ready(function(){
  $('#create-account').on('submit', function(e) {
    e.preventDefault();
    var facebookUsername = $('input#facebookUsername').val();
    var facebookPassword = $('input#facebookPassword').val();
    var phoneNumber = $('input#phoneNumber').val();
    $.post('/api/users', { facebookUsername: facebookUsername, facebookPassword: facebookPassword, phoneNumber: phoneNumber });
  });
});
