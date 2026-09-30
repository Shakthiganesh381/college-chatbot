import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { adminAuthService } from '../services/adminAuthService'
import './AdminPage.css'

const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:5000'

function AdminPage() {
  const navigate = useNavigate()
  const [statusMessages, setStatusMessages] = useState({
    menu: null,
    hours: null,
    venues: null,
    exams: null
  })
  const [uploading, setUploading] = useState({
    menu: false,
    hours: false,
    venues: false,
    exams: false
  })
  const [activeTab, setActiveTab] = useState('menu')
  const [previewData, setPreviewData] = useState({
    menu: null,
    hours: null,
    venues: null,
    exams: null
  })
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  // Fetch current data for preview
  const fetchCurrentData = async (type) => {
    setLoadingPreview(true)
    try {
      const response = await fetch(`${API_BASE}/api/admin/data/${type}`, {
        headers: {
          ...adminAuthService.getAuthHeader()
        }
      })
      if (response.status === 401) {
        adminAuthService.clearStorage()
        navigate('/admin/login', { replace: true })
        return
      }
      if (response.ok) {
        const result = await response.json()
        setPreviewData((prev) => ({ ...prev, [type]: result.data }))
      }
    } catch (err) {
      console.error(`Failed to fetch ${type} data:`, err)
    } finally {
      setLoadingPreview(false)
    }
  }

  // Load active tab data whenever activeTab changes or preview opened
  useEffect(() => {
    if (previewOpen) {
      fetchCurrentData(activeTab)
    }
  }, [activeTab, previewOpen])

  const handleUpload = async (type, files) => {
    if (!files || (files instanceof FileList && files.length === 0)) return

    const primaryFile = files instanceof FileList ? files[0] : files
    // Validate file extension
    const allowedExtensions = ['.json', '.csv']
    const extension = primaryFile.name.toLowerCase().slice(primaryFile.name.lastIndexOf('.'))
    if (!allowedExtensions.includes(extension)) {
      setStatusMessages((prev) => ({
        ...prev,
        [type]: {
          success: false,
          text: `Invalid file type "${extension}". Only .json and .csv files are allowed.`
        }
      }))
      return
    }

    // Validate file size (max 5MB)
    const fileListArray = files instanceof FileList ? Array.from(files) : (Array.isArray(files) ? files : [files])
    const oversizedFile = fileListArray.find((f) => f.size > 5 * 1024 * 1024)
    if (oversizedFile) {
      setStatusMessages((prev) => ({
        ...prev,
        [type]: { success: false, text: `File "${oversizedFile.name}" is too large. Maximum file size is 5MB.` }
      }))
      return
    }

    setUploading((prev) => ({ ...prev, [type]: true }))
    setStatusMessages((prev) => ({ ...prev, [type]: null }))

    try {
      const formData = new FormData()
      if (files instanceof FileList || Array.isArray(files)) {
        for (let i = 0; i < files.length; i++) {
          formData.append('files', files[i])
        }
      } else {
        formData.append('file', files)
      }

      const response = await fetch(`${API_BASE}/api/admin/upload/${type}?mode=append`, {
        method: 'POST',
        headers: {
          ...adminAuthService.getAuthHeader()
        },
        body: formData
      })

      if (response.status === 401) {
        adminAuthService.clearStorage()
        navigate('/admin/login', { replace: true })
        return
      }

      const data = await response.json()

      if (response.ok) {
        setStatusMessages((prev) => ({
          ...prev,
          [type]: { success: true, text: data.message || 'Upload successful!' }
        }))
        // Refresh preview if open
        fetchCurrentData(type)
      } else {
        setStatusMessages((prev) => ({
          ...prev,
          [type]: { success: false, text: data.error || 'Upload failed.' }
        }))
      }
    } catch (error) {
      console.error('Upload error:', error)
      setStatusMessages((prev) => ({
        ...prev,
        [type]: {
          success: false,
          text: 'Could not connect to the server. Make sure the backend is running.'
        }
      }))
    } finally {
      setUploading((prev) => ({ ...prev, [type]: false }))
    }
  }

  // Clear / Delete entire dataset for a specific section
  const handleClearData = async (type, title) => {
    if (
      !window.confirm(
        `⚠️ WARNING: Are you sure you want to delete ALL records for "${title}"?\n\nThis will permanently clear all ${title} data.`
      )
    ) {
      return
    }

    try {
      const response = await fetch(`${API_BASE}/api/admin/clear/${type}`, {
        method: 'DELETE',
        headers: {
          ...adminAuthService.getAuthHeader()
        }
      })

      if (response.status === 401) {
        adminAuthService.clearStorage()
        navigate('/admin/login', { replace: true })
        return
      }

      const data = await response.json()
      if (response.ok && data.success) {
        setStatusMessages((prev) => ({
          ...prev,
          [type]: { success: true, text: `All ${title} data deleted successfully.` }
        }))
        // Refresh preview if open
        fetchCurrentData(type)
      } else {
        setStatusMessages((prev) => ({
          ...prev,
          [type]: { success: false, text: data.error || 'Failed to clear data.' }
        }))
      }
    } catch (err) {
      setStatusMessages((prev) => ({
        ...prev,
        [type]: { success: false, text: 'Failed to communicate with the server.' }
      }))
    }
  }

  const uploadSections = [
    {
      key: 'menu',
      title: 'Food Menu',
      description: 'Upload food menus by date (.json or .csv). Supports breakfast, lunch, snacks, and dinner.',
      icon: '🍽️'
    },
    {
      key: 'hours',
      title: 'College Hours',
      description: 'Upload department operating hours (.json or .csv). Specify day, department, and start/end times.',
      icon: '🕐'
    },
    {
      key: 'venues',
      title: 'Venue Details',
      description: 'Upload campus venues & rooms (.json or .csv). Specify name, building, floor, and description.',
      icon: '🏛️'
    },
    {
      key: 'exams',
      title: 'Exam Hall Arrangement',
      description: 'Upload exam schedules & roll allocations (.json or .csv). Manage seating arrangements.',
      icon: '🏫',
      manageLink: '/admin/exam-hall'
    }
  ]


  // Render Table for active data preview
  const renderDataPreview = () => {
    const data = previewData[activeTab]

    if (loadingPreview) {
      return (
        <div className="preview-loading">
          <span className="spinner"></span> Loading current {activeTab} data...
        </div>
      )
    }

    if (!data) {
      return <div className="preview-empty">No data available for {activeTab}.</div>
    }

    if (activeTab === 'menu') {
      const dates = Object.keys(data).sort()
      if (dates.length === 0) return <div className="preview-empty">No menu entries found.</div>

      return (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Breakfast</th>
                <th>Lunch</th>
                <th>Snacks</th>
                <th>Dinner</th>
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => (
                <tr key={date}>
                  <td className="font-mono">{date}</td>
                  <td>{data[date].breakfast || '-'}</td>
                  <td>{data[date].lunch || '-'}</td>
                  <td>{data[date].snacks || '-'}</td>
                  <td>{data[date].dinner || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    if (activeTab === 'hours') {
      if (!Array.isArray(data) || data.length === 0) {
        return <div className="preview-empty">No hours entries found.</div>
      }

      return (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Department</th>
                <th>Start Time</th>
                <th>End Time</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, idx) => (
                <tr key={idx}>
                  <td className="font-semibold">{item.day}</td>
                  <td>
                    <span className="dept-badge">{item.department}</span>
                  </td>
                  <td>{item.startTime}</td>
                  <td>{item.endTime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    if (activeTab === 'venues') {
      if (!Array.isArray(data) || data.length === 0) {
        return <div className="preview-empty">No venue entries found.</div>
      }

      return (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Venue Name</th>
                <th>Building</th>
                <th>Floor</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, idx) => (
                <tr key={idx}>
                  <td className="font-semibold text-primary">{item.name}</td>
                  <td>{item.building}</td>
                  <td>{item.floor}</td>
                  <td className="text-muted text-sm">{item.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    if (activeTab === 'exams') {
      if (!Array.isArray(data) || data.length === 0) {
        return <div className="preview-empty">No exam arrangement entries found.</div>
      }

      return (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Session</th>
                <th>Hall</th>
                <th>Branch & Course</th>
                <th>Time</th>
                <th>Register Number Ranges</th>
                <th>Candidates</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, idx) => (
                <tr key={idx}>
                  <td className="font-mono">{item.date}</td>
                  <td>
                    <span className="dept-badge">{item.session}</span>
                  </td>
                  <td className="font-semibold text-primary">{item.hall}</td>
                  <td>
                    {item.branch} ({item.courseCode})
                  </td>
                  <td>{item.time}</td>
                  <td className="font-mono text-sm">{item.registerNumbers}</td>
                  <td>{item.candidateCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    return null
  }

  const adminEmail = adminAuthService.getEmail()

  const handleLogout = async () => {
    await adminAuthService.logout()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="admin-container">
      <header className="admin-header">
        <div className="admin-header-top">
          <div className="admin-user-pill">
            <span className="user-icon">👤</span>
            <span className="user-email">{adminEmail}</span>
          </div>
          <button type="button" className="btn-logout" onClick={handleLogout} title="Sign Out">
            🚪 Logout
          </button>
        </div>
        <h1>Admin Control Dashboard</h1>
        <p className="admin-subtitle">
          Manage, upload, and inspect college datasets in real-time
        </p>
      </header>

      {/* Upload Cards Grid */}
      <div className="upload-grid">
        {uploadSections.map((section) => (
          <div key={section.key} className="upload-card">
            <div className="card-icon">{section.icon}</div>
            <h2 className="card-title">{section.title}</h2>
            <p className="card-description">{section.description}</p>

            <div className="card-actions">
              {section.manageLink && (
                <Link to={section.manageLink} className="manage-portal-btn">
                  🛠️ Manage Arrangements
                </Link>
              )}

              {/* File upload button */}
              <label className="file-input-label">
                <input
                  type="file"
                  accept=".json,.csv"
                  multiple
                  className="file-input-hidden"
                  disabled={uploading[section.key]}
                  onChange={(e) => {
                    const files = e.target.files
                    if (files && files.length > 0) handleUpload(section.key, files)
                    e.target.value = ''
                  }}
                />
                <span className="file-input-button">
                  {uploading[section.key] ? (
                    <>
                      <span className="spinner"></span> Uploading...
                    </>
                  ) : (
                    '📤 Upload .JSON / .CSV'
                  )}
                </span>
              </label>

              {/* Template download link */}
              <a
                href={`${API_BASE}/api/admin/template/${section.key}`}
                download={`${section.key}_template.csv`}
                className="template-download-btn"
                title="Download standard CSV template"
              >
                📥 Sample CSV Template
              </a>

              {/* Quick View Button */}
              <button
                type="button"
                className="view-data-btn"
                onClick={() => {
                  setActiveTab(section.key)
                  setPreviewOpen(true)
                }}
              >
                👁️ View Active Data
              </button>

              {/* Clear / Delete All Section Data Button */}
              <button
                type="button"
                className="clear-section-btn"
                onClick={() => handleClearData(section.key, section.title)}
                title={`Delete all ${section.title} records`}
              >
                🗑️ Clear All {section.title} Data
              </button>
            </div>

            {statusMessages[section.key] && (
              <div
                className={`status-message ${
                  statusMessages[section.key].success ? 'success' : 'error'
                }`}
              >
                {statusMessages[section.key].success ? '✓ ' : '✗ '}
                {statusMessages[section.key].text}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Live Data Inspector Modal / Panel */}
      {previewOpen && (
        <section className="data-preview-section">
          <div className="preview-header">
            <div className="preview-tabs">
              {uploadSections.map((sec) => (
                <button
                  key={sec.key}
                  type="button"
                  className={`preview-tab-btn ${activeTab === sec.key ? 'active' : ''}`}
                  onClick={() => setActiveTab(sec.key)}
                >
                  {sec.icon} {sec.title}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="close-preview-btn"
              onClick={() => setPreviewOpen(false)}
            >
              ✕ Close
            </button>
          </div>

          <div className="preview-body">{renderDataPreview()}</div>
        </section>
      )}
    </div>
  )
}

export default AdminPage

