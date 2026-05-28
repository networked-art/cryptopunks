/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  APP_NAME: Env.schema.string(),
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),
  API_URL: Env.schema.string({ format: 'url', tld: false }),
  OFFCHAIN_PUBLIC_URL: Env.schema.string({ format: 'url', tld: false }),

  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory'] as const),

  DB_CONNECTION: Env.schema.enum.optional(['sqlite', 'pg'] as const),
  DB_HOST: Env.schema.string.optional(),
  DB_PORT: Env.schema.number.optional(),
  DB_USER: Env.schema.string.optional(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string.optional(),

  INDEXER_GRAPHQL_URL: Env.schema.string.optional({ format: 'url', tld: false }),
  MATCH_TICK_INTERVAL_MS: Env.schema.number.optional(),

  CORS_ORIGIN: Env.schema.string.optional(),

  SMTP_HOST: Env.schema.string.optional(),
  SMTP_PORT: Env.schema.number.optional(),
  SMTP_USERNAME: Env.schema.string.optional(),
  SMTP_PASSWORD: Env.schema.string.optional(),

  QUEUE_DRIVER: Env.schema.enum(['database', 'sync'] as const),

  ADMIN_EMAILS: Env.schema.string.optional(),
})
