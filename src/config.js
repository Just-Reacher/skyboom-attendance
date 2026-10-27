require('dotenv').config();
const need = (k) => {
  if (!process.env[k]) throw new Error(`Missing required environment variable: ${k}`);
  return process.env[k];
};
const env = process.env.NODE_ENV || 'development';
module.exports = {
  env,
  isProd: env === 'production',
  port: Number(process.env.PORT) || 3000,
  databaseUrl: need('DATABASE_URL'),
  dbSsl: process.env.DATABASE_SSL === 'true',
  sessionSecret: need('SESSION_SECRET'),
  sessionHours: Number(process.env.SESSION_HOURS) || 8,
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : env === 'production',
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
};
