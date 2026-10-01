(function () {
  'use strict';

  var API = 'https://api.the-odds-api.com/v4/sports/';
  var KEY_STORE = 'mb.odds.key';
  var SETTINGS_STORE = 'mb.odds.settings.v1';
  var CACHE_STORE = 'mb.odds.cache.v1';
  var PAGE_SIZE = 50;
  var SPORTS = [
    ['upcoming', 'Next games, all sports'],
    ['soccer_epl', 'Football – Premier League'],
    ['soccer_efl_champ', 'Football – Championship'],
    ['soccer_england_league1', 'Football – League One'],
    ['soccer_england_league2', 'Football – League Two'],
    ['soccer_fa_cup', 'Football – FA Cup'],
    ['soccer_spl', 'Football – Scottish Premiership'],
    ['soccer_uefa_champs_league', 'Football – Champions League'],
    ['soccer_uefa_europa_league', 'Football – Europa League'],
    ['soccer_spain_la_liga', 'Football – La Liga'],
    ['soccer_germany_bundesliga', 'Football – Bundesliga'],
    ['soccer_italy_serie_a', 'Football – Serie A'],
    ['soccer_france_ligue_one', 'Football – Ligue 1'],
    ['basketball_nba', 'Basketball – NBA'],
    ['americanfootball_nfl', 'American football – NFL'],
    ['icehockey_nhl', 'Ice hockey – NHL'],
    ['mma_mixed_martial_arts', 'MMA'],
    ['boxing_boxing', 'Boxing']
  ];

  var $ = function (id) { return document.getElementById(id); };
  var state = { events: [], source: null, loadedAt: null, rows: [], shown: PAGE_SIZE };
  var settings = readJSON(localStorage_get(SETTINGS_STORE)) || {};
  settings.commissions = settings.commissions || {};
  settings.excludedBooks = settings.excludedBooks || [];

  function localStorage_get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function localStorage_set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function readJSON(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function saveSettings() { localStorage_set(SETTINGS_STORE, JSON.stringify(settings)); }

  function money(n) { return (n < 0 ? '-' : '') + '£' + Math.abs(n).toFixed(2); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function mode() { return document.querySelector('input[name="om-mode"]:checked').value; }
  function num(id) { var v = parseFloat($(id).value); return isNaN(v) ? 0 : v; }

  function ago(iso) {
    var mins = Math.round((Date.now() - Date.parse(iso)) / 60e3);
    if (isNaN(mins)) return '';
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    var h = Math.round(mins / 60);
    return h + (h === 1 ? ' hour ago' : ' hours ago');
  }

  function kickoff(iso) {
    var d = new Date(iso);
    return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
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
    return '';
  }

  // ---- Setup controls ----
  SPORTS.forEach(function (s) {
    var o = el('option', null, s[1]);
    o.value = s[0];
    $('om-sport').appendChild(o);
  });
  $('om-sport').value = settings.sport || 'soccer_epl';
  $('om-key').value = localStorage_get(KEY_STORE) || '';
  if (settings.mode) {
    var r = document.querySelector('input[name="om-mode"][value="' + settings.mode + '"]');
    if (r) r.checked = true;
  }
  ['om-stake', 'om-min', 'om-max', 'om-rating', 'om-hours'].forEach(function (id) {
    if (settings[id] != null) $(id).value = settings[id];
  });

  Object.keys(MBOdds.EXCHANGES).filter(function (k) { return k !== 'betfair_ex_eu'; }).forEach(function (k) {
    var ex = MBOdds.EXCHANGES[k];
    var f = el('div', 'field');
    var label = el('label', null, ex.title + ' (%)');
    label.htmlFor = 'om-comm-' + k;
    var input = el('input');
    input.id = 'om-comm-' + k;
    input.type = 'number';
    input.min = '0';
    input.max = '20';
    input.step = '0.1';
    input.value = settings.commissions[k] != null ? settings.commissions[k] : ex.commission;
    input.addEventListener('input', function () {
      var v = parseFloat(input.value);
      if (isNaN(v)) delete settings.commissions[k]; else settings.commissions[k] = v;
      if (k === 'betfair_ex_uk') settings.commissions.betfair_ex_eu = settings.commissions[k];
      saveSettings();
      rebuild();
    });
    f.append(label, input);
    $('om-commissions').appendChild(f);
  });

  // ---- Loading data ----
  function useEvents(events, source, loadedAt) {
    state.events = events;
    state.source = source;
    state.loadedAt = loadedAt;
    rebuild();
  }

  function loadDemo() {
    useEvents(MBDemoOdds.makeDemoOdds(Date.now()), 'demo', new Date().toISOString());
    setStatus([sourceTag(), 'These prices are made up so you can try the oddsmatcher. Add an API key to load real odds.']);
  }

  function loadLive() {
    var key = $('om-key').value.trim();
    var sport = $('om-sport').value;
    if (!key) {
      setStatus(['Paste your API key first. You can get a free one at the-odds-api.com.'], true);
      $('om-key').focus();
      return;
    }
    localStorage_set(KEY_STORE, key);
    var url = API + encodeURIComponent(sport) + '/odds/?' + new URLSearchParams({
      apiKey: key, regions: 'uk', markets: 'h2h,h2h_lay', oddsFormat: 'decimal', dateFormat: 'iso'
    });
    $('om-load').disabled = true;
    setStatus(['Loading odds…']);
    fetch(url).then(function (res) {
      var remaining = res.headers.get('x-requests-remaining');
      return res.json().catch(function () { return null; }).then(function (body) {
        if (!res.ok) {
          var msg = body && body.message ? body.message : 'The Odds API returned an error (' + res.status + ').';
          if (res.status === 401) msg = 'The Odds API didn\'t accept that key. Check it and try again.';
          if (res.status === 429) msg = 'You\'ve used up your API requests or are sending them too quickly. Wait a moment, or check your plan.';
          throw new Error(msg);
        }
        var loadedAt = new Date().toISOString();
        var cache = readJSON(localStorage_get(CACHE_STORE)) || {};
        cache[sport] = { events: body, loadedAt: loadedAt };
        localStorage_set(CACHE_STORE, JSON.stringify(cache));
        useEvents(body, 'live', loadedAt);
        var parts = [sourceTag(), body.length + ' events loaded.'];
        if (remaining != null) parts.push(' ' + remaining + ' API requests left this month.');
        if (!body.length) parts = [sourceTag(), 'No upcoming events for this sport right now. Try another sport.'];
        setStatus(parts);
      });
    }).catch(function (err) {
      var msg = err && err.message && err.message !== 'Failed to fetch' ? err.message
        : 'Couldn\'t reach The Odds API. Check your connection. Some hosts and browser extensions block it.';
      setStatus([msg], true);
    }).then(function () {
      $('om-load').disabled = false;
    });
  }

  // ---- Filtering and rendering ----
  function rebuild() {
    state.rows = MBOdds.buildMatches(state.events, settings.commissions);
    renderBookmakers();
    state.shown = PAGE_SIZE;
    render();
  }

  function renderBookmakers() {
    var seen = {};
    state.rows.forEach(function (r) { seen[r.bookmakerKey] = r.bookmaker; });
    var box = $('om-books');
    box.innerHTML = '';
    var keys = Object.keys(seen).sort(function (a, b) { return seen[a].localeCompare(seen[b]); });
    keys.forEach(function (k) {
      var label = el('label', 'chip');
      var cb = el('input');
      cb.type = 'checkbox';
      cb.checked = settings.excludedBooks.indexOf(k) === -1;
      cb.addEventListener('change', function () {
        settings.excludedBooks = settings.excludedBooks.filter(function (x) { return x !== k; });
        if (!cb.checked) settings.excludedBooks.push(k);
        saveSettings();
        state.shown = PAGE_SIZE;
        render();
      });
      label.append(cb, seen[k]);
      box.appendChild(label);
    });
    if (!keys.length) box.append(el('span', 'muted', 'Load odds to choose bookmakers.'));
  }

  function bookCount() {
    var all = $('om-books').querySelectorAll('input');
    var on = $('om-books').querySelectorAll('input:checked');
    $('om-book-count').textContent = all.length ? '(' + on.length + ' of ' + all.length + ')' : '';
  }

  function render() {
    var m = mode();
    var stake = num('om-stake') || 10;
    var allBooks = Object.keys(state.rows.reduce(function (a, r) { a[r.bookmakerKey] = 1; return a; }, {}));
    var allowed = allBooks.filter(function (k) { return settings.excludedBooks.indexOf(k) === -1; });
    var rows = MBOdds.filterAndSort(state.rows, {
      mode: m,
      minOdds: num('om-min'),
      maxOdds: num('om-max'),
      minRating: num('om-rating'),
      hoursAhead: num('om-hours'),
      search: $('om-search').value,
      bookmakers: allowed.length === allBooks.length ? null : (allowed.length ? allowed : ['__none__'])
    });

    $('om-result-h').textContent = m === 'free-snr' ? 'Free bet profit' : 'Result';
    $('om-count').textContent = state.events.length
      ? rows.length + ' match' + (rows.length === 1 ? '' : 'es') + (state.loadedAt ? ' · odds loaded ' + ago(state.loadedAt) : '')
      : '';
    bookCount();

    var tbody = $('om-rows');
    tbody.innerHTML = '';
    if (!rows.length) {
      var td = tbody.insertRow().insertCell();
      td.colSpan = 8;
      td.className = 'empty';
      td.textContent = state.events.length ? 'No matches fit these filters. Try widening the odds range or lowering the minimum rating.'
        : 'Load live odds or use the sample odds to see matches.';
    }
    rows.slice(0, state.shown).forEach(function (r) {
      var input = { backStake: stake, backOdds: r.backOdds, layOdds: r.layOdds, commission: r.commission, betType: m };
      var calc = MBCalc.calculate(input);
      var rating = m === 'free-snr' ? r.snrRating : r.rating;
      var tr = tbody.insertRow();

      var rc = tr.insertCell();
      rc.className = 'num';
      var great = m === 'free-snr' ? 80 : 98;
      var good = m === 'free-snr' ? 75 : 95;
      var badge = el('span', 'rating' + (rating >= great ? ' great' : rating >= good ? ' good' : '') +
        (m === 'qualifying' && rating >= 100 ? ' arb' : ''), rating.toFixed(1) + '%');
      rc.appendChild(badge);

      var ec = tr.insertCell();
      ec.append(el('strong', null, r.event), el('span', 'sub', kickoff(r.commenceTime) + ' · ' + r.sport));

      tr.insertCell().textContent = r.selection;

      var bc = tr.insertCell();
      bc.append(el('span', 'price back', r.backOdds.toFixed(2)), ' ', r.bookmaker,
        el('span', 'sub', r.backUpdated ? 'updated ' + ago(r.backUpdated) : ''));

      var lc = tr.insertCell();
      lc.append(el('span', 'price lay', r.layOdds.toFixed(2)), ' ', r.exchange,
        el('span', 'sub', r.commission + '% commission'));

      var pc = tr.insertCell();
      pc.className = 'num ' + (calc.guaranteedProfit > 0 ? 'pos' : calc.guaranteedProfit < 0 ? 'neg' : '');
      pc.textContent = money(calc.guaranteedProfit);

      var li = tr.insertCell();
      li.className = 'num';
      li.textContent = money(calc.liability);

      var params = new URLSearchParams({
        type: m, stake: stake, backOdds: r.backOdds, layOdds: r.layOdds, commission: r.commission
      }).toString();
      var a = el('a', 'btn small secondary', 'Calculate');
      a.href = 'calculator.html?' + params;
      a.setAttribute('aria-label', 'Open in calculator: ' + r.selection + ' at ' + r.bookmaker);
      a.addEventListener('click', function () {
        try { sessionStorage.setItem('mb.calc.prefill', params); } catch (e) { /* ignore */ }
      });
      tr.insertCell().appendChild(a);
    });
    $('om-more').hidden = rows.length <= state.shown;
  }

  // ---- Events ----
  $('om-load').addEventListener('click', loadLive);
  $('om-demo').addEventListener('click', loadDemo);
  $('om-key').addEventListener('keydown', function (e) { if (e.key === 'Enter') loadLive(); });
  $('om-sport').addEventListener('change', function () {
    settings.sport = $('om-sport').value;
    saveSettings();
    var cached = (readJSON(localStorage_get(CACHE_STORE)) || {})[settings.sport];
    if (cached && state.source !== 'demo') {
      useEvents(cached.events, 'live', cached.loadedAt);
      setStatus([sourceTag(), 'Showing odds saved ' + ago(cached.loadedAt) + '. Load live odds to refresh.']);
    }
  });
  document.querySelector('.om-filters').addEventListener('input', function (e) {
    if (e.target.closest('#om-books, #om-commissions')) return;
    settings.mode = mode();
    ['om-stake', 'om-min', 'om-max', 'om-rating', 'om-hours'].forEach(function (id) { settings[id] = $(id).value; });
    saveSettings();
    state.shown = PAGE_SIZE;
    render();
  });
  $('om-books-all').addEventListener('click', function () {
    settings.excludedBooks = [];
    saveSettings();
    renderBookmakers();
    render();
  });
  $('om-books-none').addEventListener('click', function () {
    settings.excludedBooks = state.rows.map(function (r) { return r.bookmakerKey; })
      .filter(function (k, i, a) { return a.indexOf(k) === i; });
    saveSettings();
    renderBookmakers();
    render();
  });
  $('om-more').addEventListener('click', function () {
    state.shown += PAGE_SIZE;
    render();
  });

  // Start with saved live odds for this sport if there are any, otherwise sample odds.
  var cached = (readJSON(localStorage_get(CACHE_STORE)) || {})[$('om-sport').value];
  if (cached && Array.isArray(cached.events)) {
    useEvents(cached.events, 'live', cached.loadedAt);
    setStatus([sourceTag(), 'Showing odds saved ' + ago(cached.loadedAt) + '. Load live odds to refresh.']);
  } else {
    loadDemo();
  }
})();
