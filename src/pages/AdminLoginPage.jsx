import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { adminAuthService } from '../services/adminAuthService'
import './AdminLoginPage.css'

function AdminLoginPage() {
  const [email, setEmail] = useState('shakthiganeshn.it25@bitsathy.ac.in')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const navigate = useNavigate()
  const location = useLocation()

  const from = location.state?.from?.pathname || '/admin'

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!password.trim()) {
      setErrorMsg('Please enter your password.')
      return
    }

    setLoading(true)
    setErrorMsg('')

    try {
      await adminAuthService.login(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setErrorMsg(err.message || 'Invalid admin credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">🔐</div>
          <h1>Admin Portal Login</h1>
          <p className="login-subtitle">
            Restricted access. Please authenticate to manage college datasets.
          </p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label className="input-label" htmlFor="adminEmail">
              Administrator Email
            </label>
            <input
              id="adminEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@bitsathy.ac.in"
              required
              className="login-input"
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label className="input-label" htmlFor="adminPassword">
              Password
            </label>
            <input
              id="adminPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              className="login-input"
              autoComplete="current-password"
            />
          </div>

          {errorMsg && (
            <div className="login-error-badge">
              <span>⚠️</span> {errorMsg}
            </div>
          )}

          <button type="submit" className="login-submit-btn" disabled={loading || !password}>
            {loading ? (
              <>
                <span className="spinner"></span> Authenticating...
              </>
            ) : (
              'Sign In to Dashboard'
            )}
          </button>
        </form>

        <div className="login-footer">
          <span>Protected by session authentication. Access logged for security.</span>
        </div>
      </div>
    </div>
  )
}

export default AdminLoginPage
