import type { RequestHandler } from 'express'
import { loginSchema } from '../../validations/auth/login.validation.js'

export const login: RequestHandler = (request, response, next) => {
  try {
    const credentials = loginSchema.parse(request.body)
    response.json({
      success: true,
      data: { token: 'foundation-token', user: { id: 'foundation-user', email: credentials.email } },
    })
  } catch (error) {
    next(error)
  }
}
