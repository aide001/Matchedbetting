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

  var forgot = $('forgot-form');
  if (forgot) {
    forgot.addEventListener('input', function () { showError(''); });
    forgot.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $('email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('Enter a valid email address.');
      var btn = forgot.querySelector('button[type="submit"]');
      btn.disabled = true;
      api('POST', '/api/auth/forgot', { email: email }).then(function () {
        $('sent-email').textContent = email;
        forgot.hidden = true;
        $('forgot-sent').hidden = false;
      }, function (err) { showError(err.message); }).then(function () { btn.disabled = false; });
    });
    $('try-again').addEventListener('click', function () {
      $('forgot-sent').hidden = true;
      forgot.hidden = false;
      $('email').focus();
    });
  }

  var reset = $('reset-form');
  if (reset) {
    var token = new URLSearchParams(location.search).get('token') || '';
    // Keep the token out of the address bar and browser history once it's read.
    history.replaceState(null, '', location.pathname);
    var invalid = function () {
      reset.hidden = true;
      $('reset-invalid').hidden = false;
    };
    if (!token) invalid();
    else api('POST', '/api/auth/reset/check', { token: token }).then(function (d) { if (!d.valid) invalid(); }, function () {});

    reset.addEventListener('input', function () { showError(''); });
    reset.addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = $('password').value;
      if (pw.length < 8) return showError('Use a password of at least 8 characters.');
      if (pw !== $('password2').value) return showError('The two passwords don\'t match.');
      var btn = reset.querySelector('button[type="submit"]');
      btn.disabled = true;
      api('POST', '/api/auth/reset', { token: token, password: pw }).then(function () {
        location.href = '/dashboard.html';
      }, function (err) {
        btn.disabled = false;
        if (/expired|already been used/.test(err.message)) invalid();
        else showError(err.message);
      });
    });
  }
})();
