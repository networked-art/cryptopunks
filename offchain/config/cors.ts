import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/cors'

const corsConfig = defineConfig({
  enabled: true,
  origin: app.inDev
    ? true
    : (origin: string) => {
        const allowed = env.get('CORS_ORIGIN', '').split(',').filter(Boolean)
        return allowed.includes(origin) || new URL(origin).hostname === 'localhost'
      },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  headers: true,
  exposeHeaders: [],
  credentials: true,
  maxAge: 90,
})

export default corsConfig
