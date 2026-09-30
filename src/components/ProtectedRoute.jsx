import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { adminAuthService } from '../services/adminAuthService'

function ProtectedRoute({ children }) {
  const location = useLocation()
  const hasToken = adminAuthService.isAuthenticated()
  const [authState, setAuthState] = useState({
    checked: false,
    authorized: hasToken
  })

  useEffect(() => {
    let isMounted = true

    const checkAuth = async () => {
      if (!adminAuthService.isAuthenticated()) {
        if (isMounted) setAuthState({ checked: true, authorized: false })
        return
      }

      const isValid = await adminAuthService.verifySession()
      if (isMounted) {
        setAuthState({ checked: true, authorized: isValid })
      }
    }

    checkAuth()

    return () => {
      isMounted = false
    }
  }, [location.pathname])

  if (!hasToken) {
    // Redirect unauthenticated visitor to admin login
    return <Navigate to="/admin/login" state={{ from: location }} replace />
  }

  if (authState.checked && !authState.authorized) {
    // Token was invalid or expired
    return <Navigate to="/admin/login" state={{ from: location }} replace />
  }

  return children
}

export default ProtectedRoute
