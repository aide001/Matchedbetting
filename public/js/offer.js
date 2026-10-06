(function () {
  'use strict';
  var api = MBSession.api;
  var $ = function (id) { return document.getElementById(id); };
  var offer = null;

  function money(n) { return (n < 0 ? '-' : '') + '£' + Math.abs(n).toFixed(2); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function date(iso) {
    return iso ? new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  }
  // Joins a sentence without doubling its full stop.
  function sentence(t) { return String(t).replace(/[.\s]+$/, '') + '.'; }
  function known(t) { return t && !/^not (stated|confirmed)/i.test(t); }


  // Opens the oddsmatcher with filters set for this step.
  function matchButton(label, prefill) {
    var a = el('a', 'btn small', label);
    a.href = '/oddsmatcher.html';
    a.addEventListener('click', function () {
      try { sessionStorage.setItem('mb.om.prefill', JSON.stringify(prefill)); } catch (e) { /* ignore */ }
    });
    return a;
  }

  function step(title, paragraphs, actions) {
    var li = el('li', 'step');
    li.appendChild(el('h3', null, title));
    paragraphs.filter(Boolean).forEach(function (p) {
      if (typeof p === 'string') li.appendChild(el('p', null, p));
      else li.appendChild(p);
    });
    if (actions && actions.length) {
      var row = el('div', 'btn-row');
      actions.forEach(function (a) { row.appendChild(a); });
      li.appendChild(row);
    }
    return li;
  }

  function fact(label, value) {
    var d = el('div', 'card stat');
    d.append(el('div', 'label', label), el('div', 'value', value));
    return d;
  }

  function exampleFor(value) {
    var r = MBCalc.calculate({ backStake: value, backOdds: 5, layOdds: 5.2, commission: 2, betType: 'free-snr' });
    return 'Example: a £' + value + ' free bet backed at 5.0 and laid at 5.2 with 2% commission means laying ' +
      money(r.layStake) + ' (liability ' + money(r.liability) + '), which locks in about ' + money(r.guaranteedProfit) + ' whatever happens.';
  }

  function render(o) {
    offer = o;
    document.title = o.bookmaker + ' offer guide – MatchedBet';
    $('g-kind').textContent = o.kind === 'exchange' ? 'Exchange offer' : 'Sports sign-up offer';
    $('g-bookmaker').textContent = o.bookmaker;
    $('g-headline').textContent = o.headline;

    var banner = $('g-check');
    var labels = {
      checked: 'Terms checked',
      conflicting: 'Sources disagree',
      partial: 'Details not fully confirmed'
    };
    banner.className = 'check-banner ' + o.check.status;
    banner.innerHTML = '';
    banner.append(el('strong', null, labels[o.check.status] + '. '),
      'Researched on ' + date(o.checkedOn) + ' from ' + o.source.name + (o.source.updated ? ' (page updated ' + date(o.source.updated) + ')' : '') + '. ' +
      (o.check.note ? o.check.note + ' ' : '') + 'Offers change often, so always confirm the terms on ' + o.bookmaker + '\'s own site before you bet.');

    var facts = $('g-facts');
    facts.innerHTML = '';
    var est = MBOffers.estimateProfit(o);
    if (o.qualifying) {
      facts.append(fact('Qualifying bet', '£' + o.qualifying.stake + (o.qualifying.minOdds ? ' at ' + o.qualifying.minOdds.toFixed(2) + '+' : ', odds not confirmed')));
    }
    if (o.freeBets.length) facts.append(fact('Free bets', '£' + MBOffers.freeBetTotal(o)));
    if (known(o.expiry)) facts.append(fact(o.freeBets.length ? 'Free bets expire' : 'Lasts', o.expiry));
    facts.append(fact('Rough profit estimate', est == null ? 'n/a' : '£' + est));

    var steps = $('g-steps');
    steps.innerHTML = '';

    steps.append(step('Open your account', [
      'Sign up at ' + o.bookmaker + (o.promoCode ? ' and enter the code ' + o.promoCode + ' if it asks for one' : '') + '. Use your real details: bookmakers check ID before you can withdraw.',
      o.payments
    ]));

    if (o.id === 'betfair-exchange') {
      steps.append(step('Use the Betfair Sportsbook offer', [
        'Betfair\'s welcome offer is on the Sportsbook, and the same account gives you the Exchange. Follow the Betfair Sportsbook guide for the free bets.'
      ], [Object.assign(el('a', 'btn small', 'Betfair Sportsbook guide'), { href: '/offer.html#betfair-sportsbook' })]));
    } else if (!o.qualifying && o.kind === 'exchange') {
      steps.append(step('Lay your bets here', [
        'While the offer lasts (' + (o.expiry || 'see terms') + '), lay your qualifying bets and free bets on ' + o.bookmaker + '. In the oddsmatcher\'s Exchanges filter, set ' + o.bookmaker + '\'s commission to 0% until the offer ends, so ratings come out right.'
      ]));
    }

    if (o.qualifying) {
      var q = o.qualifying;
      var loss = MBOffers.qualifyingLoss(o);
      steps.append(step('Place the qualifying bet', [
        'Back £' + q.stake + (q.minOdds ? ' at odds of ' + q.minOdds.toFixed(2) + ' or more. ' : '. The minimum odds weren\'t in our sources, so check them first. ') +
          (known(q.markets) ? sentence(q.markets) : ''),
        'Lay it at an exchange straight away using the stake the calculator gives you. With a close match you\'ll lose around ' + money(loss) + ' whatever the result. That\'s the cost of unlocking the free bets.',
        known(q.window) ? 'Time limit: ' + sentence(q.window) : null
      ], [matchButton('Find a qualifying match', { mode: 'qualifying', minOdds: q.minOdds || '', stake: q.stake })]));
    }

    if (o.freeBets.length) {
      steps.append(step('Wait for the free bets', [
        (known(o.credited) ? sentence(o.credited) : 'The free bets arrive after the qualifying bet.') +
          (known(o.expiry) ? ' They expire after ' + o.expiry + ', so plan when you\'ll use them.' : ' Check how long you have to use them.')
      ]));

      o.freeBets.forEach(function (f) {
        var title = 'Use the ' + (f.count > 1 ? f.count + ' × £' + f.value + ' ' : '£' + f.value + ' ') +
          MBOffers.USE_LABELS[f.use].toLowerCase() + (f.count > 1 ? 's' : '');
        var paras = [sentence(f.note), MBOffers.USE_ADVICE[f.use]];
        var actions = [];
        if (f.use === 'single') {
          paras.push(exampleFor(f.value));
          actions.push(matchButton('Find a free bet match', { mode: 'free-snr', minOdds: 4, stake: f.value }));
        }
        steps.append(step(title, paras, actions));
      });
    }

    var track = el('a', null, 'profit tracker');
    track.href = '/tracker.html';
    var p = el('p');
    p.append('Log each bet in the ', track, ', then set this offer to Done above and enter what you made.');
    steps.append(step('Record your profit', [p]));

    var terms = $('g-terms');
    terms.innerHTML = '';
    o.terms.forEach(function (t) { terms.appendChild(el('li', null, t)); });

    var src = $('g-source');
    src.innerHTML = '';
    var a = el('a', null, o.source.name);
    a.href = o.source.url;
    a.rel = 'noopener';
    src.append('Source: ', a, '. MatchedBet isn\'t affiliated with ' + o.bookmaker + '. Estimates assume you match carefully and are only a rough guide.');

    $('g-status').value = o.status;
    $('g-profit').value = o.profit == null ? '' : o.profit;
    $('guide').hidden = false;
  }

  function save() {
    var v = $('g-profit').value === '' ? null : Math.round(parseFloat($('g-profit').value) * 100) / 100;
    if (v !== null && isNaN(v)) { $('g-note').textContent = 'Enter the profit as a number.'; return; }
    $('g-note').textContent = 'Saving…';
    api('PUT', '/api/offers/' + offer.id, { status: $('g-status').value, profit: v }).then(function () {
      $('g-note').textContent = 'Saved.';
    }, function (err) { $('g-note').textContent = err.message; });
  }
  $('g-status').addEventListener('change', save);
  $('g-profit').addEventListener('change', function () {
    if ($('g-status').value === 'not-started' && $('g-profit').value !== '') $('g-status').value = 'in-progress';
    save();
  });

  function load() {
    var id = decodeURIComponent(location.hash.slice(1));
    api('GET', '/api/offers').then(function (d) {
      var o = d.offers.find(function (x) { return x.id === id; });
      $('guide').hidden = !o;
      $('guide-missing').hidden = !!o;
      if (o) render(o);
      window.scrollTo(0, 0);
    }, function (err) {
      $('guide-missing').hidden = false;
      $('guide-missing').querySelector('p').textContent = err.message;
    });
  }
  window.addEventListener('hashchange', load);
  load();
})();
