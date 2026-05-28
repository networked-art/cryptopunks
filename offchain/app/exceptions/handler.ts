import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import { HttpError } from './http_error.js'

function isStatusError(
  error: unknown
): error is { status?: number; statusCode?: number; message?: string } {
  return typeof error === 'object' && error !== null
}

export default class HttpExceptionHandler extends ExceptionHandler {
  protected debug = !app.inProduction

  async handle(error: unknown, ctx: HttpContext) {
    if (error instanceof HttpError) {
      return ctx.response.status(error.status).send({
        errors: [{ message: error.message }],
      })
    }

    if (isStatusError(error) && (error.status || error.statusCode) && error.message) {
      return ctx.response.status(error.status || error.statusCode || 500).send({
        errors: [{ message: error.message }],
      })
    }

    return super.handle(error, ctx)
  }

  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
