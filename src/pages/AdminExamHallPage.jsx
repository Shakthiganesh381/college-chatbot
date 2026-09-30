import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminAuthService } from '../services/adminAuthService'
import { generateHallSeatsList, formatDisplayDate } from '../services/examHallService'
import './AdminExamHallPage.css'

const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:5000'

function AdminExamHallPage() {
  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterDate, setFilterDate] = useState('ALL')
  const [filterSession, setFilterSession] = useState('ALL')
  const [importReport, setImportReport] = useState(null)

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState(null)
  const [formData, setFormData] = useState({
    date: '2026-09-05',
    session: 'FN',
    examName: 'PERIODICAL TEST I - SEPTEMBER 2026',
    degreeSemester: 'B.E. / B.Tech. - III',
    time: '08:45 AM - 10:15 AM',
    hall: 'WW 202',
    branch: 'CS',
    courseCode: '22CS305',
    registerNumbers: '7376251CS101-130',
    candidateCount: 30
  })

  // Bulk file upload state
  const [uploading, setUploading] = useState(false)
  const [uploadedFilesList, setUploadedFilesList] = useState([])

  const navigate = useNavigate()
  const adminEmail = adminAuthService.getEmail()

  const fetchExams = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/admin/exams`, {
        headers: {
          ...adminAuthService.getAuthHeader()
        }
      })
      if (res.status === 401) {
        adminAuthService.clearStorage()
        navigate('/admin/login', { replace: true })
        return
      }
      const json = await res.json()
      if (json.success && Array.isArray(json.data)) {
        setExams(json.data)
      }
    } catch (err) {
      setError('Failed to load exam arrangements from backend server.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchExams()
  }, [])

  const handleLogout = async () => {
    await adminAuthService.logout()
    navigate('/admin/login', { replace: true })
  }

  // Dynamic calculations from active merged exams array
  const distinctDates = Array.from(new Set(exams.map((e) => e.date).filter(Boolean))).sort()
  const fnCount = exams.filter((e) => e.session === 'FN').length
  const anCount = exams.filter((e) => e.session === 'AN').length

  // Records per date mapping
  const recordsPerDate = {}
  for (const d of distinctDates) {
    recordsPerDate[d] = exams.filter((e) => e.date === d).length
  }

  const formatDmy = (dateStr) => {
    if (!dateStr) return ''
    const parts = dateStr.split('-')
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
    return dateStr
  }

  // Open modal for adding
  const handleOpenAdd = () => {
    setEditingIndex(null)
    const defaultDate = distinctDates.length > 0 ? distinctDates[distinctDates.length - 1] : '2026-09-01'
    setFormData({
      date: defaultDate,
      session: 'FN',
      examName: 'PERIODICAL TEST I - SEPTEMBER 2026',
      degreeSemester: 'B.E. / B.Tech. - III',
      time: '08:45 AM - 10:15 AM',
      hall: '',
      branch: '',
      courseCode: '',
      registerNumbers: '',
      candidateCount: 0
    })
    setIsModalOpen(true)
  }

  // Open modal for editing
  const handleOpenEdit = (index) => {
    setEditingIndex(index)
    setFormData({ ...exams[index] })
    setIsModalOpen(true)
  }

  // Auto calculate candidate count from register number range
  const handleAutoCalcCount = () => {
    if (!formData.registerNumbers) return
    const seats = generateHallSeatsList(formData.registerNumbers)
    setFormData((prev) => ({ ...prev, candidateCount: seats.length }))
  }

  // Submit Add / Edit
  const handleSubmitForm = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    const url =
      editingIndex !== null
        ? `${API_BASE}/api/admin/exams/${editingIndex}`
        : `${API_BASE}/api/admin/exams`
    const method = editingIndex !== null ? 'PUT' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...adminAuthService.getAuthHeader()
        },
        body: JSON.stringify(formData)
      })

      if (res.status === 401) {
        adminAuthService.clearStorage()
        navigate('/admin/login', { replace: true })
        return
      }

      const result = await res.json()
      if (result.success) {
        setExams(result.data)
        setIsModalOpen(false)
        setSuccessMsg(
          editingIndex !== null
            ? 'Exam arrangement updated successfully.'
            : 'New exam arrangement added successfully.'
        )
        setTimeout(() => setSuccessMsg(''), 4000)
      } else {
        setError(result.error || 'Failed to save exam arrangement.')
      }
    } catch (err) {
      setError('Server communication failed.')
    }
  }

  // Delete arrangement
  const handleDelete = async (index) => {
    const target = exams[index]
    if (
      !window.confirm(
        `Are you sure you want to delete arrangement for Hall ${target.hall} (${target.branch}) on ${target.date}?`
      )
    ) {
      return
    }

    try {
      const res = await fetch(`${API_BASE}/api/admin/exams/${index}`, {
        method: 'DELETE',
        headers: {
          ...adminAuthService.getAuthHeader()
        }
      })

      if (res.status === 401) {
        adminAuthService.clearStorage()
        navigate('/admin/login', { replace: true })
        return
      }

      const result = await res.json()
      if (result.success) {
        setExams(result.data)
        setSuccessMsg('Exam arrangement deleted successfully.')
        setTimeout(() => setSuccessMsg(''), 4000)
      }
    } catch {
      setError('Failed to delete arrangement.')
    }
  }

  // Multi-file Bulk CSV/JSON upload (Merges with existing dates without overwriting)
  const handleBulkUpload = async (fileList) => {
    if (!fileList || fileList.length === 0) return
    setUploading(true)
    setError('')
    setSuccessMsg('')
    setImportReport(null)

    const fileNames = Array.from(fileList).map((f) => f.name)
    const body = new FormData()
    for (let i = 0; i < fileList.length; i++) {
      body.append('files', fileList[i])
    }

    try {
      const res = await fetch(`${API_BASE}/api/admin/upload/exams?mode=append`, {
        method: 'POST',
        headers: {
          ...adminAuthService.getAuthHeader()
        },
        body
      })

      if (res.status === 401) {
        adminAuthService.clearStorage()
        navigate('/admin/login', { replace: true })
        return
      }

      const result = await res.json()
      if (result.success) {
        setExams(result.data)
        setUploadedFilesList((prev) => [...prev, ...fileNames])
        setImportReport(result)
        setSuccessMsg(result.message || `CSV uploaded successfully. Imported ${result.totalRowsImported || result.data?.length || 0} records.`)
      } else {
        setError(result.error || 'Invalid CSV format. Please check the required columns.')
      }
    } catch (err) {
      setError('Upload request failed. Make sure the backend server is running.')
    } finally {
      setUploading(false)
    }
  }

  // Clear all exam arrangements
  const handleClearAllExams = async () => {
    if (
      !window.confirm(
        '⚠️ WARNING: Are you sure you want to delete ALL exam arrangements?\n\nThis will permanently clear all halls, dates, and candidate allocations.'
      )
    ) {
      return
    }

    try {
      const res = await fetch(`${API_BASE}/api/admin/clear/exams`, {
        method: 'DELETE',
        headers: {
          ...adminAuthService.getAuthHeader()
        }
      })

      if (res.status === 401) {
        adminAuthService.clearStorage()
        navigate('/admin/login', { replace: true })
        return
      }

      const result = await res.json()
      if (result.success) {
        setExams([])
        setUploadedFilesList([])
        setImportReport(null)
        setSuccessMsg('All exam arrangements deleted successfully.')
        setTimeout(() => setSuccessMsg(''), 4000)
      } else {
        setError(result.error || 'Failed to clear arrangements.')
      }
    } catch {
      setError('Server communication failed.')
    }
  }

  // Filter exams by search term, date, and session
  const filteredExams = exams.filter((item) => {
    const matchSearch =
      item.hall.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.branch.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.courseCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.registerNumbers.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.examName.toLowerCase().includes(searchTerm.toLowerCase())

    const matchDate = filterDate === 'ALL' || item.date === filterDate
    const matchSession = filterSession === 'ALL' || item.session === filterSession

    return matchSearch && matchDate && matchSession
  })

  return (
    <div className="admin-exam-container">
      {/* Header with Navigation */}
      <header className="admin-exam-header">
        <div className="admin-top-bar">
          <div className="admin-user-info">
            <span className="user-icon">👤</span>
            <span className="user-email">{adminEmail}</span>
            <span className="badge-admin">Admin</span>
          </div>

          <div className="top-bar-actions">
            <Link to="/admin" className="btn-back-dashboard">
              ⚙️ Main Admin Dashboard
            </Link>
            <button type="button" className="btn-logout-small" onClick={handleLogout}>
              🚪 Logout
            </button>
          </div>
        </div>

        <div className="title-section">
          <h1>Exam Hall Arrangement Management</h1>
          <p className="subtitle">
            Configure examination schedules, merge CSV hall files, and inspect roll allocations with 100% data integrity.
          </p>
        </div>

        {/* Admin Navigation Pills */}
        <div className="admin-subnav-pills">
          <Link to="/admin" className="subnav-pill">
            🍔 Menu Management
          </Link>
          <Link to="/admin" className="subnav-pill">
            🕒 College Hours
          </Link>
          <Link to="/admin" className="subnav-pill">
            📍 Venues
          </Link>
          <Link to="/admin/exam-hall" className="subnav-pill active">
            🏫 Exam Hall Arrangement
          </Link>
        </div>
      </header>

      {/* Notifications */}
      {successMsg && <div className="alert alert-success">✓ {successMsg}</div>}
      {error && <div className="alert alert-error">⚠️ {error}</div>}

      {/* Data Integrity Summary Dashboard */}
      <div className="integrity-dashboard-card">
        <div className="integrity-header">
          <span className="integrity-title">📊 LIVE DATA INTEGRITY OVERVIEW</span>
          <span className="integrity-status-pill">✓ Array Data Store Active</span>
        </div>

        <div className="integrity-stats-grid">
          <div className="integrity-stat-box">
            <span className="stat-label">Total Files</span>
            <span className="stat-val">{uploadedFilesList.length || (exams.length > 0 ? 1 : 0)}</span>
          </div>
          <div className="integrity-stat-box">
            <span className="stat-label">Total Exam Records</span>
            <span className="stat-val highlight">{exams.length}</span>
          </div>
          <div className="integrity-stat-box">
            <span className="stat-label">Dates Found</span>
            <span className="stat-val">{distinctDates.length}</span>
          </div>
          <div className="integrity-stat-box">
            <span className="stat-label">FN / AN Breakdown</span>
            <span className="stat-val"><span className="fn">{fnCount} FN</span> / <span className="an">{anCount} AN</span></span>
          </div>
        </div>

        {uploadedFilesList.length > 0 && (
          <div className="uploaded-files-section" style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '0.5rem', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#93c5fd', display: 'block', marginBottom: '0.4rem' }}>
              Selected files:
            </span>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#e2e8f0', fontSize: '0.85rem', lineHeight: '1.6' }}>
              {uploadedFilesList.map((fname, idx) => (
                <li key={idx}>- {fname}</li>
              ))}
            </ul>
          </div>
        )}

        {distinctDates.length > 0 && (
          <div className="integrity-dates-breakdown" style={{ marginTop: '1rem' }}>
            <span className="breakdown-title" style={{ fontWeight: '700', color: '#93c5fd' }}>Dates found ({distinctDates.length}):</span>
            <div className="breakdown-pills" style={{ marginTop: '0.5rem' }}>
              {distinctDates.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`date-breakdown-pill ${filterDate === d ? 'active' : ''}`}
                  onClick={() => setFilterDate(filterDate === d ? 'ALL' : d)}
                  title={`Click to filter by ${formatDmy(d)} (${d})`}
                >
                  <span className="pill-date">{formatDmy(d)}</span>
                  <span className="pill-count">{recordsPerDate[d]} records</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Import Summary Modal / Report Banner */}
      {importReport && (
        <div className="import-report-card">
          <div className="report-header">
            <h3>📥 CSV Import & Integrity Verification Report</h3>
            <button type="button" className="btn-close-report" onClick={() => setImportReport(null)}>
              ✕ Dismiss
            </button>
          </div>
          <div className="report-grid">
            <div className="report-item">
              <span className="report-label">Total Files:</span>
              <span className="report-val">{importReport.totalFiles || 1}</span>
            </div>
            <div className="report-item">
              <span className="report-label">Imported Rows:</span>
              <span className="report-val">{importReport.totalRowsImported || importReport.addedCount || exams.length}</span>
            </div>
            <div className="report-item">
              <span className="report-label">Total Records:</span>
              <span className="report-val highlight">{importReport.totalExamRecords || exams.length}</span>
            </div>
            <div className="report-item">
              <span className="report-label">FN Records Count:</span>
              <span className="report-val fn">{importReport.fnCount || fnCount}</span>
            </div>
            <div className="report-item">
              <span className="report-label">AN Records Count:</span>
              <span className="report-val an">{importReport.anCount || anCount}</span>
            </div>
          </div>
          <div className="report-dates-list">
            <strong>Dates found ({importReport.datesFound?.length || distinctDates.length}):</strong>
            <div className="dates-tags">
              {(importReport.datesFound || distinctDates).map((d) => (
                <span key={d} className="date-tag">
                  {formatDmy(d)} ({importReport.recordsPerDate?.[d] || recordsPerDate[d] || 0} records)
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action Toolbar */}
      <div className="exam-toolbar-card">
        <div className="toolbar-left">
          <button type="button" className="btn-add-exam" onClick={handleOpenAdd}>
            ➕ Add Arrangement
          </button>

          {/* Bulk Multi-CSV Upload */}
          <label className="bulk-upload-label" title="Select one or multiple CSV files to merge">
            <input
              type="file"
              accept=".csv,.json"
              multiple
              className="bulk-input-hidden"
              disabled={uploading}
              onChange={(e) => {
                const files = e.target.files
                if (files && files.length > 0) handleBulkUpload(files)
                e.target.value = ''
              }}
            />
            <span className="btn-bulk-upload">
              {uploading ? '⏳ Merging CSVs...' : '📤 Upload CSV'}
            </span>
          </label>

          <a
            href={`${API_BASE}/api/admin/template/exams`}
            download="exams_template.csv"
            className="btn-template-download"
          >
            📥 Download CSV Template
          </a>

          {/* Clear all exams button */}
          <button
            type="button"
            className="btn-clear-exams"
            onClick={handleClearAllExams}
            title="Delete all exam arrangements"
          >
            🗑️ Clear All Arrangements
          </button>
        </div>

        <div className="toolbar-right">
          <input
            type="text"
            placeholder="Search hall, branch, course, roll..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />

          <select
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="session-filter-select"
            title="Filter by Exam Date"
          >
            <option value="ALL">📅 All Dates ({distinctDates.length})</option>
            {distinctDates.map((d) => (
              <option key={d} value={d}>
                {formatDisplayDate(d)} ({recordsPerDate[d]})
              </option>
            ))}
          </select>

          <select
            value={filterSession}
            onChange={(e) => setFilterSession(e.target.value)}
            className="session-filter-select"
          >
            <option value="ALL">All Sessions</option>
            <option value="FN">FN (Forenoon - {fnCount})</option>
            <option value="AN">AN (Afternoon - {anCount})</option>
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="table-card">
        <div className="table-header-info">
          <h3>Current Exam Arrangements ({filteredExams.length} records)</h3>
        </div>

        {loading ? (
          <div className="table-loading">Loading exam arrangements...</div>
        ) : filteredExams.length === 0 ? (
          <div className="table-empty">No matching exam arrangements found.</div>
        ) : (
          <div className="table-wrapper">
            <table className="exam-data-table">
              <thead>
                <tr>
                  <th>Date & Session</th>
                  <th>Hall</th>
                  <th>Branch & Course</th>
                  <th>Exam Name</th>
                  <th>Time</th>
                  <th>Register Number Ranges</th>
                  <th>Candidates</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExams.map((item, idx) => (
                  <tr key={idx}>
                    <td>
                      <div className="cell-date">
                        <span className="date-main">{formatDisplayDate(item.date)}</span>
                        <span className={`session-tag ${item.session}`}>{item.session}</span>
                      </div>
                    </td>
                    <td>
                      <span className="hall-badge">{item.hall}</span>
                    </td>
                    <td>
                      <div className="cell-course">
                        <strong>{item.branch}</strong>
                        <span className="course-code">{item.courseCode}</span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-exam-name">
                        <span>{item.examName}</span>
                        <span className="degree-text">{item.degreeSemester}</span>
                      </div>
                    </td>
                    <td>
                      <span className="time-text">{item.time}</span>
                    </td>
                    <td>
                      <span className="reg-ranges font-mono">{item.registerNumbers}</span>
                    </td>
                    <td>
                      <span className="count-badge">{item.candidateCount}</span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          type="button"
                          className="btn-action-edit"
                          onClick={() => handleOpenEdit(idx)}
                          title="Edit Arrangement"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          className="btn-action-delete"
                          onClick={() => handleDelete(idx)}
                          title="Delete Arrangement"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h2>{editingIndex !== null ? '✏️ Edit Exam Arrangement' : '➕ Add Exam Arrangement'}</h2>
              <button type="button" className="btn-modal-close" onClick={() => setIsModalOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="modal-form">
              <div className="form-grid-2">
                <div className="form-field">
                  <label>Exam Date (YYYY-MM-DD)</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>

                <div className="form-field">
                  <label>Session</label>
                  <select
                    value={formData.session}
                    onChange={(e) => setFormData({ ...formData, session: e.target.value })}
                  >
                    <option value="FN">FN (Forenoon)</option>
                    <option value="AN">AN (Afternoon)</option>
                  </select>
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-field">
                  <label>Exam Name</label>
                  <input
                    type="text"
                    required
                    value={formData.examName}
                    onChange={(e) => setFormData({ ...formData, examName: e.target.value })}
                    placeholder="PERIODICAL TEST I - SEPTEMBER 2026"
                  />
                </div>

                <div className="form-field">
                  <label>Degree / Semester</label>
                  <input
                    type="text"
                    value={formData.degreeSemester}
                    onChange={(e) => setFormData({ ...formData, degreeSemester: e.target.value })}
                    placeholder="B.E. / B.Tech. - III"
                  />
                </div>
              </div>

              <div className="form-grid-3">
                <div className="form-field">
                  <label>Exam Time</label>
                  <input
                    type="text"
                    required
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    placeholder="08:45 AM - 10:15 AM"
                  />
                </div>

                <div className="form-field">
                  <label>Hall Number</label>
                  <input
                    type="text"
                    required
                    value={formData.hall}
                    onChange={(e) => setFormData({ ...formData, hall: e.target.value })}
                    placeholder="WW 202"
                  />
                </div>

                <div className="form-field">
                  <label>Branch</label>
                  <input
                    type="text"
                    required
                    value={formData.branch}
                    onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                    placeholder="CS"
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-field">
                  <label>Course Code</label>
                  <input
                    type="text"
                    required
                    value={formData.courseCode}
                    onChange={(e) => setFormData({ ...formData, courseCode: e.target.value })}
                    placeholder="22CS305"
                  />
                </div>

                <div className="form-field">
                  <div className="label-with-action">
                    <label>Candidate Count</label>
                    <button
                      type="button"
                      className="btn-autocalc"
                      onClick={handleAutoCalcCount}
                      title="Calculate count from range"
                    >
                      ⚡ Auto Calc
                    </button>
                  </div>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.candidateCount}
                    onChange={(e) =>
                      setFormData({ ...formData, candidateCount: parseInt(e.target.value, 10) || 0 })
                    }
                  />
                </div>
              </div>

              <div className="form-field">
                <label>Register Number Ranges (e.g. 7376251CS101-130 or comma-separated)</label>
                <input
                  type="text"
                  required
                  value={formData.registerNumbers}
                  onChange={(e) => setFormData({ ...formData, registerNumbers: e.target.value })}
                  placeholder="7376251CS101-130, 7376251CS412-426"
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-modal-cancel" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-submit">
                  {editingIndex !== null ? 'Save Changes' : 'Create Arrangement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminExamHallPage
