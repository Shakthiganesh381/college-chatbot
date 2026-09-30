/**
 * Admin Authentication Service
 * Manages admin authentication tokens, session verification, and API headers.
 * Uses localStorage for persistent session support across page refreshes.
 */

const API_BASE = import.meta.env?.VITE_API_BASE_URL || ''
const TOKEN_KEY = 'college_admin_token'
const EMAIL_KEY = 'college_admin_email'

export const adminAuthService = {
  getApiBaseUrl() {
    return API_BASE
  },

  async login(email, password) {
    const response = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Authentication failed. Please check your credentials.')
    }

    // Save session token and email persistently
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(EMAIL_KEY, data.email)

    return data
  },

  async verifySession() {
    const token = this.getToken()
    if (!token) return false

    try {
      const response = await fetch(`${API_BASE}/api/admin/verify`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok && data.valid === true) {
        return true
      }
      // If server rejects the token, clean up local storage
      this.clearStorage()
      return false
    } catch {
      // If server is unreachable, allow session if token format is valid or fallback
      return Boolean(token)
    }
  },

  async logout() {
    const token = this.getToken()
    try {
      if (token) {
        await fetch(`${API_BASE}/api/admin/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        })
      }
    } catch (e) {
      console.warn('Logout notification error:', e)
    } finally {
      this.clearStorage()
    }
  },

  clearStorage() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EMAIL_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(EMAIL_KEY)
  },

  getToken() {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || ''
  },

  getEmail() {
    return (
      localStorage.getItem(EMAIL_KEY) ||
      sessionStorage.getItem(EMAIL_KEY) ||
      'shakthiganeshn.it25@bitsathy.ac.in'
    )
  },

  isAuthenticated() {
    return Boolean(this.getToken())
  },

  getAuthHeader() {
    const token = this.getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }
}
