'use strict';

$(document).ready(function(){
  $('#create-account').on('submit', function(e) {
    e.preventDefault();
    var facebookUsername = $('input#facebookUsername').val();
    var facebookPassword = $('input#facebookPassword').val();
    var phoneNumber = $('input#phoneNumber').val();
    $('#submit-button').addClass('is-loading');
    $.post('/api/users', { facebookUsername: facebookUsername, facebookPassword: facebookPassword, phoneNumber: phoneNumber })
      .done(function(msg) {
        $('#submit-button').removeClass('is-loading');
        $('#submit-button').addClass('is-success');
        $('#submit-button').prop('disabled',true);
        $('#submit-button').html('Done!');
      })
      .fail(function() {
        $('#submit-button').removeClass('is-loading');
        // TODO (nw): put a message here telling them their facebook creds are invalid
      });
  });
});
