/* Shared account helpers: window.MBSession.api() for JSON calls, .ready resolves to the user or null. */
(function () {
  'use strict';

  function api(method, url, body) {
    var opts = { method: method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data && data.error ? data.error : 'Something went wrong. Check your connection and try again.');
          err.status = res.status;
          if (res.status === 401 && url.indexOf('/api/auth/') !== 0) {
            location.href = '/login.html?next=' + encodeURIComponent(location.pathname);
          }
          throw err;
        }
        return data;
      });
    }, function () {
      throw new Error('Couldn\'t reach the server. Check your connection and try again.');
    });
  }

  // Only allow redirects to pages on this site.
  function safeNext(next) {
    return typeof next === 'string' && /^\/(?!\/)[\w\-./]*$/.test(next) ? next : '/dashboard.html';
  }

  function link(href, text, cls) {
    var a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    a.className = cls || 'nav-link';
    if (location.pathname === href) a.setAttribute('aria-current', 'page');
    return a;
  }

  var ready = api('GET', '/api/auth/me').then(function (d) { return d.user; }, function () { return null; });

  ready.then(function (user) {
    var slot = document.querySelector('.nav-auth');
    if (!slot || !user) return;
    slot.innerHTML = '';
    var out = document.createElement('button');
    out.type = 'button';
    out.className = 'btn small secondary';
    out.textContent = 'Log out';
    out.addEventListener('click', function () {
      api('POST', '/api/auth/logout', {}).then(function () { location.href = '/'; }, function () { location.href = '/'; });
    });
    slot.append(link('/dashboard.html', 'Dashboard'), link('/account.html', user.name), out);
  });

  window.MBSession = { api: api, ready: ready, safeNext: safeNext };
})();
