(function () {
  'use strict';
  var api = MBSession.api;
  var $ = function (id) { return document.getElementById(id); };

  function note(id, msg, isError) {
    $(id).textContent = msg;
    $(id).className = 'form-note' + (isError ? ' error' : '');
  }

  MBSession.ready.then(function (user) {
    if (!user) return;
    $('name').value = user.name;
    $('email').value = user.email;
    var since = new Date(user.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    $('account-summary').textContent = 'Signed in as ' + user.email + '. Member since ' + since + '.';
  });

  $('profile-form').addEventListener('submit', function (e) {
    e.preventDefault();
    api('PATCH', '/api/account', { name: $('name').value }).then(function (d) {
      note('profile-note', 'Saved.');
      var me = document.querySelector('.nav-auth a[href="/account.html"]');
      if (me) me.textContent = d.user.name;
    }, function (err) { note('profile-note', err.message, true); });
  });

  $('password-form').addEventListener('submit', function (e) {
    e.preventDefault();
    api('POST', '/api/account/password', {
      currentPassword: $('current-password').value,
      newPassword: $('new-password').value
    }).then(function () {
      $('current-password').value = '';
      $('new-password').value = '';
      note('password-note', 'Password changed. You\'ve been signed out on other devices.');
    }, function (err) { note('password-note', err.message, true); });
  });

  $('delete-form').addEventListener('submit', function (e) {
    e.preventDefault();
    api('DELETE', '/api/account', { password: $('delete-password').value }).then(function () {
      location.href = '/?deleted=1';
    }, function (err) { note('delete-note', err.message, true); });
  });
})();
