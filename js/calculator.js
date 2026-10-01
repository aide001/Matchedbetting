(function () {
  'use strict';

  var STORAGE_KEY = 'mb.calculator.v1';
  var form = document.getElementById('calc-form');
  var $ = function (id) { return document.getElementById(id); };

  var HINTS = {
    'qualifying': 'A bet with your own money, usually placed to unlock a free bet. Expect a small loss.',
    'free-snr': 'Stake not returned: if the free bet wins you get the winnings but not the stake. This is the most common type.',
    'free-sr': 'Stake returned: if the free bet wins you also get the stake back. This type is rare.'
  };

  function money(n) {
    var sign = n < 0 ? '-' : '';
    return sign + '£' + Math.abs(n).toFixed(2);
  }

  function setSigned(el, n) {
    el.textContent = money(n);
    el.classList.toggle('pos', n > 0);
    el.classList.toggle('neg', n < 0);
  }

  function readInput() {
    return {
      betType: form.querySelector('input[name="betType"]:checked').value,
      backStake: parseFloat($('backStake').value),
      backOdds: parseFloat($('backOdds').value),
      layOdds: parseFloat($('layOdds').value),
      commission: parseFloat($('commission').value)
    };
  }

  function save(input) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        betType: input.betType, backStake: input.backStake, backOdds: input.backOdds,
        layOdds: input.layOdds, commission: input.commission
      }));
    } catch (e) { /* storage unavailable; ignore */ }
  }

  function restore() {
    var saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { saved = null; }
    if (!saved) return;
    ['backStake', 'backOdds', 'layOdds', 'commission'].forEach(function (k) {
      if (typeof saved[k] === 'number' && !isNaN(saved[k])) $(k).value = saved[k];
    });
    var radio = form.querySelector('input[name="betType"][value="' + saved.betType + '"]');
    if (radio) radio.checked = true;
  }

  function render() {
    var input = readInput();
    var adjust = parseInt($('layAdjust').value, 10);
    $('layAdjustLabel').textContent = adjust === 100 ? 'Balanced'
      : adjust + '% (' + (adjust < 100 ? 'underlay' : 'overlay') + ')';
    $('bet-type-hint').textContent = HINTS[input.betType];

    var errors = MBCalc.validate(input);
    var errList = $('r-errors');
    if (errors.length) {
      errList.innerHTML = '';
      errors.forEach(function (msg) {
        var li = document.createElement('li');
        li.textContent = msg;
        errList.appendChild(li);
      });
      errList.hidden = false;
      ['r-profit', 'r-lay', 'r-liability', 'r-backwin', 'r-laywin'].forEach(function (id) {
        $(id).textContent = '–';
        $(id).classList.remove('pos', 'neg');
      });
      $('r-rating').textContent = '';
      $('r-instruction').textContent = 'Fix the inputs above to see your lay stake.';
      $('log-bet').href = 'tracker.html';
      $('log-bet').dataset.prefill = '';
      return;
    }
    errList.hidden = true;
    save(input);

    var layStake = MBCalc.idealLayStake(input) * adjust / 100;
    var r = MBCalc.calculate(input, layStake);

    setSigned($('r-profit'), r.guaranteedProfit);
    $('r-rating').textContent = adjust === 100
      ? (input.betType === 'qualifying' ? 'Rating ' : 'Extraction rate ') + r.rating.toFixed(1) + '%'
      : 'Worst-case outcome shown because the lay stake is adjusted';
    $('r-lay').textContent = money(r.layStake);
    $('r-liability').textContent = money(r.liability);
    setSigned($('r-backwin'), r.profitIfBackWins);
    setSigned($('r-laywin'), r.profitIfLayWins);
    $('r-instruction').innerHTML = '';
    $('r-instruction').append(
      'Lay ', strong(money(r.layStake)), ' at odds of ', strong(String(input.layOdds)),
      ', which needs ', strong(money(r.liability)), ' in your exchange account.'
    );

    var params = new URLSearchParams({
      type: input.betType,
      stake: input.backStake,
      profit: r.guaranteedProfit.toFixed(2)
    });
    $('log-bet').href = 'tracker.html?' + params.toString();
    $('log-bet').dataset.prefill = params.toString();
  }

  function strong(text) {
    var s = document.createElement('strong');
    s.textContent = text;
    return s;
  }

  // Also hand the values over via sessionStorage, for hosts that drop query strings.
  $('log-bet').addEventListener('click', function () {
    try { sessionStorage.setItem('mb.prefill', this.dataset.prefill || ''); } catch (err) { /* ignore */ }
  });

  restore();
  form.addEventListener('input', render);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  $('resetAdjust').addEventListener('click', function () {
    $('layAdjust').value = 100;
    render();
  });
  render();
})();
