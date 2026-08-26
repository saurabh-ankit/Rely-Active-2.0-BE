import { randomUUID } from 'node:crypto'
import { HttpError } from '../common/http-error.js'

export type Example = { id: string; name: string; createdAt: string }
const examples = new Map<string, Example>()

export const exampleService = {
  list: () => [...examples.values()],
  create: (name: string) => {
    const item = { id: randomUUID(), name, createdAt: new Date().toISOString() }
    examples.set(item.id, item)
    return item
  },
  get: (id: string) => {
    const item = examples.get(id)
    if (!item) throw new HttpError(404, 'Example not found')
    return item
  },
  update: (id: string, input: { name?: string }) => {
    const current = exampleService.get(id)
    const item: Example = { ...current, ...(input.name === undefined ? {} : { name: input.name }) }
    examples.set(id, item)
    return item
  },
  remove: (id: string) => {
    if (!examples.delete(id)) throw new HttpError(404, 'Example not found')
  },
}
