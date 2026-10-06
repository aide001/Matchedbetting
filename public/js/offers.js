(function () {
  'use strict';
  var api = MBSession.api;
  var $ = function (id) { return document.getElementById(id); };
  var STATUS = [['not-started', 'To do'], ['in-progress', 'In progress'], ['done', 'Done']];
  var offers = [];

  function money(n) { return (n < 0 ? '-' : '') + '£' + Math.abs(n).toFixed(2); }
  function filter() { return document.querySelector('input[name="o-filter"]:checked').value; }
  function note(msg, isError) {
    $('o-note').textContent = msg;
    $('o-note').className = 'form-note' + (isError ? ' error' : '');
  }

  function summary() {
    $('o-done').textContent = offers.filter(function (o) { return o.status === 'done'; }).length + ' of ' + offers.length;
    $('o-progress').textContent = offers.filter(function (o) { return o.status === 'in-progress'; }).length;
    var total = offers.reduce(function (s, o) { return s + (o.profit || 0); }, 0);
    $('o-profit').textContent = money(total);
    $('o-profit').className = 'value ' + (total > 0 ? 'pos' : total < 0 ? 'neg' : '');
    var left = offers.filter(function (o) { return o.status !== 'done'; })
      .reduce(function (s, o) { return s + (MBOffers.estimateProfit(o) || 0); }, 0);
    $('o-left').textContent = '£' + left;
  }

  function save(o, status, profit) {
    var prev = { status: o.status, profit: o.profit };
    o.status = status;
    o.profit = profit;
    summary();
    note('Saving…');
    return api('PUT', '/api/offers/' + o.id, { status: status, profit: profit }).then(function (d) {
      o.updatedAt = d.offer.updatedAt;
      note('Saved.');
      render();
    }, function (err) {
      o.status = prev.status;
      o.profit = prev.profit;
      note(err.message, true);
      render();
    });
  }

  function render() {
    summary();
    var tbody = $('o-rows');
    tbody.innerHTML = '';
    var f = filter();
    var shown = offers.filter(function (o) { return f === 'all' || o.status === f; });
    if (!shown.length) {
      var td = tbody.insertRow().insertCell();
      td.colSpan = 5;
      td.className = 'empty';
      td.textContent = 'No offers here.';
    }
    shown.forEach(function (o) {
      var tr = tbody.insertRow();
      tr.className = 'status-' + o.status;
      var name = tr.insertCell();
      name.className = 'offer-cell';
      var dot = document.createElement('span');
      dot.className = 'check-dot ' + o.check.status;
      dot.title = { checked: 'Terms checked', conflicting: 'Sources disagree', partial: 'Not fully confirmed' }[o.check.status];
      name.append(dot, Object.assign(document.createElement('strong'), { textContent: o.bookmaker }),
        Object.assign(document.createElement('span'), { className: 'offer-headline', textContent: o.headline }));
      var est = MBOffers.estimateProfit(o);
      var ec = tr.insertCell();
      ec.className = 'num';
      ec.textContent = est == null ? '–' : '£' + est;

      var sel = document.createElement('select');
      sel.setAttribute('aria-label', 'Status for ' + o.bookmaker);
      STATUS.forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s[0];
        opt.textContent = s[1];
        sel.appendChild(opt);
      });
      sel.value = o.status;
      sel.addEventListener('change', function () { save(o, sel.value, o.profit); });
      tr.insertCell().appendChild(sel);

      var pc = tr.insertCell();
      pc.className = 'num';
      var input = document.createElement('input');
      input.type = 'number';
      input.step = '0.01';
      input.inputMode = 'decimal';
      input.className = 'profit-input';
      input.placeholder = '0.00';
      input.setAttribute('aria-label', 'Profit from ' + o.bookmaker);
      input.value = o.profit == null ? '' : o.profit;
      input.addEventListener('change', function () {
        var v = input.value === '' ? null : Math.round(parseFloat(input.value) * 100) / 100;
        if (v !== null && isNaN(v)) return note('Enter the profit as a number.', true);
        save(o, o.status === 'not-started' && v !== null ? 'in-progress' : o.status, v);
      });
      pc.appendChild(input);

      var g = document.createElement('a');
      g.className = 'btn small secondary';
      g.href = '/offer.html#' + o.id;
      g.textContent = 'Guide';
      g.setAttribute('aria-label', o.bookmaker + ' guide');
      tr.insertCell().appendChild(g);
    });
  }

  document.querySelectorAll('input[name="o-filter"]').forEach(function (r) { r.addEventListener('change', render); });

  api('GET', '/api/offers').then(function (d) {
    offers = d.offers;
    render();
  }, function (err) { note(err.message, true); });
})();
