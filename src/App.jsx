import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import ChatPage from './pages/ChatPage'
import AdminPage from './pages/AdminPage'
import AdminLoginPage from './pages/AdminLoginPage'
import AdminExamHallPage from './pages/AdminExamHallPage'
import ExamHallPage from './pages/ExamHallPage'
import ProtectedRoute from './components/ProtectedRoute'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <nav className="app-nav">
        <div className="nav-inner">
          <span className="nav-brand">🎓 College Portal</span>
          <div className="nav-links">
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              💬 Student Chat
            </NavLink>
            <NavLink to="/exam-hall" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              🏫 Exam Hall Finder
            </NavLink>
          </div>
        </div>
      </nav>
      <main className="app-main">
        <Routes>
          {/* Public Student Routes */}
          <Route path="/" element={<ChatPage />} />
          <Route path="/exam-hall" element={<ExamHallPage />} />

          {/* Admin Authentication & Protected Routes */}
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/exam-hall"
            element={
              <ProtectedRoute>
                <AdminExamHallPage />
              </ProtectedRoute>
            }
          />

          {/* Catch-all redirect to Student Chat */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}

export default App
