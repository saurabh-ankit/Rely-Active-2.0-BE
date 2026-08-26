import { Router } from 'express'
import {
  createExample,
  deleteExample,
  getExample,
  listExamples,
  updateExample,
} from '../controllers/example.controller.js'

export const exampleRouter = Router()
exampleRouter.route('/').get(listExamples).post(createExample)
exampleRouter.route('/:id').get(getExample).patch(updateExample).delete(deleteExample)
