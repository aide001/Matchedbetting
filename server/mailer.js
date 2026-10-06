'use strict';
// Sends transactional email through Brevo's API (https://developers.brevo.com/).
// Without BREVO_API_KEY, emails are written to the server log instead, for local testing.

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

function createMailer({ apiKey, fromEmail, fromName, fetchImpl, log, url }) {
  const doFetch = fetchImpl || fetch;
  const logger = log || console;

  async function send({ to, toName, subject, text, html }) {
    if (!apiKey) {
      logger.log(`[mail] BREVO_API_KEY not set, so not sending. To: ${to}\nSubject: ${subject}\n\n${text}\n`);
      return { logged: true };
    }
    if (!fromEmail) throw new Error('MAIL_FROM_EMAIL must be set to send email');
    const res = await doFetch(url || BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: fromName || 'MatchedBet', email: fromEmail },
        to: [toName ? { email: to, name: toName } : { email: to }],
        subject,
        textContent: text,
        htmlContent: html
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Brevo returned ${res.status}: ${body.slice(0, 300)}`);
    }
    return res.json().catch(() => ({}));
  }

  return { send, configured: !!apiKey };
}

module.exports = { createMailer };
