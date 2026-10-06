'use strict';
const http = require('node:http');
const { openDb } = require('./db');
const { createApp } = require('./app');
const { purgeExpiredSessions } = require('./auth');

const env = process.env;
const db = openDb(env.DATABASE_PATH || 'data/matchedbet.db');
const config = {
  db,
  secureCookies: env.NODE_ENV === 'production',
  trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
  oddsApiKey: env.ODDS_API_KEY || '',
  oddsSports: (env.ODDS_SPORTS || 'soccer_epl,soccer_efl_champ,soccer_uefa_champs_league')
    .split(',').map((s) => s.trim()).filter(Boolean),
  oddsRefreshMinutes: Number(env.ODDS_REFRESH_MINUTES) || 360,
  appUrl: env.APP_URL || '',
  brevoApiKey: env.BREVO_API_KEY || '',
  mailFromEmail: env.MAIL_FROM_EMAIL || '',
  mailFromName: env.MAIL_FROM_NAME || 'MatchedBet'
};

const server = http.createServer(createApp(config));
const port = Number(env.PORT) || 3000;
server.listen(port, () => {
  console.log(`MatchedBet running on http://localhost:${port}`);
  if (!config.oddsApiKey) console.log('ODDS_API_KEY is not set, so the oddsmatcher shows sample odds.');
  if (!config.brevoApiKey) console.log('BREVO_API_KEY is not set, so password reset emails are written to this log instead of sent.');
  else if (!config.mailFromEmail) console.log('MAIL_FROM_EMAIL is not set, so password reset emails will fail.');
  if (config.secureCookies && !config.appUrl) console.log('APP_URL is not set, so password reset emails are disabled.');
});

purgeExpiredSessions(db);
setInterval(() => purgeExpiredSessions(db), 6 * 3600e3).unref();

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
