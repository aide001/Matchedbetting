'use strict';
const { betLabel, layLabel } = require('../public/js/bet-plan.js');
// Builds the "here's exactly what to bet" email for one step of an offer.

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (n < 0 ? '-' : '') + '£' + Math.abs(n).toFixed(2);

function kickoff(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
  });
}

function outcomeLine(plan) {
  return plan.result >= 0
    ? `Whatever the result, you keep about ${money(plan.result)}.`
    : `Whatever the result, you lose about ${money(-plan.result)}. That's the small cost of unlocking the free bets.`;
}

function planEmail({ user, offer, plan, sample, fetchedAt, siteUrl }) {
  const stepName = plan.step === 'qualifying' ? 'qualifying bet' : `£${plan.back.stake} free bet`;
  const subject = `${sample ? '[SAMPLE ODDS] ' : ''}${offer.bookmaker}: your ${stepName}, step by step`;
  const calcUrl = siteUrl ? `${siteUrl}/calculator.html?${plan.calculatorQuery}` : null;
  const guideUrl = siteUrl ? `${siteUrl}/offer.html#${offer.id}` : null;
  const freeNote = plan.step === 'free' ? '  Use your free bet for this (choose it on the bet slip), not your own money.' : null;
  const when = kickoff(plan.commenceTime);
  const priced = new Date(fetchedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

  const text = [
    `Hi ${user.name},`,
    '',
    `Here's exactly what to do for the ${offer.bookmaker} offer (${offer.headline}).`,
    sample ? '\nTHESE ARE SAMPLE ODDS FOR TESTING. Don\'t place real bets from this email.\n' : '',
    `Event: ${plan.event} (${plan.sport}), starts ${when}`,
    '',
    `STEP 1. BACK at ${plan.back.bookmaker}`,
    `  Bet on: ${betLabel(plan.selection)} (match result)`,
    `  Odds: ${plan.back.odds.toFixed(2)}`,
    `  Stake: ${money(plan.back.stake)}`,
    freeNote,
    plan.back.link ? `  Open ${plan.back.bookmaker}: ${plan.back.link}` : '',
    '',
    `STEP 2. LAY at ${plan.lay.exchange}, straight after step 1`,
    `  Lay (bet against): ${layLabel(plan.selection)}`,
    `  Odds: ${plan.lay.odds.toFixed(2)}`,
    `  Lay stake: ${money(plan.lay.stake)}`,
    `  Liability: ${money(plan.lay.liability)} (you need this much in your ${plan.lay.exchange} account)`,
    plan.lay.link ? `  Open ${plan.lay.exchange}: ${plan.lay.link}` : '',
    '',
    outcomeLine(plan),
    '',
    `Prices were checked at ${priced}. Odds move, so check both prices before you bet. If either has changed, work out the new lay stake in the calculator${calcUrl ? `: ${calcUrl}` : '.'}`,
    guideUrl ? `Full guide: ${guideUrl}` : '',
    '',
    '18+. T&Cs apply. Only bet what you can afford. Free support: www.begambleaware.org'
  ].filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');

  const btn = (href, label, color) => href
    ? `<a href="${esc(href)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;margin-top:10px">${esc(label)}</a>`
    : '';
  const row = (k, v) => `<tr><td style="padding:3px 12px 3px 0;color:#5b6878">${esc(k)}</td><td style="padding:3px 0;font-weight:600">${v}</td></tr>`;

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#16202c;line-height:1.5">
${sample ? '<p style="background:#fbe6ee;color:#a12d58;padding:10px 14px;border-radius:8px;font-weight:700">SAMPLE ODDS FOR TESTING. Don\'t place real bets from this email.</p>' : ''}
<p>Hi ${esc(user.name)},</p>
<p>Here's exactly what to do for the <strong>${esc(offer.bookmaker)}</strong> offer (${esc(offer.headline)}).</p>
<p style="margin:0 0 16px;color:#5b6878">${esc(plan.event)} · ${esc(plan.sport)} · starts ${esc(when)}</p>

<div style="border:2px solid #2f7fd1;background:#e3effb;border-radius:10px;padding:14px 16px;margin-bottom:12px">
  <div style="font-size:13px;font-weight:700;color:#2f7fd1;letter-spacing:.04em">STEP 1 · BACK AT ${esc(plan.back.bookmaker.toUpperCase())}</div>
  <table style="margin-top:6px;border-collapse:collapse">
    ${row('Bet on', esc(betLabel(plan.selection)))}
    ${row('Odds', esc(plan.back.odds.toFixed(2)))}
    ${row('Stake', esc(money(plan.back.stake)))}
  </table>
  ${plan.step === 'free' ? '<p style="margin:8px 0 0;font-size:14px">Use your <strong>free bet</strong> for this, not your own money.</p>' : ''}
  ${btn(plan.back.link, `Open ${plan.back.bookmaker}`, '#2f7fd1')}
</div>

<div style="border:2px solid #d1477a;background:#fbe6ee;border-radius:10px;padding:14px 16px;margin-bottom:12px">
  <div style="font-size:13px;font-weight:700;color:#d1477a;letter-spacing:.04em">STEP 2 · LAY AT ${esc(plan.lay.exchange.toUpperCase())}, STRAIGHT AFTER STEP 1</div>
  <table style="margin-top:6px;border-collapse:collapse">
    ${row('Lay (bet against)', esc(layLabel(plan.selection)))}
    ${row('Odds', esc(plan.lay.odds.toFixed(2)))}
    ${row('Lay stake', esc(money(plan.lay.stake)))}
    ${row('Liability', esc(money(plan.lay.liability)) + ' <span style="font-weight:400;color:#5b6878">(must be in your account)</span>')}
  </table>
  ${btn(plan.lay.link, `Open ${plan.lay.exchange}`, '#d1477a')}
</div>

<p style="background:#eef1f5;border-radius:8px;padding:10px 14px;font-weight:600">${esc(outcomeLine(plan))}</p>
<p style="font-size:14px;color:#5b6878">Prices were checked at ${esc(priced)}. Odds move, so check both prices before you bet. If either has changed, ${calcUrl ? `<a href="${esc(calcUrl)}">work out the new lay stake in the calculator</a>` : 'work out the new lay stake in the calculator'}.${guideUrl ? ` <a href="${esc(guideUrl)}">Read the full guide</a>.` : ''}</p>
<p style="font-size:12px;color:#5b6878;border-top:1px solid #d9dee6;padding-top:10px;margin-top:20px">18+. T&amp;Cs apply. Only bet what you can afford. Free, confidential support: <a href="https://www.begambleaware.org">BeGambleAware.org</a></p>
</div>`;

  return { subject, text, html };
}

module.exports = { planEmail };
