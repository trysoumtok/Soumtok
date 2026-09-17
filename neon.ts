import { defineConfig } from '@neon/config/v1'

export default defineConfig({
  preview: {
    functions: {
      mail: {
        name: 'Soumtok mail relay',
        source: 'functions/mail/index.ts',
        env: {
          MAIL_FUNCTION_SECRET: process.env.MAIL_FUNCTION_SECRET!,
          SMTP_HOST: process.env.SMTP_HOST!,
          SMTP_PORT: process.env.SMTP_PORT!,
          SMTP_USER: process.env.SMTP_USER!,
          SMTP_PASS: process.env.SMTP_PASS!,
          SMTP_FROM: process.env.SMTP_FROM!,
        },
      },
    },
  },
})
