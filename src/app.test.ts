import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'

describe('foundation API', () => {
  it('reports health', async () => {
    const response = await request(createApp()).get('/health').expect(200)
    expect(response.body).toEqual({ status: 'ok', service: 'rely-active-backend' })
  })
  it('exposes v1 metadata', async () => {
    const response = await request(createApp()).get('/api/v1').expect(200)
    expect(response.body.data.version).toBe('v1')
  })
  it('validates login payloads', async () => {
    await request(createApp()).post('/api/v1/auth/login').send({ email: 'invalid' }).expect(422)
  })
  it('supports example CRUD creation', async () => {
    const response = await request(createApp()).post('/api/v1/examples').send({ name: 'Foundation' }).expect(201)
    expect(response.body.data.name).toBe('Foundation')
  })
})
