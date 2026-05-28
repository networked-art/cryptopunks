import env from '#start/env'
import { defineConfig, transports } from '@adonisjs/mail'

const mailConfig = defineConfig({
  default: 'smtp',

  from: {
    address: 'hello@punks.auction',
    name: 'punks.auction',
  },

  mailers: {
    smtp: transports.smtp({
      host: env.get('SMTP_HOST', 'localhost'),
      port: env.get('SMTP_PORT', 1025),
      auth: env.get('SMTP_USERNAME')
        ? {
            type: 'login' as const,
            user: env.get('SMTP_USERNAME')!,
            pass: env.get('SMTP_PASSWORD')!,
          }
        : undefined,
    }),
  },
})

export default mailConfig

declare module '@adonisjs/mail/types' {
  export interface MailersList extends InferMailers<typeof mailConfig> {}
}
