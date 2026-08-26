import type { RequestHandler } from 'express'
import { exampleService } from '../../services/example.service.js'
import { exampleInputSchema } from '../../validations/examples/example.validation.js'
import { z } from 'zod'

const idFrom = (value: unknown) => z.string().uuid().parse(value)

export const listExamples: RequestHandler = (_request, response) => {
  const data = exampleService.list()
  response.json({ success: true, data, meta: { total: data.length } })
}
export const createExample: RequestHandler = (request, response, next) => {
  try {
    const input = exampleInputSchema.parse(request.body)
    response.status(201).json({ success: true, data: exampleService.create(input.name) })
  } catch (error) {
    next(error)
  }
}
export const getExample: RequestHandler = (request, response, next) => {
  try {
    response.json({ success: true, data: exampleService.get(idFrom(request.params.id)) })
  } catch (error) {
    next(error)
  }
}
export const updateExample: RequestHandler = (request, response, next) => {
  try {
    const input = exampleInputSchema.partial().parse(request.body)
    response.json({
      success: true,
      data: exampleService.update(idFrom(request.params.id), input.name === undefined ? {} : { name: input.name }),
    })
  } catch (error) {
    next(error)
  }
}
export const deleteExample: RequestHandler = (request, response, next) => {
  try {
    exampleService.remove(idFrom(request.params.id))
    response.status(204).send()
  } catch (error) {
    next(error)
  }
}
