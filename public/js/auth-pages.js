(function () {
  'use strict';
  var api = MBSession.api;
  var $ = function (id) { return document.getElementById(id); };
  var next = MBSession.safeNext(new URLSearchParams(location.search).get('next'));

  function showError(msg) {
    $('form-error').textContent = msg;
    $('form-error').hidden = !msg;
  }

  function wire(form, build, url) {
    form.addEventListener('input', function () { showError(''); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      showError('');
      var body = build();
      if (!body) return;
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      api('POST', url, body).then(function () {
        location.href = next;
      }, function (err) {
        showError(err.message);
        btn.disabled = false;
      });
    });
  }

  var login = $('login-form');
  if (login) {
    wire(login, function () {
      var email = $('email').value.trim();
      var password = $('password').value;
      if (!email || !password) { showError('Enter your email and password.'); return null; }
      return { email: email, password: password };
    }, '/api/auth/login');
  }

  var register = $('register-form');
  if (register) {
    wire(register, function () {
      var body = {
        name: $('name').value.trim(),
        email: $('email').value.trim(),
        password: $('password').value,
        confirmAge: $('confirm-age').checked
      };
      if (!body.name) { showError('Enter your first name.'); return null; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) { showError('Enter a valid email address.'); return null; }
      if (body.password.length < 8) { showError('Use a password of at least 8 characters.'); return null; }
      if (!body.confirmAge) { showError('Confirm that you\'re 18 or over to create an account.'); return null; }
      return body;
    }, '/api/auth/register');
  }
})();
