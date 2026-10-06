(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('deleted')) document.getElementById('deleted-note').hidden = false;
  MBSession.ready.then(function (user) {
    if (!user) return;
    var cta = document.getElementById('hero-cta');
    cta.innerHTML = '';
    var a = document.createElement('a');
    a.className = 'btn';
    a.href = '/dashboard.html';
    a.textContent = 'Go to your dashboard';
    var b = document.createElement('a');
    b.className = 'btn secondary';
    b.href = '/oddsmatcher.html';
    b.textContent = 'Open the oddsmatcher';
    cta.append(a, b);
  });
})();
