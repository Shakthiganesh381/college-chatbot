import { useState, useEffect } from 'react'
import {
  getTodayDateStringIndia,
  formatDisplayDate,
  hasExamToday,
  getNextScheduledExamDate,
  findStudentHall,
  getExamsByDateAndSession,
  generateHallSeatsList,
  getAllExams
} from '../services/examHallService'
import './ExamHallPage.css'

// Visual Hall Layout Component
function VisualHallLayout({ result }) {
  if (!result || !result.found) return null

  const seatsList = generateHallSeatsList(result.registerNumbers)
  const studentReg = result.registerNumber

  return (
    <div className="visual-hall-card">
      <div className="visual-hall-header">
        <div className="hall-header-left">
          <h3>SEATING LAYOUT — HALL {result.hall}</h3>
          <span className="hall-header-sub">
            Course: <strong>{result.courseCode}</strong> ({result.branch}) • Total Candidates:{' '}
            <strong>{seatsList.length}</strong>
          </span>
        </div>
        <div className="hall-legend">
          <div className="legend-item">
            <span className="legend-color your-seat"></span>
            <span>Your Seat</span>
          </div>
          <div className="legend-item">
            <span className="legend-color other-seat"></span>
            <span>Other Candidates</span>
          </div>
        </div>
      </div>

      {/* Front / Blackboard representation */}
      <div className="hall-front-board">
        <span className="board-text">👨‍🏫 FRONT / BLACKBOARD & INVIGILATOR DESK</span>
      </div>

      {/* Seating Grid */}
      <div className="seats-grid">
        {seatsList.map((regNum, idx) => {
          const isCurrentStudent = regNum === studentReg
          const seatNumber = idx + 1

          return (
            <div
              key={regNum}
              className={`seat-box ${isCurrentStudent ? 'is-target-seat' : ''}`}
            >
              <div className="seat-header">
                <span className="seat-number">Seat #{seatNumber}</span>
                {isCurrentStudent && <span className="your-seat-tag">YOU</span>}
              </div>
              <div className="seat-reg">{regNum}</div>
            </div>
          )
        })}
      </div>

      <div className="hall-footer-notice">
        <span>
          📌 <em>Seating numbers are arranged in sequential order for Hall {result.hall}. Please confirm with the room invigilator upon entry.</em>
        </span>
      </div>
    </div>
  )
}

function ExamHallPage() {
  const [examsList, setExamsList] = useState(getAllExams())
  const todayDateStr = getTodayDateStringIndia()

  // Live fetch from public backend endpoint on mount
  useEffect(() => {
    const apiBase = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:5000'
    fetch(`${apiBase}/api/exams`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          setExamsList(data.data)
        }
      })
      .catch((err) => {
        console.warn('Could not load live exams from backend, using local dataset:', err)
      })
  }, [])

  // Dynamic calculations from active merged examsList
  const allAvailableDates = Array.from(new Set(examsList.map((e) => e.date).filter(Boolean))).sort()
  const examToday = hasExamToday(examsList)
  const nextScheduledDate = getNextScheduledExamDate(examsList)

  // Default selected date to today if exams exist today, otherwise first available date or today
  const [selectedDate, setSelectedDate] = useState(
    examToday ? todayDateStr : (allAvailableDates[0] || todayDateStr)
  )
  const [session, setSession] = useState('ALL')
  const [registerNumber, setRegisterNumber] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [viewMode, setViewMode] = useState('both') // 'search' | 'browse' | 'both'

  // Update selectedDate if examsList loads and current selectedDate is not set
  useEffect(() => {
    if (allAvailableDates.length > 0 && !allAvailableDates.includes(selectedDate)) {
      if (examToday) {
        setSelectedDate(todayDateStr)
      } else {
        setSelectedDate(allAvailableDates[0])
      }
    }
  }, [examsList])

  // Get all matching arrangements for currently selected date and session
  const matchingHalls = getExamsByDateAndSession(selectedDate, session, examsList)

  // Group halls by hall name for clear visual breakdown
  const hallsSummary = {}
  for (const item of matchingHalls) {
    if (!hallsSummary[item.hall]) {
      hallsSummary[item.hall] = []
    }
    hallsSummary[item.hall].push(item)
  }

  const handleSearch = (e) => {
    e.preventDefault()
    if (!registerNumber.trim()) return

    const result = findStudentHall({
      registerNumber: registerNumber.trim(),
      date: selectedDate,
      session,
      examsList
    })

    setSearchResult(result)
  }

  const handleResetToToday = () => {
    setSelectedDate(todayDateStr)
    setSession('ALL')
    setSearchResult(null)
  }

  return (
    <div className="exam-hall-container">
      <header className="exam-hall-header">
        <div className="badge-pill">🏫 Examination Portal</div>
        <h1>EXAM HALL FINDER</h1>
        <p className="exam-hall-subtitle">
          Find your assigned examination hall and seating details in real time.
        </p>
      </header>

      {/* Date Banner */}
      <div className="date-banner-card">
        <div className="date-info-left">
          <span className="date-label">Today's Date (Asia/Kolkata)</span>
          <span className="date-value">{formatDisplayDate(todayDateStr)}</span>
        </div>
        <div className="date-status-right">
          {examToday ? (
            <span className="status-badge active">● Exam in Progress Today</span>
          ) : (
            <span className="status-badge inactive">○ No Exam Scheduled Today</span>
          )}
        </div>
      </div>

      {/* Available Exam Dates Overview */}
      {allAvailableDates.length > 0 && (
        <div className="available-dates-banner">
          <span className="dates-banner-title">📅 Scheduled Exam Dates ({allAvailableDates.length}):</span>
          <div className="dates-pill-list">
            {allAvailableDates.map((d) => {
              const countForDate = examsList.filter((e) => e.date === d).length
              return (
                <button
                  key={d}
                  type="button"
                  className={`date-pill-btn ${selectedDate === d ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedDate(d)
                    setSearchResult(null)
                  }}
                >
                  {formatDisplayDate(d)} {d === todayDateStr ? '★ (Today)' : ''}
                  <span className="date-count-pill">({countForDate})</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Notice when today has no exams */}
      {!examToday && selectedDate === todayDateStr && (
        <div className="no-exam-notice">
          <div className="notice-icon">ℹ️</div>
          <div className="notice-content">
            <h3>No exam hall arrangement is available for today.</h3>
            {nextScheduledDate && (
              <p>
                Next scheduled exam date: <strong>{formatDisplayDate(nextScheduledDate)}</strong>
              </p>
            )}
            {allAvailableDates.length > 0 && (
              <p className="hint-text">
                Please select a scheduled date above to view hall arrangements and search your roll number.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Student Search Card */}
      <div className="search-card">
        <div className="selected-future-banner">
          <span>
            Selected Exam Date: <strong>{formatDisplayDate(selectedDate)}</strong>
          </span>
          {selectedDate !== todayDateStr && (
            <button type="button" className="btn-reset-today" onClick={handleResetToToday}>
              Reset to Today
            </button>
          )}
        </div>

        {/* Date Selector Dropdown */}
        <div className="date-selector-row">
          <label className="input-label">Exam Date:</label>
          <select
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value)
              setSearchResult(null)
            }}
            className="date-select-dropdown"
          >
            {allAvailableDates.map((d) => {
              const count = examsList.filter((e) => e.date === d).length
              return (
                <option key={d} value={d}>
                  {formatDisplayDate(d)} {d === todayDateStr ? '(Today)' : ''} — {count} arrangement(s)
                </option>
              )
            })}
          </select>
        </div>

        <form onSubmit={handleSearch} className="exam-search-form">
          {/* Session Toggle */}
          <div className="form-group">
            <label className="input-label">Exam Session</label>
            <div className="session-toggle-group">
              <button
                type="button"
                className={`session-btn ${session === 'ALL' ? 'active' : ''}`}
                onClick={() => {
                  setSession('ALL')
                  setSearchResult(null)
                }}
              >
                <span className="session-code">ALL</span>
                <span className="session-desc">All Sessions</span>
              </button>
              <button
                type="button"
                className={`session-btn ${session === 'FN' ? 'active' : ''}`}
                onClick={() => {
                  setSession('FN')
                  setSearchResult(null)
                }}
              >
                <span className="session-code">FN</span>
                <span className="session-desc">Forenoon (Morning)</span>
              </button>
              <button
                type="button"
                className={`session-btn ${session === 'AN' ? 'active' : ''}`}
                onClick={() => {
                  setSession('AN')
                  setSearchResult(null)
                }}
              >
                <span className="session-code">AN</span>
                <span className="session-desc">Afternoon (Evening)</span>
              </button>
            </div>
          </div>

          {/* Register Number Input */}
          <div className="form-group">
            <label className="input-label" htmlFor="registerNumberInput">
              Register Number Search
            </label>
            <div className="input-wrapper">
              <input
                id="registerNumberInput"
                type="text"
                value={registerNumber}
                onChange={(e) => setRegisterNumber(e.target.value)}
                placeholder="Enter register number (e.g. 7376251CS101)"
                className="register-input"
                autoComplete="off"
                maxLength={30}
              />
              {registerNumber && (
                <button
                  type="button"
                  className="clear-input-btn"
                  onClick={() => setRegisterNumber('')}
                  title="Clear"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <button
            type="submit"
            className="find-hall-btn"
            disabled={!registerNumber.trim()}
          >
            <span>🔍 Find My Hall</span>
          </button>
        </form>
      </div>

      {/* Result Presentation */}
      {searchResult && (
        <div className="result-section">
          {searchResult.found ? (
            <div className="found-result-container">
              {/* Hall Details Card */}
              <div className="hall-details-card">
                <div className="details-header">
                  <span className="details-title">EXAM HALL DETAILS</span>
                  <span className="hall-number-pill">{searchResult.hall}</span>
                </div>

                <div className="details-grid">
                  <div className="detail-item">
                    <span className="detail-label">Register Number</span>
                    <span className="detail-val font-mono highlight">{searchResult.registerNumber}</span>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label">Examination</span>
                    <span className="detail-val">{searchResult.examName}</span>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label">Degree / Semester</span>
                    <span className="detail-val">{searchResult.degreeSemester}</span>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label">Exam Date</span>
                    <span className="detail-val">{searchResult.formattedDate}</span>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label">Session</span>
                    <span className="detail-val badge-session">{searchResult.session}</span>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label">Exam Timing</span>
                    <span className="detail-val text-time">{searchResult.time}</span>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label">Assigned Hall</span>
                    <span className="detail-val text-hall">{searchResult.hall}</span>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label">Branch & Course</span>
                    <span className="detail-val">
                      <strong>{searchResult.branch}</strong> — {searchResult.courseCode}
                    </span>
                  </div>
                </div>
              </div>

              {/* Visual Seating Layout */}
              <VisualHallLayout result={searchResult} />
            </div>
          ) : (
            <div className="result-error-card">
              <div className="error-icon">⚠️</div>
              <div className="error-text">
                <h3>{searchResult.message}</h3>
                {searchResult.noExamOnDate && (
                  <p>Check the scheduled exam calendar above for available test dates.</p>
                )}
                {searchResult.noSessionOnDate && (
                  <p>Please check if you selected the right session (FN vs AN or ALL).</p>
                )}
                {!searchResult.noExamOnDate && !searchResult.noSessionOnDate && (
                  <p>Please verify your register number or browse all halls scheduled for this date below.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Date & Session Overview: Showing ALL matching halls */}
      {matchingHalls.length > 0 && (
        <div className="all-halls-section">
          <div className="section-header-bar">
            <div>
              <h2>
                Halls Scheduled on {formatDisplayDate(selectedDate)}{' '}
                {session !== 'ALL' ? `(${session})` : '(All Sessions)'}
              </h2>
              <p className="section-subtitle">
                Found <strong>{matchingHalls.length}</strong> exam arrangement(s) across{' '}
                <strong>{Object.keys(hallsSummary).length}</strong> distinct exam hall(s).
              </p>
            </div>
          </div>

          <div className="halls-grid-cards">
            {Object.keys(hallsSummary).map((hallName) => {
              const rows = hallsSummary[hallName]
              const totalCandidates = rows.reduce((acc, r) => acc + (r.candidateCount || 0), 0)

              return (
                <div key={hallName} className="hall-summary-card">
                  <div className="hall-card-top">
                    <span className="hall-title-badge">🏢 Hall {hallName}</span>
                    <span className="hall-candidates-badge">{totalCandidates} Candidates</span>
                  </div>

                  <div className="hall-card-body">
                    {rows.map((r, rIdx) => (
                      <div key={rIdx} className="hall-allocation-row">
                        <div className="alloc-header">
                          <span className={`alloc-session ${r.session}`}>{r.session}</span>
                          <span className="alloc-course">
                            <strong>{r.branch}</strong> ({r.courseCode})
                          </span>
                          <span className="alloc-time">{r.time}</span>
                        </div>
                        <div className="alloc-ranges font-mono" title={r.registerNumbers}>
                          Rolls: {r.registerNumbers}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default ExamHallPage

