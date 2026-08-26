import { describe, expect, it } from 'vitest'
import { migrationName } from './umzug.js'

describe('Umzug migration identity', () => {
  it('uses the same stored name for source and compiled migrations', () => {
    expect(migrationName('20260826120000-create-community.ts')).toBe('20260826120000-create-community')
    expect(migrationName('20260826120000-create-community.js')).toBe('20260826120000-create-community')
  })
})
