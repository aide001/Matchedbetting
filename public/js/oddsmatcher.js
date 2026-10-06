(function () {
  'use strict';

  var SETTINGS_STORE = 'mb.odds.settings.v2';
  var PAGE_SIZE = 50;
  var FILTER_FIELDS = ['om-stake', 'om-min', 'om-max', 'om-rating', 'om-hours'];
  var CALC_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01"/></svg>';

  var $ = function (id) { return document.getElementById(id); };
  var state = { events: [], source: null, loadedAt: null, rows: [], visible: [], shown: PAGE_SIZE, current: null };

  function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function readJSON(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }

  function defaultSettings() {
    return { mode: 'qualifying', sort: null, reverse: false, commissions: {}, excluded: { books: [], exchanges: [], sports: [] } };
  }
  var settings = Object.assign(defaultSettings(), readJSON(storeGet(SETTINGS_STORE)) || {});
  settings.excluded = Object.assign(defaultSettings().excluded, settings.excluded || {});
  function saveSettings() { storeSet(SETTINGS_STORE, JSON.stringify(settings)); }

  function money(n) { return (n < 0 ? '-' : '') + '£' + Math.abs(n).toFixed(2); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function num(id) { var v = parseFloat($(id).value); return isNaN(v) ? 0 : v; }
  function mode() { return document.querySelector('input[name="om-mode"]:checked').value; }

  function ago(iso) {
    var mins = Math.round((Date.now() - Date.parse(iso)) / 60e3);
    if (isNaN(mins)) return '';
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    var h = Math.round(mins / 60);
    if (h < 48) return h + (h === 1 ? ' hour ago' : ' hours ago');
    return Math.round(h / 24) + ' days ago';
  }

  function setStatus(parts, isError) {
    var s = $('om-status');
    s.className = 'om-status' + (isError ? ' error' : '');
    s.innerHTML = '';
    parts.forEach(function (p) { s.append(p); });
  }

  function sourceTag() {
    if (state.source === 'demo') return el('span', 'tag demo', 'SAMPLE ODDS');
    if (state.source === 'live') return el('span', 'tag live', 'LIVE');
    if (state.source === 'site') return el('span', 'tag site', 'REAL ODDS');
    return '';
  }

  // ---------- Restore saved filters ----------
  var modeRadio = document.querySelector('input[name="om-mode"][value="' + settings.mode + '"]');
  if (modeRadio) modeRadio.checked = true;
  FILTER_FIELDS.forEach(function (id) { if (settings[id] != null) $(id).value = settings[id]; });

  // ---------- Loading odds ----------
  function useEvents(events, source, loadedAt) {
    state.events = events;
    state.source = source;
    state.loadedAt = loadedAt;
    rebuild();
  }

  function loadOdds() {
    MBSession.api('GET', '/api/odds').then(function (d) {
      useEvents(d.events, d.source === 'live' ? 'site' : 'demo', d.fetchedAt);
      if (d.source !== 'live') {
        setStatus([sourceTag(), 'These prices are made up so you can see how the oddsmatcher works. Real odds appear once the site is connected to an odds feed.']);
      } else if (d.stale) {
        setStatus([sourceTag(), 'Couldn\'t refresh the odds just now, so these are from ' + ago(d.fetchedAt) + '. Check prices carefully.']);
      } else {
        setStatus([sourceTag(), d.events.length + ' upcoming events. Odds updated ' + ago(d.fetchedAt) + '.']);
      }
    }, function (err) {
      setStatus([err.message], true);
    });
  }

  // ---------- Filter checklists ----------
  function uniqueBy(rows, keyField, labelField) {
    var map = {};
    rows.forEach(function (r) { map[r[keyField]] = r[labelField]; });
    return Object.keys(map).sort(function (a, b) { return map[a].localeCompare(map[b]); })
      .map(function (k) { return { key: k, label: map[k] }; });
  }

  function renderChecklist(boxId, countId, items, group, extra) {
    var box = $(boxId);
    box.innerHTML = '';
    items.forEach(function (it) {
      var label = el('label');
      var cb = el('input');
      cb.type = 'checkbox';
      cb.checked = settings.excluded[group].indexOf(it.key) === -1;
      cb.addEventListener('change', function () {
        settings.excluded[group] = settings.excluded[group].filter(function (x) { return x !== it.key; });
        if (!cb.checked) settings.excluded[group].push(it.key);
        saveSettings();
        updateCount(countId, items, group);
        state.shown = PAGE_SIZE;
        render();
      });
      label.append(cb, it.label);
      if (extra) {
        var row = el('div', 'check-row');
        row.appendChild(label);
        extra(row, it);
        box.appendChild(row);
      } else {
        box.appendChild(label);
      }
    });
    if (!items.length) box.append(el('span', 'muted', 'Load odds to see options.'));
    updateCount(countId, items, group);
  }

  function updateCount(countId, items, group) {
    var on = items.filter(function (it) { return settings.excluded[group].indexOf(it.key) === -1; }).length;
    $(countId).textContent = items.length ? '(' + on + '/' + items.length + ')' : '';
  }

  function commissionInput(row, it) {
    var input = el('input', 'comm');
    input.type = 'number';
    input.min = '0';
    input.max = '20';
    input.step = '0.1';
    input.setAttribute('aria-label', it.label + ' commission %');
    var c = settings.commissions[it.key];
    input.value = c != null ? c : MBOdds.EXCHANGES[it.key].commission;
    input.addEventListener('input', function () {
      var v = parseFloat(input.value);
      if (isNaN(v)) delete settings.commissions[it.key]; else settings.commissions[it.key] = v;
      saveSettings();
      rebuild(true);
    });
    row.append(input, el('span', 'muted', '%'));
  }

  function renderChecklists() {
    var exchanges = Object.keys(MBOdds.EXCHANGES).filter(function (k) { return k !== 'betfair_ex_eu'; })
      .map(function (k) { return { key: k, label: MBOdds.EXCHANGES[k].title }; });
    var sports = uniqueBy(state.rows, 'sportKey', 'sport');
    renderChecklist('om-sports', 'om-sport-count', sports, 'sports');
    renderChecklist('om-books', 'om-book-count', uniqueBy(state.rows, 'bookmakerKey', 'bookmaker'), 'books');
    renderChecklist('om-exchanges', 'om-ex-count', exchanges, 'exchanges', commissionInput);
  }

  // ---------- Table ----------
  function rebuild(keepLists) {
    state.rows = MBOdds.buildMatches(state.events, settings.commissions);
    if (!keepLists) renderChecklists();
    state.shown = PAGE_SIZE;
    render();
  }

  function allowed(group, keys) {
    var ex = settings.excluded[group];
    if (!ex.length) return null;
    var ok = keys.filter(function (k) { return ex.indexOf(k) === -1; });
    return ok.length ? ok : ['__none__'];
  }

  function ratingBadge(value, kind) {
    var great = kind === 'snr' ? 80 : 98;
    var good = kind === 'snr' ? 75 : 95;
    var cls = 'rating' + (kind === 'normal' && value >= 100 ? ' arb' : value >= great ? ' great' : value >= good ? ' good' : '');
    return el('span', cls, value.toFixed(2) + '%');
  }

  function updateSortHeaders(activeSort) {
    document.querySelectorAll('.om-table .sort').forEach(function (b) {
      var active = b.dataset.sort === activeSort;
      var th = b.closest('th');
      if (active) {
        // Time sorts soonest first; the others sort highest first.
        var asc = b.dataset.sort === 'time' ? !settings.reverse : settings.reverse;
        b.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
        th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
      } else {
        b.removeAttribute('aria-sort');
        th.removeAttribute('aria-sort');
      }
    });
  }

  function render() {
    var m = mode();
    var activeSort = settings.sort || (m === 'free-snr' ? 'snrRating' : 'rating');
    var keysOf = function (field) {
      return state.rows.map(function (r) { return r[field]; }).filter(function (k, i, a) { return a.indexOf(k) === i; });
    };
    var rows = MBOdds.filterAndSort(state.rows, {
      mode: m,
      sort: activeSort,
      reverse: settings.reverse,
      minOdds: num('om-min'),
      maxOdds: num('om-max'),
      minRating: num('om-rating'),
      hoursAhead: num('om-hours'),
      search: $('om-search').value,
      bookmakers: allowed('books', keysOf('bookmakerKey')),
      exchanges: allowed('exchanges', Object.keys(MBOdds.EXCHANGES)),
      sports: allowed('sports', keysOf('sportKey'))
    });
    state.visible = rows;
    updateSortHeaders(activeSort);

    $('om-count').textContent = state.events.length
      ? rows.length + ' match' + (rows.length === 1 ? '' : 'es') + (state.loadedAt ? ' · odds updated ' + ago(state.loadedAt) : '')
      : '';

    var tbody = $('om-rows');
    tbody.innerHTML = '';
    if (!rows.length) {
      var td = tbody.insertRow().insertCell();
      td.colSpan = 10;
      td.className = 'empty';
      td.textContent = state.events.length ? 'No matches fit these filters. Try widening the odds range or lowering the minimum rating.'
        : 'Loading odds…';
    }
    rows.slice(0, state.shown).forEach(function (r, i) {
      var tr = tbody.insertRow();
      tr.tabIndex = 0;
      tr.dataset.index = i;
      tr.setAttribute('aria-label', r.selection + ', ' + r.bookmaker + ' ' + r.backOdds + ', lay ' + r.layOdds + ' at ' + r.exchange + '. Open calculator.');

      var d = new Date(r.commenceTime);
      var when = tr.insertCell();
      when.className = 'when';
      when.append(el('strong', null, d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })),
        d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));

      var ev = tr.insertCell();
      ev.className = 'ev';
      ev.append(el('strong', null, r.event), el('span', 'sub', r.sport));

      var bet = tr.insertCell();
      bet.className = 'bet';
      bet.textContent = r.selection;

      var rc = tr.insertCell();
      rc.className = 'num';
      rc.appendChild(ratingBadge(r.rating, 'normal'));
      var sc = tr.insertCell();
      sc.className = 'num';
      sc.appendChild(ratingBadge(r.snrRating, 'snr'));

      var bk = tr.insertCell();
      bk.append(r.bookmaker, el('span', 'sub', r.backUpdated ? ago(r.backUpdated) : ''));
      var bo = tr.insertCell();
      bo.className = 'num';
      bo.appendChild(el('span', 'price back', r.backOdds.toFixed(2)));

      var ex = tr.insertCell();
      ex.append(r.exchange, el('span', 'sub', r.commission + '% comm.'));
      var lo = tr.insertCell();
      lo.className = 'num';
      lo.appendChild(el('span', 'price lay', r.layOdds.toFixed(2)));

      var cc = tr.insertCell();
      var btn = el('button', 'calc-btn');
      btn.type = 'button';
      btn.innerHTML = CALC_ICON;
      btn.setAttribute('aria-label', 'Open calculator for ' + r.selection + ' at ' + r.bookmaker);
      btn.tabIndex = -1;
      cc.appendChild(btn);
    });
    $('om-more').hidden = rows.length <= state.shown;
  }

  // ---------- Pop-up calculator ----------
  var dialog = $('om-calc');

  function calcType() { return document.querySelector('input[name="om-c-type"]:checked').value; }

  function openCalc(r) {
    state.current = r;
    $('om-calc-title').textContent = r.event;
    var d = new Date(r.commenceTime);
    $('om-calc-sub').textContent = 'Bet: ' + r.selection + ' · ' + d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) +
      ' · ' + r.sport;
    $('om-c-back-label').textContent = 'Back odds (' + r.bookmaker + ')';
    $('om-c-lay-label').textContent = 'Lay odds (' + r.exchange + ')';
    var t = document.querySelector('input[name="om-c-type"][value="' + mode() + '"]');
    if (t) t.checked = true;
    $('om-c-stake').value = num('om-stake') || 10;
    $('om-c-back').value = r.backOdds;
    $('om-c-lay').value = r.layOdds;
    $('om-c-comm').value = r.commission;
    renderCalc();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function setSigned(node, n) {
    node.textContent = money(n);
    node.classList.toggle('pos', n > 0);
    node.classList.toggle('neg', n < 0);
  }

  function renderCalc() {
    var input = {
      betType: calcType(),
      backStake: parseFloat($('om-c-stake').value),
      backOdds: parseFloat($('om-c-back').value),
      layOdds: parseFloat($('om-c-lay').value),
      commission: parseFloat($('om-c-comm').value)
    };
    var r = MBCalc.calculate(input);
    var ids = ['om-c-laystake', 'om-c-liability', 'om-c-backwin', 'om-c-laywin'];
    if (!r.ok) {
      ids.forEach(function (id) { $(id).textContent = '–'; $(id).classList.remove('pos', 'neg'); });
      $('om-c-instruction').textContent = r.errors[0];
      return;
    }
    $('om-c-laystake').textContent = money(r.layStake);
    $('om-c-liability').textContent = money(r.liability);
    setSigned($('om-c-backwin'), r.profitIfBackWins);
    setSigned($('om-c-laywin'), r.profitIfLayWins);
    var ins = $('om-c-instruction');
    ins.innerHTML = '';
    ins.append('Back ', el('strong', null, money(input.backStake)), ' at ', el('strong', null, String(input.backOdds)),
      ' with ' + state.current.bookmaker + ', then lay ', el('strong', null, money(r.layStake)), ' at ',
      el('strong', null, String(input.layOdds)), ' on ' + state.current.exchange + '.');

    var common = { type: input.betType, stake: input.backStake };
    var log = new URLSearchParams(Object.assign({ profit: r.guaranteedProfit.toFixed(2) }, common)).toString();
    var full = new URLSearchParams(Object.assign({ backOdds: input.backOdds, layOdds: input.layOdds, commission: input.commission }, common)).toString();
    $('om-c-log').href = 'tracker.html?' + log;
    $('om-c-log').dataset.prefill = log;
    $('om-c-full').href = 'calculator.html?' + full;
    $('om-c-full').dataset.prefill = full;
  }

  $('om-calc-form').addEventListener('input', renderCalc);
  $('om-c-log').addEventListener('click', function () {
    try { sessionStorage.setItem('mb.prefill', this.dataset.prefill || ''); } catch (e) { /* ignore */ }
  });
  $('om-c-full').addEventListener('click', function () {
    try { sessionStorage.setItem('mb.calc.prefill', this.dataset.prefill || ''); } catch (e) { /* ignore */ }
  });
  dialog.addEventListener('click', function (e) {
    if (e.target === dialog) dialog.close(); // click on the backdrop
  });

  // ---------- Events ----------
  function rowFromEvent(e) {
    var tr = e.target.closest('#om-rows tr[data-index]');
    return tr ? state.visible[+tr.dataset.index] : null;
  }
  $('om-rows').addEventListener('click', function (e) {
    var r = rowFromEvent(e);
    if (r) openCalc(r);
  });
  $('om-rows').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var r = rowFromEvent(e);
    if (r) { e.preventDefault(); openCalc(r); }
  });

  document.querySelectorAll('.om-table .sort').forEach(function (b) {
    b.addEventListener('click', function () {
      var current = settings.sort || (mode() === 'free-snr' ? 'snrRating' : 'rating');
      if (current === b.dataset.sort) settings.reverse = !settings.reverse;
      else { settings.sort = b.dataset.sort; settings.reverse = false; }
      saveSettings();
      render();
    });
  });


  document.querySelector('.om-side').addEventListener('input', function (e) {
    if (e.target.closest('.checklist')) return;
    if (e.target.name === 'om-mode') {
      settings.mode = mode();
      settings.sort = null; // follow the rating type
      settings.reverse = false;
    }
    FILTER_FIELDS.forEach(function (id) { settings[id] = $(id).value; });
    saveSettings();
    state.shown = PAGE_SIZE;
    render();
  });

  $('om-reset').addEventListener('click', function () {
    var keep = { commissions: settings.commissions };
    settings = Object.assign(defaultSettings(), keep);
    saveSettings();
    $('om-mode-q').checked = true;
    FILTER_FIELDS.forEach(function (id) { $(id).value = id === 'om-stake' ? 10 : id === 'om-hours' ? 0 : ''; });
    $('om-search').value = '';
    rebuild();
  });

  $('om-books-all').addEventListener('click', function () {
    settings.excluded.books = [];
    saveSettings();
    renderChecklists();
    render();
  });
  $('om-books-none').addEventListener('click', function () {
    settings.excluded.books = uniqueBy(state.rows, 'bookmakerKey', 'bookmaker').map(function (it) { return it.key; });
    saveSettings();
    renderChecklists();
    render();
  });
  $('om-more').addEventListener('click', function () {
    state.shown += PAGE_SIZE;
    render();
  });

  // ---------- Start ----------
  // Filters handed over by an offer guide's "Find a match" button.
  (function applyPrefill() {
    var pre;
    try {
      pre = JSON.parse(sessionStorage.getItem('mb.om.prefill'));
      sessionStorage.removeItem('mb.om.prefill');
    } catch (e) { pre = null; }
    if (!pre) return;
    var radio = document.querySelector('input[name="om-mode"][value="' + pre.mode + '"]');
    if (radio) radio.checked = true;
    $('om-min').value = pre.minOdds || '';
    $('om-max').value = '';
    $('om-rating').value = '';
    if (pre.stake) $('om-stake').value = pre.stake;
    settings.mode = mode();
    settings.sort = null;
    settings.reverse = false;
    FILTER_FIELDS.forEach(function (id) { settings[id] = $(id).value; });
    saveSettings();
  })();
  render();
  loadOdds();
})();
