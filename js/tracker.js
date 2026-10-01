(function () {
  'use strict';

  var STORAGE_KEY = 'mb.tracker.v1';
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
  var bets = load();

  function load() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bets));
    } catch (e) {
      alert('Your browser blocked saving. Export a CSV so you don\'t lose these entries.');
    }
  }

  function money(n) {
    return (n < 0 ? '-' : '') + '£' + Math.abs(n).toFixed(2);
  }

  function signedCell(td, n) {
    td.textContent = money(n);
    td.className = 'num ' + (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
  }

  function today() {
    var d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function normalise(raw) {
    var profit = parseFloat(raw.profit);
    var stake = parseFloat(raw.stake);
    if (isNaN(profit) || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date || '')) return null;
    return {
      id: raw.id || uid(),
      date: raw.date,
      bookmaker: String(raw.bookmaker || '').trim() || 'Unknown',
      exchange: String(raw.exchange || '').trim(),
      event: String(raw.event || '').trim(),
      type: TYPE_LABELS[raw.type] ? raw.type : 'other',
      stake: isNaN(stake) ? null : Math.round(stake * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      notes: String(raw.notes || '').trim()
    };
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

  function renderGroup(tbody, groups, sortFn, labelFn) {
    tbody.innerHTML = '';
    var keys = Object.keys(groups).sort(sortFn);
    if (!keys.length) {
      var tr = tbody.insertRow();
      var td = tr.insertCell();
      td.colSpan = 3;
      td.className = 'empty';
      td.textContent = 'No bets yet';
      return;
    }
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
    bets.sort(function (a, b) { return b.date.localeCompare(a.date); });

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
    if (!bets.length) {
      var tr = tbody.insertRow();
      var td = tr.insertCell();
      td.colSpan = 9;
      td.className = 'empty';
      td.textContent = 'No bets logged yet. Add your first bet above.';
    }
    bets.forEach(function (b) {
      var tr = tbody.insertRow();
      tr.insertCell().textContent = b.date;
      tr.insertCell().textContent = b.bookmaker;
      tr.insertCell().textContent = b.exchange;
      tr.insertCell().textContent = b.event;
      var typeCell = tr.insertCell();
      var badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = TYPE_LABELS[b.type];
      typeCell.appendChild(badge);
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
        bets = bets.filter(function (x) { return x.id !== b.id; });
        persist();
        render();
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

  // Prefill from the calculator's "Log this bet" link.
  function prefillFromQuery() {
    var q = new URLSearchParams(location.search);
    if (!q.has('profit')) return;
    if (TYPE_LABELS[q.get('type')]) $('f-type').value = q.get('type');
    if (q.get('stake')) $('f-stake').value = q.get('stake');
    $('f-profit').value = q.get('profit');
    history.replaceState(null, '', location.pathname);
    $('f-bookmaker').focus();
  }

  $('bet-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var bet = normalise({
      date: $('f-date').value,
      bookmaker: $('f-bookmaker').value,
      exchange: $('f-exchange').value,
      event: $('f-event').value,
      type: $('f-type').value,
      stake: $('f-stake').value,
      profit: $('f-profit').value,
      notes: $('f-notes').value
    });
    if (!bet) {
      $('bet-form').reportValidity();
      return;
    }
    bets.push(bet);
    persist();
    // Keep date, bookmaker, exchange and type for quick entry of the follow-up free bet.
    ['f-event', 'f-stake', 'f-profit', 'f-notes'].forEach(function (id) { $(id).value = ''; });
    render();
  });

  $('export-csv').addEventListener('click', function () {
    download('matched-betting-' + today() + '.csv', MBCsv.toCSV(bets, COLUMNS), 'text/csv');
  });

  $('import-csv').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var rows = MBCsv.parseCSV(String(reader.result));
      var imported = rows.map(normalise).filter(Boolean);
      var skipped = rows.length - imported.length;
      bets = bets.concat(imported);
      persist();
      render();
      alert('Imported ' + imported.length + ' bet(s)' + (skipped ? ', skipped ' + skipped + ' invalid row(s).' : '.'));
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  $('clear-all').addEventListener('click', function () {
    if (!bets.length) return;
    if (confirm('Delete all ' + bets.length + ' bets? Export a CSV first if you want to keep them.')) {
      bets = [];
      persist();
      render();
    }
  });

  $('f-date').value = today();
  prefillFromQuery();
  render();
})();
