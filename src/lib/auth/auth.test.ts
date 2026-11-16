import { describe, expect, it } from 'vitest'
import { isAllowedEmail } from './allowed-domain'
import { passwordUpdateErrorMessage } from './password-errors'
import { canEdit, DEFAULT_ROLE } from './roles'

describe('isAllowedEmail', () => {
  it('accepts only the school domain', () => {
    expect(isAllowedEmail('ana@familiadenazare.com.br')).toBe(true)
    expect(isAllowedEmail('ANA@FamiliaDeNazare.com.br')).toBe(true)
    expect(isAllowedEmail('ana@gmail.com')).toBe(false)
    expect(isAllowedEmail('ana@familiadenazare.com.br.evil.com')).toBe(false)
    expect(isAllowedEmail('ana@evil-familiadenazare.com.br')).toBe(false)
    expect(isAllowedEmail(null)).toBe(false)
  })
})

describe('passwordUpdateErrorMessage', () => {
  it('explains the same-password case', () => {
    expect(passwordUpdateErrorMessage({ code: 'same_password' })).toMatch(/diferente da senha atual/i)
  })
  it('explains weak passwords', () => {
    expect(passwordUpdateErrorMessage({ code: 'weak_password' })).toMatch(/fraca/i)
  })
  it('explains missing sessions', () => {
    expect(passwordUpdateErrorMessage({ name: 'AuthSessionMissingError' })).toMatch(/novo link/i)
  })
  it('falls back to a generic message', () => {
    expect(passwordUpdateErrorMessage({ message: 'boom' })).toMatch(/tente novamente/i)
  })
})

describe('canEdit', () => {
  it('lets only ADMIN and COORDINATOR change data', () => {
    expect(canEdit('ADMIN')).toBe(true)
    expect(canEdit('COORDINATOR')).toBe(true)
    expect(canEdit('VIEWER')).toBe(false)
    expect(canEdit(null)).toBe(false)
  })
  it('gives first-time Google users a read-only role', () => {
    expect(canEdit(DEFAULT_ROLE)).toBe(false)
  })
})
