(function () {
  'use strict';

  var api = MBSession.api;
  var LOCAL_KEY = 'mb.tracker.v1'; // bets saved by the old browser-only tracker
  var COLUMNS = ['date', 'bookmaker', 'exchange', 'event', 'type', 'stake', 'profit', 'notes'];
  var TYPE_LABELS = {
    'qualifying': 'Qualifying',
    'free-snr': 'Free bet (SNR)',
    'free-sr': 'Free bet (SR)',
    'casino': 'Casino',
    'other': 'Other'
  };
  var DEFAULT_BOOKMAKERS = ['Bet365', 'William Hill', 'Paddy Power', 'Sky Bet', 'Coral', 'Ladbrokes',
    'Betfred', 'Betway', 'BetVictor', 'Unibet', '888sport', 'Boylesports'];
  var DEFAULT_EXCHANGES = ['Betfair', 'Smarkets', 'Matchbook', 'Betdaq'];

  var $ = function (id) { return document.getElementById(id); };
  var bets = [];
  var loaded = false;

  function setStatus(msg) { $('status').textContent = msg; }
  function money(n) { return (n < 0 ? '-' : '') + '£' + Math.abs(n).toFixed(2); }
  function signedCell(td, n) {
    td.textContent = money(n);
    td.className = 'num ' + (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
  }
  function today() {
    var d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function groupBy(keyFn) {
    var groups = {};
    bets.forEach(function (b) {
      var k = keyFn(b);
      groups[k] = groups[k] || { count: 0, profit: 0 };
      groups[k].count++;
      groups[k].profit += b.profit;
    });
    return groups;
  }

  function emptyRow(tbody, cols, text) {
    var td = tbody.insertRow().insertCell();
    td.colSpan = cols;
    td.className = 'empty';
    td.textContent = text;
  }

  function renderGroup(tbody, groups, sortFn, labelFn) {
    tbody.innerHTML = '';
    var keys = Object.keys(groups).sort(sortFn);
    if (!keys.length) return emptyRow(tbody, 3, loaded ? 'No bets yet' : 'Loading…');
    keys.forEach(function (k) {
      var tr = tbody.insertRow();
      tr.insertCell().textContent = labelFn ? labelFn(k) : k;
      var c = tr.insertCell();
      c.className = 'num';
      c.textContent = groups[k].count;
      signedCell(tr.insertCell(), groups[k].profit);
    });
  }

  function monthLabel(key) {
    var parts = key.split('-');
    return new Date(+parts[0], +parts[1] - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  function updateDatalist(id, defaults, field) {
    var names = defaults.slice();
    bets.forEach(function (b) { if (b[field] && names.indexOf(b[field]) === -1) names.push(b[field]); });
    var list = $(id);
    list.innerHTML = '';
    names.sort().forEach(function (n) {
      var o = document.createElement('option');
      o.value = n;
      list.appendChild(o);
    });
  }

  function render() {
    bets.sort(function (a, b) { return b.date.localeCompare(a.date) || b.id - a.id; });

    var total = bets.reduce(function (s, b) { return s + b.profit; }, 0);
    var thisMonth = today().slice(0, 7);
    var monthTotal = bets.filter(function (b) { return b.date.slice(0, 7) === thisMonth; })
      .reduce(function (s, b) { return s + b.profit; }, 0);
    $('s-total').textContent = money(total);
    $('s-total').className = 'value ' + (total > 0 ? 'pos' : total < 0 ? 'neg' : '');
    $('s-month').textContent = money(monthTotal);
    $('s-month').className = 'value ' + (monthTotal > 0 ? 'pos' : monthTotal < 0 ? 'neg' : '');
    $('s-count').textContent = bets.length;

    var byBookie = groupBy(function (b) { return b.bookmaker; });
    renderGroup($('by-bookie'), byBookie, function (a, b) { return byBookie[b].profit - byBookie[a].profit; });
    renderGroup($('by-month'), groupBy(function (b) { return b.date.slice(0, 7); }),
      function (a, b) { return b.localeCompare(a); }, monthLabel);

    var tbody = $('bets');
    tbody.innerHTML = '';
    if (!bets.length) emptyRow(tbody, 9, loaded ? 'No bets logged yet. Add your first bet above.' : 'Loading your bets…');
    bets.forEach(function (b) {
      var tr = tbody.insertRow();
      tr.insertCell().textContent = b.date;
      tr.insertCell().textContent = b.bookmaker;
      tr.insertCell().textContent = b.exchange;
      tr.insertCell().textContent = b.event;
      var badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = TYPE_LABELS[b.type] || b.type;
      tr.insertCell().appendChild(badge);
      var stake = tr.insertCell();
      stake.className = 'num';
      stake.textContent = b.stake == null ? '' : money(b.stake);
      signedCell(tr.insertCell(), b.profit);
      tr.insertCell().textContent = b.notes;
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn small danger';
      del.textContent = 'Delete';
      del.setAttribute('aria-label', 'Delete bet from ' + b.date + ' at ' + b.bookmaker);
      del.addEventListener('click', function () {
        del.disabled = true;
        api('DELETE', '/api/bets/' + b.id).then(function () {
          bets = bets.filter(function (x) { return x.id !== b.id; });
          render();
        }, function (err) {
          del.disabled = false;
          setStatus(err.message);
        });
      });
      tr.insertCell().appendChild(del);
    });

    updateDatalist('bookmaker-list', DEFAULT_BOOKMAKERS, 'bookmaker');
    updateDatalist('exchange-list', DEFAULT_EXCHANGES, 'exchange');
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function addBets(list) {
    return api('POST', '/api/bets', { bets: list }).then(function (d) {
      bets = bets.concat(d.bets);
      render();
      return d.bets.length;
    });
  }

  // Prefill from the calculator's or oddsmatcher's "Log" links.
  function prefill() {
    var q = new URLSearchParams(location.search);
    if (!q.has('profit')) {
      try {
        q = new URLSearchParams(sessionStorage.getItem('mb.prefill') || '');
        sessionStorage.removeItem('mb.prefill');
      } catch (err) { /* storage unavailable */ }
    }
    if (!q.has('profit')) return;
    if (TYPE_LABELS[q.get('type')]) $('f-type').value = q.get('type');
    if (q.get('stake')) $('f-stake').value = q.get('stake');
    $('f-profit').value = q.get('profit');
    if (location.search) history.replaceState(null, '', location.pathname);
    $('f-bookmaker').focus();
  }

  // Bets saved in this browser before accounts existed.
  function offerMigration() {
    var local;
    try { local = JSON.parse(localStorage.getItem(LOCAL_KEY)); } catch (e) { local = null; }
    if (!Array.isArray(local) || !local.length) return;
    $('migrate-text').textContent = 'This browser has ' + local.length + ' bet' + (local.length === 1 ? '' : 's') +
      ' saved from before you had an account.';
    $('migrate').hidden = false;
    $('migrate-yes').addEventListener('click', function () {
      addBets(local).then(function (n) {
        try { localStorage.removeItem(LOCAL_KEY); } catch (e) { /* ignore */ }
        $('migrate').hidden = true;
        setStatus('Added ' + n + ' bet(s) to your account.');
      }, function (err) { $('migrate-text').textContent = err.message; });
    });
    $('migrate-no').addEventListener('click', function () {
      try { localStorage.removeItem(LOCAL_KEY); } catch (e) { /* ignore */ }
      $('migrate').hidden = true;
    });
  }

  $('bet-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var bet = {
      date: $('f-date').value,
      bookmaker: $('f-bookmaker').value,
      exchange: $('f-exchange').value,
      event: $('f-event').value,
      type: $('f-type').value,
      stake: $('f-stake').value,
      profit: $('f-profit').value,
      notes: $('f-notes').value
    };
    if (!$('bet-form').reportValidity()) return;
    var btn = $('bet-form').querySelector('button[type="submit"]');
    btn.disabled = true;
    addBets([bet]).then(function () {
      // Keep date, bookmaker, exchange and type for quick entry of the follow-up free bet.
      ['f-event', 'f-stake', 'f-profit', 'f-notes'].forEach(function (id) { $(id).value = ''; });
      setStatus('Bet added.');
    }, function (err) { setStatus(err.message); }).then(function () { btn.disabled = false; });
  });

  $('export-csv').addEventListener('click', function () {
    download('matched-betting-' + today() + '.csv', MBCsv.toCSV(bets, COLUMNS), 'text/csv');
  });

  $('copy-csv').addEventListener('click', function () {
    var text = MBCsv.toCSV(bets, COLUMNS);
    try {
      navigator.clipboard.writeText(text).then(function () {
        setStatus('Copied ' + bets.length + ' bet(s) as CSV. Paste into a spreadsheet or text file.');
      }, function () { setStatus('Your browser blocked copying. Use Export CSV instead.'); });
    } catch (err) {
      setStatus('Your browser blocked copying. Use Export CSV instead.');
    }
  });

  $('import-csv').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var rows = MBCsv.parseCSV(String(reader.result)).filter(function (r) {
        return /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') && r.profit !== '' && !isNaN(parseFloat(r.profit)) && (r.bookmaker || '').trim();
      });
      e.target.value = '';
      if (!rows.length) return setStatus('No valid bets found. The file needs date, bookmaker and profit columns.');
      addBets(rows).then(function (n) { setStatus('Imported ' + n + ' bet(s).'); }, function (err) { setStatus(err.message); });
    };
    reader.readAsText(file);
  });

  $('clear-all').addEventListener('click', function () {
    if (!bets.length) return;
    $('confirm-clear-text').textContent = 'Delete all ' + bets.length + ' bets? Export a CSV first if you want to keep them.';
    $('confirm-clear').hidden = false;
  });
  $('confirm-clear-no').addEventListener('click', function () { $('confirm-clear').hidden = true; });
  $('confirm-clear-yes').addEventListener('click', function () {
    api('DELETE', '/api/bets').then(function () {
      bets = [];
      $('confirm-clear').hidden = true;
      setStatus('Deleted all bets.');
      render();
    }, function (err) { setStatus(err.message); });
  });

  $('f-date').value = today();
  prefill();
  render();
  api('GET', '/api/bets').then(function (d) {
    bets = d.bets;
    loaded = true;
    render();
    offerMigration();
  }, function (err) { setStatus(err.message); });
})();
