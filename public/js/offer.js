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

  function kickoff(iso) {
    return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function betBox(kind, heading, rows, link, linkLabel, note) {
    var box = el('div', 'bet-box ' + kind);
    box.appendChild(el('div', 'bet-box-head', heading));
    var dl = el('dl');
    rows.forEach(function (r) { dl.append(el('dt', null, r[0]), el('dd', null, r[1])); });
    box.appendChild(dl);
    if (note) box.appendChild(el('p', 'bet-box-note', note));
    if (link) {
      var a = el('a', 'btn small ' + kind, linkLabel + ' ↗');
      a.href = link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      box.appendChild(a);
    }
    return box;
  }

  // "Show me exactly what to bet": the best current match for this step, with stakes and links.
  function planPanel(step) {
    var wrap = el('div', 'plan');
    var show = el('button', 'btn small', 'Show me exactly what to bet');
    show.type = 'button';
    var out = el('div', 'plan-out');
    out.setAttribute('aria-live', 'polite');
    show.addEventListener('click', function () {
      show.disabled = true;
      out.textContent = 'Finding the best match…';
      api('GET', '/api/offers/' + offer.id + '/plan?step=' + step).then(function (d) {
        renderPlan(out, d, step);
        show.textContent = 'Find the best match again';
      }, function (err) {
        out.textContent = err.message;
      }).then(function () { show.disabled = false; });
    });
    wrap.append(show, out);
    return wrap;
  }

  function renderPlan(out, d, step) {
    out.innerHTML = '';
    var p = d.plan;
    if (!p.ok) {
      out.appendChild(el('p', 'plan-none', p.message));
      return;
    }
    if (d.sample) out.appendChild(el('p', 'plan-sample', 'Sample odds for testing. Don\'t place real bets from these.'));
    out.appendChild(el('p', 'plan-event', p.event + ' · ' + p.sport + ' · starts ' + kickoff(p.commenceTime)));
    var grid = el('div', 'bet-boxes');
    grid.append(
      betBox('back', '1 · Back at ' + p.back.bookmaker, [
        ['Bet on', MBPlan.betLabel(p.selection)],
        ['Odds', p.back.odds.toFixed(2)],
        ['Stake', money(p.back.stake)]
      ], p.back.link, MBPlan.linkLabel(p.back.bookmaker, p.back.linkLevel),
        (step === 'free' ? 'Use your free bet for this, not your own money. ' : '') + MBPlan.linkHelp(p.back.linkLevel, 'back')),
      betBox('lay', '2 · Lay at ' + p.lay.exchange, [
        ['Lay (bet against)', MBPlan.layLabel(p.selection)],
        ['Odds', p.lay.odds.toFixed(2)],
        ['Lay stake', money(p.lay.stake)],
        ['Liability', money(p.lay.liability)]
      ], p.lay.link, MBPlan.linkLabel(p.lay.exchange, p.lay.linkLevel),
        'Place this straight after step 1. Your ' + p.lay.exchange + ' balance must cover the liability. ' + MBPlan.linkHelp(p.lay.linkLevel, 'lay'))
    );
    out.appendChild(grid);
    out.appendChild(el('p', 'plan-result', p.result >= 0
      ? 'Whatever the result, you keep about ' + money(p.result) + '.'
      : 'Whatever the result, you lose about ' + money(-p.result) + '. That\'s the cost of unlocking the free bets.'));

    var calc = el('a', null, 'work out the new lay stake');
    calc.href = '/calculator.html?' + p.calculatorQuery;
    calc.addEventListener('click', function () {
      try { sessionStorage.setItem('mb.calc.prefill', p.calculatorQuery); } catch (e) { /* ignore */ }
    });
    var warn = el('p', 'plan-warn');
    warn.append('Prices from ' + kickoffTime(d.fetchedAt) + '. Odds move, so check both before you bet. If either has changed, ', calc, '.');
    out.appendChild(warn);

    var row = el('div', 'btn-row');
    var mail = el('button', 'btn small secondary', 'Email me these instructions');
    mail.type = 'button';
    var note = el('span', 'form-note');
    note.setAttribute('role', 'status');
    mail.addEventListener('click', function () {
      mail.disabled = true;
      note.textContent = 'Sending…';
      api('POST', '/api/offers/' + offer.id + '/plan/email', { step: step }).then(function (r) {
        note.textContent = 'Sent to ' + r.to + '. If the odds have changed since, the email has the latest prices.';
      }, function (err) {
        note.textContent = err.message;
        mail.disabled = false;
      });
    });
    row.append(mail, note);
    out.appendChild(row);
  }

  function kickoffTime(iso) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) + ' on ' +
      new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
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
        known(q.window) ? 'Time limit: ' + sentence(q.window) : null,
        planPanel('qualifying')
      ], [matchButton('Browse matches yourself', { mode: 'qualifying', minOdds: q.minOdds || '', stake: q.stake })]));
    }

    if (o.freeBets.length) {
      steps.append(step('Wait for the free bets', [
        (known(o.credited) ? sentence(o.credited) : 'The free bets arrive after the qualifying bet.') +
          (known(o.expiry) ? ' They expire after ' + o.expiry + ', so plan when you\'ll use them.' : ' Check how long you have to use them.')
      ]));

      var firstSingle = MBPlan.singleFreeBet(o);
      o.freeBets.forEach(function (f) {
        var title = 'Use the ' + (f.count > 1 ? f.count + ' × £' + f.value + ' ' : '£' + f.value + ' ') +
          MBOffers.USE_LABELS[f.use].toLowerCase() + (f.count > 1 ? 's' : '');
        var paras = [sentence(f.note), MBOffers.USE_ADVICE[f.use]];
        var actions = [];
        if (f.use === 'single') {
          paras.push(exampleFor(f.value));
          if (f === firstSingle) paras.push(planPanel('free'));
          actions.push(matchButton('Browse matches yourself', { mode: 'free-snr', minOdds: 4, stake: f.value }));
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
