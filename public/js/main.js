'use strict';

$(document).ready(function(){
  console.log('loaded');
  $('#target').on('submit', function(e) {
    console.log('submit');
  });
});
