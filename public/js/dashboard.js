(function () {
  'use strict';
  var api = MBSession.api;
  var $ = function (id) { return document.getElementById(id); };
  var TYPE_LABELS = { 'qualifying': 'Qualifying', 'free-snr': 'Free bet (SNR)', 'free-sr': 'Free bet (SR)', 'casino': 'Casino', 'other': 'Other' };

  function money(n) { return (n < 0 ? '-' : '') + '£' + Math.abs(n).toFixed(2); }
  function signed(node, n) {
    node.textContent = money(n);
    node.classList.toggle('pos', n > 0);
    node.classList.toggle('neg', n < 0);
  }
  function empty(tbody, cols, text) {
    var td = tbody.insertRow().insertCell();
    td.colSpan = cols;
    td.className = 'empty';
    td.textContent = text;
  }

  MBSession.ready.then(function (user) {
    if (user) $('greeting').textContent = 'Hi ' + user.name;
  });

  api('GET', '/api/bets').then(function (d) {
    var bets = d.bets;
    var month = new Date().toISOString().slice(0, 7);
    signed($('d-total'), bets.reduce(function (s, b) { return s + b.profit; }, 0));
    signed($('d-month'), bets.filter(function (b) { return b.date.slice(0, 7) === month; })
      .reduce(function (s, b) { return s + b.profit; }, 0));
    $('d-count').textContent = bets.length;
    var tbody = $('d-recent');
    tbody.innerHTML = '';
    if (!bets.length) return empty(tbody, 4, 'No bets yet. Log your first one in the profit tracker.');
    bets.slice(0, 6).forEach(function (b) {
      var tr = tbody.insertRow();
      tr.insertCell().textContent = b.date;
      tr.insertCell().textContent = b.bookmaker;
      tr.insertCell().textContent = TYPE_LABELS[b.type] || b.type;
      var p = tr.insertCell();
      p.className = 'num';
      signed(p, b.profit);
    });
  }).catch(function (err) { empty($('d-recent'), 4, err.message); });

  api('GET', '/api/offers').then(function (d) {
    var done = d.offers.filter(function (o) { return o.status === 'done'; }).length;
    $('d-offers').textContent = done + ' of ' + d.offers.length;
    var sports = d.offers.filter(function (o) { return o.kind === 'sports'; });
    var list = $('d-next');
    list.innerHTML = '';
    var next = sports.filter(function (o) { return o.status === 'in-progress'; })
      .concat(sports.filter(function (o) { return o.status === 'not-started'; })).slice(0, 5);
    if (!next.length) {
      list.append(Object.assign(document.createElement('li'), { textContent: 'You\'ve done every sign-up offer on the list. Nice work.' }));
    }
    next.forEach(function (o) {
      var li = document.createElement('li');
      var name = document.createElement('a');
      name.href = '/offer.html#' + o.id;
      name.className = 'strong-link';
      name.textContent = o.bookmaker + ': ' + o.headline;
      var tag = document.createElement('span');
      tag.className = 'badge' + (o.status === 'in-progress' ? ' badge-progress' : '');
      tag.textContent = o.status === 'in-progress' ? 'In progress' : 'To do';
      li.append(name, tag);
      list.appendChild(li);
    });
  }).catch(function (err) { $('d-next').textContent = err.message; });
})();
