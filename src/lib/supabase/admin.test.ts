import { afterEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn(() => ({ from: vi.fn() }))

vi.mock('@supabase/supabase-js', () => ({ createClient }))

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('admin Supabase client', () => {
  it('does not create the service-role client while the module is imported', async () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    try {
      await import('./admin')
      expect(createClient).not.toHaveBeenCalled()
    } finally {
      if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
      else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
    }
  })
})
