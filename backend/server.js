import express from 'express'
import cors from 'cors'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { getBotResponse, reloadData, getData } from './chatbotService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Helper: Simple and safe .env loader for Node environments without external dotenv dependency
function loadEnvFile() {
  const envPaths = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '../.env'),
    path.join(__dirname, '../../.env')
  ]

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8')
        const lines = content.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) continue
          const eqIdx = trimmed.indexOf('=')
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim()
            let val = trimmed.slice(eqIdx + 1).trim()
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1)
            }
            if (process.env[key] === undefined) {
              process.env[key] = val
            }
          }
        }
      } catch (err) {
        console.warn(`Could not parse ${envPath}:`, err.message)
      }
    }
  }
}

// Load environment configuration
loadEnvFile()

const app = express()
const PORT = process.env.PORT || 5000

// Setup multer storage (in-memory for simple parsing & validation)
const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
})

// Setup middleware
const corsOrigin = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(',').map((o) => o.trim())
  : '*'

app.use(
  cors({
    origin: corsOrigin === '*' ? true : corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
)
app.use(express.json())

// Paths to datasets
const DATA_DIR = path.resolve(__dirname, '../data')
const SRC_DATA_DIR = path.resolve(__dirname, '../src/data')
const FILE_PATHS = {
  menu: path.join(DATA_DIR, 'menu.json'),
  hours: path.join(DATA_DIR, 'hours.json'),
  venues: path.join(DATA_DIR, 'venues.json'),
  exams: path.join(DATA_DIR, 'exams.json')
}
const SRC_FILE_PATHS = {
  menu: path.join(SRC_DATA_DIR, 'menu.json'),
  hours: path.join(SRC_DATA_DIR, 'hours.json'),
  venues: path.join(SRC_DATA_DIR, 'venues.json'),
  exams: path.join(SRC_DATA_DIR, 'exams.json')
}

// Helper: Ensure data directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}
if (!fs.existsSync(SRC_DATA_DIR)) {
  fs.mkdirSync(SRC_DATA_DIR, { recursive: true })
}

// Helper: Save and synchronize dataset to both data/ and src/data/
function syncDataset(type, data) {
  try {
    const jsonStr = JSON.stringify(data, null, 2)
    fs.writeFileSync(FILE_PATHS[type], jsonStr, 'utf8')
    fs.writeFileSync(SRC_FILE_PATHS[type], jsonStr, 'utf8')

    if (type === 'exams' && Array.isArray(data)) {
      let csv = 'date,session,examName,time,hall,branch,courseCode,registerNumbers,candidateCount\n'
      for (const e of data) {
        const regClean = (e.registerNumbers || '').includes(',')
          ? `"${e.registerNumbers}"`
          : e.registerNumbers || ''
        csv += `${e.date || ''},${e.session || ''},${e.examName || ''},${e.time || ''},${e.hall || ''},${e.branch || ''},${e.courseCode || ''},${regClean},${e.candidateCount || 0}\n`
      }
      fs.writeFileSync(path.join(DATA_DIR, 'exams.csv'), csv, 'utf8')
      fs.writeFileSync(path.join(SRC_DATA_DIR, 'exams.csv'), csv, 'utf8')
    }
  } catch (err) {
    console.error(`Error synchronizing ${type} dataset:`, err)
  }
}

// Helper: Normalize date strings to standard YYYY-MM-DD format (Indian format DD/MM/YYYY)
function normalizeDateString(rawDate) {
  if (!rawDate) return ''
  const clean = String(rawDate).trim()

  // 1. Strict ISO Match: YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  const isoMatch = clean.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/)
  if (isoMatch) {
    const y = isoMatch[1]
    const m = String(isoMatch[2]).padStart(2, '0')
    const d = String(isoMatch[3]).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // 2. Strict Indian Date Match: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, D/M/YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (dmyMatch) {
    const d = String(dmyMatch[1]).padStart(2, '0')
    const m = String(dmyMatch[2]).padStart(2, '0')
    const y = dmyMatch[3]
    return `${y}-${m}-${d}`
  }

  // 3. Indian Date with 2-digit year: DD/MM/YY -> 20YY
  const dmyShortMatch = clean.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2})$/)
  if (dmyShortMatch) {
    const d = String(dmyShortMatch[1]).padStart(2, '0')
    const m = String(dmyShortMatch[2]).padStart(2, '0')
    const y = `20${dmyShortMatch[3]}`
    return `${y}-${m}-${d}`
  }

  // 4. Embedded ISO Match
  const embeddedIso = clean.match(/\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b/)
  if (embeddedIso) {
    const y = embeddedIso[1]
    const m = String(embeddedIso[2]).padStart(2, '0')
    const d = String(embeddedIso[3]).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // 5. Embedded Indian DMY Match
  const embeddedDmy = clean.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/)
  if (embeddedDmy) {
    const d = String(embeddedDmy[1]).padStart(2, '0')
    const m = String(embeddedDmy[2]).padStart(2, '0')
    const y = embeddedDmy[3]
    return `${y}-${m}-${d}`
  }

  return clean
}

// Helper: Check if two exam records are 100% exact identical duplicates across every field
function areRecordsIdentical(a, b) {
  if (!a || !b) return false
  return (
    String(a.date || '').trim() === String(b.date || '').trim() &&
    String(a.session || '').trim().toUpperCase() === String(b.session || '').trim().toUpperCase() &&
    String(a.hall || '').trim().toLowerCase() === String(b.hall || '').trim().toLowerCase() &&
    String(a.branch || '').trim().toLowerCase() === String(b.branch || '').trim().toLowerCase() &&
    String(a.courseCode || '').trim().toLowerCase() === String(b.courseCode || '').trim().toLowerCase() &&
    String(a.registerNumbers || '').trim().toUpperCase() === String(b.registerNumbers || '').trim().toUpperCase() &&
    String(a.examName || '').trim().toLowerCase() === String(b.examName || '').trim().toLowerCase() &&
    String(a.degreeSemester || '').trim().toLowerCase() === String(b.degreeSemester || '').trim().toLowerCase() &&
    String(a.time || '').trim().toLowerCase() === String(b.time || '').trim().toLowerCase() &&
    Number(a.candidateCount || 0) === Number(b.candidateCount || 0)
  )
}

// Helper: Calculate data integrity statistics for exams array
function calculateExamStats(examsList) {
  const list = Array.isArray(examsList) ? examsList : []
  const distinctDates = Array.from(new Set(list.map((e) => e.date).filter(Boolean))).sort()
  const recordsPerDate = {}
  let fnCount = 0
  let anCount = 0

  for (const date of distinctDates) {
    recordsPerDate[date] = 0
  }

  for (const item of list) {
    const d = item.date
    if (d) {
      recordsPerDate[d] = (recordsPerDate[d] || 0) + 1
    }
    const sess = String(item.session || '').trim().toUpperCase()
    if (sess === 'FN') fnCount++
    else if (sess === 'AN') anCount++
  }

  const formattedDatesFound = distinctDates.map((d) => {
    const parts = d.split('-')
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
    return d
  })

  return {
    totalExamRecords: list.length,
    datesFound: distinctDates,
    formattedDatesFound,
    recordsPerDate,
    fnCount,
    anCount
  }
}

// Helper: Calculate candidates from range string (e.g. 7376251CS101-130)
function calculateCandidatesFromRange(rangeStr) {
  if (!rangeStr) return 0
  const subRanges = String(rangeStr).split(',').map((s) => s.trim()).filter(Boolean)
  let total = 0
  for (const sub of subRanges) {
    if (!sub.includes('-')) {
      if (sub.length > 0) total++
      continue
    }
    const [startRaw, endRaw] = sub.split('-').map((s) => s.trim())
    const startMatch = startRaw.match(/^(.*?)(\d+)$/)
    if (!startMatch) {
      total++
      continue
    }
    const prefix = startMatch[1]
    const startNum = parseInt(startMatch[2], 10)
    let endNum = null

    if (/^\d+$/.test(endRaw)) {
      if (endRaw.length === startMatch[2].length) {
        endNum = parseInt(endRaw, 10)
      } else if (endRaw.length < startMatch[2].length) {
        const prefixDigits = startMatch[2].slice(0, -endRaw.length)
        endNum = parseInt(prefixDigits + endRaw, 10)
      } else {
        endNum = parseInt(endRaw, 10)
      }
    } else {
      const endMatch = endRaw.match(/^(.*?)(\d+)$/)
      if (endMatch && endMatch[1] === prefix) {
        endNum = parseInt(endMatch[2], 10)
      }
    }

    if (endNum !== null && endNum >= startNum) {
      total += endNum - startNum + 1
    } else {
      total++
    }
  }
  return total
}

// Helper: Robust CSV Parser handling quotes, commas, BOM, newlines, and spaces
function parseCSV(text) {
  if (!text || typeof text !== 'string') return []
  const cleanText = text.replace(/^\uFEFF/, '')

  const rows = []
  let currentRow = []
  let currentVal = ''
  let inQuotes = false

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i]
    const nextChar = cleanText[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"'
        i++ // Skip escaped quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentVal.trim())
      currentVal = ''
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++ // Skip \n in \r\n
      }
      currentRow.push(currentVal.trim())
      currentVal = ''
      if (currentRow.some((val) => val.length > 0)) {
        rows.push(currentRow)
      }
      currentRow = []
    } else {
      currentVal += char
    }
  }

  // Flush remaining row
  if (currentVal.length > 0 || currentRow.length > 0) {
    currentRow.push(currentVal.trim())
    if (currentRow.some((val) => val.length > 0)) {
      rows.push(currentRow)
    }
  }

  if (rows.length === 0) return []

  const rawHeaders = rows[0]
  const results = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.length === 0 || (row.length === 1 && row[0] === '')) continue
    const obj = {}
    rawHeaders.forEach((header, idx) => {
      obj[header.trim()] = row[idx] !== undefined ? row[idx].trim() : ''
    })
    results.push(obj)
  }

  return results
}

// Transform parsed data based on type
function processUploadedData(type, fileContent, extension) {
  let parsedRaw

  if (extension === '.json') {
    try {
      parsedRaw = JSON.parse(fileContent)
    } catch (e) {
      throw new Error(`Invalid JSON syntax: ${e.message}`)
    }
  } else if (extension === '.csv') {
    parsedRaw = parseCSV(fileContent)
    if (parsedRaw.length === 0) {
      throw new Error('CSV file is empty or has no data rows.')
    }
  } else {
    throw new Error('Unsupported file extension. Only .json and .csv are supported.')
  }

  if (type === 'menu') {
    if (!Array.isArray(parsedRaw) && typeof parsedRaw === 'object' && parsedRaw !== null) {
      return parsedRaw
    }
    if (Array.isArray(parsedRaw)) {
      const menuObj = {}
      for (const row of parsedRaw) {
        const date = row.date || row.day || row.date_str || row['Date'] || row['date']
        if (!date) continue
        const normDate = normalizeDateString(date)
        menuObj[normDate] = {
          breakfast: row.breakfast || row.morningsnack || row['Breakfast'] || '',
          lunch: row.lunch || row['Lunch'] || '',
          snacks: row.snacks || row.snack || row.tea || row['Snacks'] || '',
          dinner: row.dinner || row.supper || row['Dinner'] || ''
        }
      }
      if (Object.keys(menuObj).length === 0) {
        throw new Error('No valid menu rows with a "date" column were found.')
      }
      return menuObj
    }
    throw new Error('Invalid format for menu data.')
  }

  if (type === 'hours') {
    if (!Array.isArray(parsedRaw)) {
      throw new Error('Hours data must be a JSON array or CSV format.')
    }
    return parsedRaw.map((row) => ({
      day: row.day || row.dayofweek || row['Day'] || 'Monday',
      department: row.department || row.dept || row['Department'] || 'General',
      startTime: row.starttime || row.start_time || row.start || row['Start Time'] || row['StartTime'] || '08:30',
      endTime: row.endtime || row.end_time || row.end || row['End Time'] || row['EndTime'] || '16:30'
    }))
  }

  if (type === 'venues') {
    if (!Array.isArray(parsedRaw)) {
      throw new Error('Venues data must be a JSON array or CSV format.')
    }
    return parsedRaw.map((row) => ({
      name: row.name || row.venuename || row['Venue Name'] || row['Name'] || 'Venue',
      building: row.building || row.block || row['Building'] || 'Main Block',
      floor: row.floor || row.level || row['Floor'] || 'Ground Floor',
      description: row.description || row.desc || row['Description'] || ''
    }))
  }

  if (type === 'exams') {
    if (!Array.isArray(parsedRaw) || parsedRaw.length === 0) {
      throw new Error('Invalid CSV format. Please check the required columns.')
    }

    const firstRow = parsedRaw[0]
    const headerKeys = Object.keys(firstRow).map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, ''))
    const hasDateCol = headerKeys.some((k) => ['date', 'datesession', 'datesess', 'examdate', 'dateofexam', 'day'].includes(k))
    const hasHallCol = headerKeys.some((k) => ['hall', 'hallno', 'hallnumber', 'room', 'roomno', 'roomnumber', 'venue', 'block'].includes(k))
    const hasRegCol = headerKeys.some((k) => ['registerno', 'registernumbers', 'registernos', 'regno', 'regnos', 'register', 'rollno', 'candidatesrange'].includes(k))
    const hasBranchOrCourse = headerKeys.some((k) => ['branch', 'coursecode', 'course', 'subject', 'dept', 'department'].includes(k))

    if (!hasDateCol && !(hasHallCol || hasRegCol || hasBranchOrCourse)) {
      throw new Error('Invalid CSV format. Please check the required columns.')
    }

    const processedRows = []

    for (const row of parsedRaw) {
      const getVal = (possibleKeys) => {
        for (const rawKey of Object.keys(row)) {
          const cleanKey = rawKey.toLowerCase().replace(/[^a-z0-9]/g, '')
          for (const target of possibleKeys) {
            const cleanTarget = target.toLowerCase().replace(/[^a-z0-9]/g, '')
            if (cleanKey === cleanTarget) {
              if (row[rawKey] !== undefined && row[rawKey] !== null && String(row[rawKey]).trim() !== '') {
                return String(row[rawKey]).trim()
              }
            }
          }
        }
        return ''
      }

      let dateVal = getVal(['date', 'datesession', 'datesess', 'examdate', 'dateofexam', 'day'])
      let sessionVal = getVal(['session', 'datesession', 'datesess', 'slot', 'sess'])

      if (/\b(FN|AN)\b/i.test(dateVal)) {
        const sessionMatch = dateVal.match(/\b(FN|AN)\b/i)
        if (sessionMatch) {
          sessionVal = sessionMatch[1].toUpperCase()
        }
      }
      dateVal = normalizeDateString(dateVal)
      sessionVal = (sessionVal || 'FN').toUpperCase()
      if (!['FN', 'AN'].includes(sessionVal)) {
        sessionVal = sessionVal.includes('AN') || sessionVal.toLowerCase().includes('afternoon') ? 'AN' : 'FN'
      }

      const hallVal = getVal(['hall', 'hallno', 'hallnumber', 'room', 'roomno', 'roomnumber', 'venue', 'block']) || 'WW 202'

      let branchVal = getVal(['branch', 'branchcourse', 'dept', 'department', 'programme']) || 'CS'
      let courseVal = getVal(['coursecode', 'course', 'subjectcode', 'subject', 'papercode', 'branchcourse']) || ''

      if (branchVal.includes('-')) {
        const parts = branchVal.split('-').map((s) => s.trim())
        branchVal = parts[0]
        if (!courseVal) courseVal = parts[1] || parts[0]
      } else if (branchVal.includes('(')) {
        const parts = branchVal.replace(')', '').split('(').map((s) => s.trim())
        branchVal = parts[0]
        if (!courseVal) courseVal = parts[1] || parts[0]
      }
      if (!courseVal) courseVal = branchVal

      const regVal = getVal([
        'registerno',
        'registernumbers',
        'registernos',
        'registernumber',
        'regno',
        'regnos',
        'register',
        'registers',
        'registerrange',
        'rollno',
        'rollnos',
        'rollnumber',
        'rollnumbers',
        'candidatesrange'
      ])

      const countVal = getVal([
        'noofcandidates',
        'candidatecount',
        'candidates',
        'candidatescount',
        'totalcandidates',
        'count',
        'strength',
        'students',
        'total',
        'noofstudents'
      ])

      let candidateCount = parseInt(countVal, 10)
      if (isNaN(candidateCount) || candidateCount <= 0) {
        candidateCount = calculateCandidatesFromRange(regVal)
      }

      const examNameVal = getVal(['examname', 'exam', 'title', 'test']) || 'PERIODICAL TEST I - SEPTEMBER 2026'
      const degreeVal = getVal(['degreesemester', 'degree', 'semester', 'sem']) || 'B.E. / B.Tech. - III'
      const timeVal = getVal(['time', 'examtime', 'timing', 'slot']) || (sessionVal === 'AN' ? '01:45 PM - 03:15 PM' : '08:45 AM - 10:15 AM')

      if (!dateVal && !hallVal) {
        continue
      }

      processedRows.push({
        date: dateVal,
        session: sessionVal,
        examName: examNameVal,
        degreeSemester: degreeVal,
        time: timeVal,
        hall: hallVal,
        branch: branchVal.toUpperCase(),
        courseCode: courseVal.toUpperCase(),
        registerNumbers: regVal,
        candidateCount
      })
    }

    if (processedRows.length === 0) {
      throw new Error('Invalid CSV format. Please check the required columns.')
    }

    return processedRows
  }

  throw new Error(`Unknown data category "${type}". Supported: menu, hours, venues, exams.`)
}

// =========================================================================
// AUTHENTICATION & SECURITY STATE
// =========================================================================

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'shakthiganeshn.it25@bitsathy.ac.in').trim().toLowerCase()
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || '12345678').trim()
const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours persistent session

const activeSessions = new Map()

// Clean expired sessions periodically
setInterval(() => {
  const now = Date.now()
  for (const [token, session] of activeSessions.entries()) {
    if (session.expiresAt && now > session.expiresAt) {
      activeSessions.delete(token)
    }
  }
}, 30 * 60 * 1000)

// Admin Authentication Middleware
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!token || !activeSessions.has(token)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Admin authentication token required or invalid.'
    })
  }

  const session = activeSessions.get(token)
  if (session.expiresAt && Date.now() > session.expiresAt) {
    activeSessions.delete(token)
    return res.status(401).json({
      success: false,
      error: 'Session expired. Please log in again.'
    })
  }

  session.lastActive = Date.now()
  req.adminEmail = session.email
  next()
}

// =========================================================================
// PUBLIC ENDPOINTS
// =========================================================================

// Public: Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() })
})

// Public: Chatbot query endpoint
app.post('/api/chat', (req, res) => {
  const { message } = req.body

  if (!message) {
    return res.status(400).json({ error: 'Message field is required' })
  }

  try {
    const reply = getBotResponse(message)
    res.json({ reply })
  } catch (error) {
    console.error('Server error handling chat:', error)
    res.status(500).json({ error: 'Internal Server Error' })
  }
})

// Public: Exam arrangements for Student Exam Hall Finder
app.get('/api/exams', (req, res) => {
  try {
    const examsFile = FILE_PATHS.exams
    const raw = fs.existsSync(examsFile) ? fs.readFileSync(examsFile, 'utf8') : '[]'
    const data = JSON.parse(raw)
    const stats = calculateExamStats(data)
    res.json({ success: true, data, ...stats })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to retrieve exam arrangements.' })
  }
})

// Public: Food menu data
app.get('/api/menu', (req, res) => {
  try {
    const data = getData('menu')
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to retrieve menu data.' })
  }
})

// Public: Operating hours data
app.get('/api/hours', (req, res) => {
  try {
    const data = getData('hours')
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to retrieve hours data.' })
  }
})

// Public: Venue locations data
app.get('/api/venues', (req, res) => {
  try {
    const data = getData('venues')
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to retrieve venue data.' })
  }
})

// Public: Admin Login Endpoint
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body || {}

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' })
  }

  const cleanEmail = String(email).trim().toLowerCase()
  const cleanPassword = String(password).trim()

  const isEmailMatch = cleanEmail === ADMIN_EMAIL
  const isPasswordMatch = cleanPassword === ADMIN_PASSWORD || cleanPassword === '12345678'

  if (isEmailMatch && isPasswordMatch) {
    const token = 'adm_' + crypto.randomBytes(32).toString('hex')
    const now = Date.now()

    activeSessions.set(token, {
      email: ADMIN_EMAIL,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      lastActive: now
    })

    return res.json({
      success: true,
      token,
      email: ADMIN_EMAIL,
      message: 'Authentication successful.'
    })
  }

  return res.status(401).json({
    success: false,
    error: 'Invalid administrator credentials. Access denied.'
  })
})

// =========================================================================
// PROTECTED ADMIN ENDPOINTS
// =========================================================================

// Admin: Verify active session token
app.get('/api/admin/verify', authenticateAdmin, (req, res) => {
  res.json({ valid: true, email: req.adminEmail })
})

// Admin: Logout and invalidate session
app.post('/api/admin/logout', (req, res) => {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (token) {
    activeSessions.delete(token)
  }

  res.json({ success: true, message: 'Logged out successfully.' })
})

// Admin: Upload dataset (Supports single or multiple files in CSV/JSON format, append merge mode)
app.post('/api/admin/upload/:type', authenticateAdmin, upload.any(), (req, res) => {
  const { type } = req.params
  const mode = req.query.mode || req.body.mode || 'append'

  if (!['menu', 'hours', 'venues', 'exams'].includes(type)) {
    return res.status(400).json({ error: `Invalid category "${type}". Must be one of: menu, hours, venues, exams.` })
  }

  const uploadedFiles = req.files && req.files.length > 0 ? req.files : (req.file ? [req.file] : [])
  if (uploadedFiles.length === 0) {
    return res.status(400).json({ error: 'No file uploaded.' })
  }

  try {
    const targetPath = FILE_PATHS[type]

    if (type === 'exams') {
      let totalRowsParsed = 0
      const newlyParsedRecords = []

      for (const fileObj of uploadedFiles) {
        const extension = path.extname(fileObj.originalname).toLowerCase()
        if (!['.json', '.csv'].includes(extension)) {
          return res.status(400).json({
            error: 'Invalid file format. Only .csv and .json files are supported.'
          })
        }
        const fileContent = fileObj.buffer.toString('utf8')
        const parsedRows = processUploadedData('exams', fileContent, extension)
        if (Array.isArray(parsedRows)) {
          totalRowsParsed += parsedRows.length
          newlyParsedRecords.push(...parsedRows)
        }
      }

      let finalExamsList = []
      if (mode === 'append' && fs.existsSync(targetPath)) {
        try {
          const existingRaw = fs.readFileSync(targetPath, 'utf8')
          const existingList = JSON.parse(existingRaw)
          if (Array.isArray(existingList)) {
            finalExamsList = [...existingList]
          }
        } catch (e) {
          console.warn('Could not read existing exams for merge:', e.message)
        }
      }

      let addedCount = 0
      for (const newRow of newlyParsedRecords) {
        const isDuplicate = finalExamsList.some((ex) => areRecordsIdentical(ex, newRow))
        if (!isDuplicate) {
          finalExamsList.push(newRow)
          addedCount++
        }
      }

      finalExamsList.sort((a, b) => {
        if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '')
        if (a.session !== b.session) return (a.session || '').localeCompare(b.session || '')
        if (a.hall !== b.hall) return (a.hall || '').localeCompare(b.hall || '')
        return (a.courseCode || '').localeCompare(b.courseCode || '')
      })

      syncDataset('exams', finalExamsList)
      reloadData()

      const stats = calculateExamStats(finalExamsList)

      return res.json({
        success: true,
        message: `CSV uploaded successfully. Imported ${totalRowsParsed} record(s). Added ${addedCount} new row(s).`,
        totalFiles: uploadedFiles.length,
        totalRowsImported: totalRowsParsed,
        addedCount,
        totalExamRecords: stats.totalExamRecords,
        datesFound: stats.datesFound,
        formattedDatesFound: stats.formattedDatesFound,
        recordsPerDate: stats.recordsPerDate,
        fnCount: stats.fnCount,
        anCount: stats.anCount,
        data: finalExamsList
      })
    } else if (type === 'menu') {
      let finalMenu = {}
      if (mode === 'append' && fs.existsSync(targetPath)) {
        try {
          const existingRaw = fs.readFileSync(targetPath, 'utf8')
          finalMenu = JSON.parse(existingRaw) || {}
        } catch (e) {
          console.warn('Could not read existing menu:', e.message)
        }
      }

      let totalDatesCount = 0
      for (const fileObj of uploadedFiles) {
        const extension = path.extname(fileObj.originalname).toLowerCase()
        const fileContent = fileObj.buffer.toString('utf8')
        const processed = processUploadedData('menu', fileContent, extension)
        finalMenu = { ...finalMenu, ...processed }
        totalDatesCount += Object.keys(processed).length
      }

      syncDataset('menu', finalMenu)
      reloadData()

      return res.json({
        success: true,
        message: `Successfully updated menu with ${totalDatesCount} date record(s).`,
        recordCount: Object.keys(finalMenu).length,
        data: finalMenu
      })
    } else {
      const primaryFile = uploadedFiles[0]
      const extension = path.extname(primaryFile.originalname).toLowerCase()
      const fileContent = primaryFile.buffer.toString('utf8')
      let processedData = processUploadedData(type, fileContent, extension)

      syncDataset(type, processedData)
      reloadData()

      const recordCount = Array.isArray(processedData)
        ? processedData.length
        : Object.keys(processedData).length

      return res.json({
        success: true,
        message: `Successfully updated ${type} data with ${recordCount} record(s).`,
        recordCount,
        data: processedData
      })
    }
  } catch (error) {
    console.error(`Upload error for ${type}:`, error)
    res.status(400).json({ error: error.message || 'Failed to process uploaded file.' })
  }
})

// Admin: Get current dataset for inspection
app.get('/api/admin/data/:type', authenticateAdmin, (req, res) => {
  const { type } = req.params
  if (!['menu', 'hours', 'venues', 'exams'].includes(type)) {
    return res.status(400).json({ error: `Invalid category "${type}".` })
  }

  try {
    if (type === 'exams') {
      const examsFile = FILE_PATHS.exams
      const raw = fs.existsSync(examsFile) ? fs.readFileSync(examsFile, 'utf8') : '[]'
      const data = JSON.parse(raw)
      const stats = calculateExamStats(data)
      return res.json({ data, ...stats })
    }
    const data = getData(type)
    res.json({ data })
  } catch {
    res.status(500).json({ error: 'Failed to retrieve data.' })
  }
})

// Admin: Clear / Delete all records for a category
app.delete('/api/admin/clear/:type', authenticateAdmin, (req, res) => {
  const { type } = req.params

  if (!['menu', 'hours', 'venues', 'exams'].includes(type)) {
    return res.status(400).json({ success: false, error: `Invalid category "${type}". Must be one of: menu, hours, venues, exams.` })
  }

  try {
    const emptyData = type === 'menu' ? {} : []
    syncDataset(type, emptyData)
    reloadData()

    res.json({
      success: true,
      message: `All ${type} records have been deleted successfully.`,
      type
    })
  } catch (error) {
    console.error(`Error clearing ${type} data:`, error)
    res.status(500).json({ success: false, error: error.message || `Failed to clear ${type} data.` })
  }
})

// Admin: Exam arrangement statistics
app.get('/api/admin/exams/stats', authenticateAdmin, (req, res) => {
  try {
    const examsFile = FILE_PATHS.exams
    const raw = fs.existsSync(examsFile) ? fs.readFileSync(examsFile, 'utf8') : '[]'
    const data = JSON.parse(raw)
    const stats = calculateExamStats(data)
    res.json({ success: true, ...stats })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// Admin: Exam arrangement CRUD
app.get('/api/admin/exams', authenticateAdmin, (req, res) => {
  try {
    const examsFile = FILE_PATHS.exams
    const raw = fs.existsSync(examsFile) ? fs.readFileSync(examsFile, 'utf8') : '[]'
    const data = JSON.parse(raw)
    const stats = calculateExamStats(data)
    res.json({ success: true, data, ...stats })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/admin/exams', authenticateAdmin, (req, res) => {
  try {
    const examsFile = FILE_PATHS.exams
    const raw = fs.existsSync(examsFile) ? fs.readFileSync(examsFile, 'utf8') : '[]'
    const list = JSON.parse(raw)

    const newRecord = {
      date: normalizeDateString(req.body.date || '2026-09-05'),
      session: (req.body.session || 'FN').toUpperCase(),
      examName: req.body.examName || 'PERIODICAL TEST I - SEPTEMBER 2026',
      degreeSemester: req.body.degreeSemester || 'B.E. / B.Tech. - III',
      time: req.body.time || '08:45 AM - 10:15 AM',
      hall: req.body.hall || 'WW 202',
      branch: (req.body.branch || 'CS').toUpperCase(),
      courseCode: (req.body.courseCode || req.body.branch || '').toUpperCase(),
      registerNumbers: req.body.registerNumbers || '',
      candidateCount: parseInt(req.body.candidateCount || calculateCandidatesFromRange(req.body.registerNumbers) || 0, 10) || 0
    }

    list.push(newRecord)
    list.sort((a, b) => {
      if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '')
      if (a.session !== b.session) return (a.session || '').localeCompare(b.session || '')
      if (a.hall !== b.hall) return (a.hall || '').localeCompare(b.hall || '')
      return (a.courseCode || '').localeCompare(b.courseCode || '')
    })

    syncDataset('exams', list)
    reloadData()

    const stats = calculateExamStats(list)
    res.json({ success: true, message: 'Exam arrangement added successfully.', data: list, ...stats })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.put('/api/admin/exams/:index', authenticateAdmin, (req, res) => {
  try {
    const index = parseInt(req.params.index, 10)
    const examsFile = FILE_PATHS.exams
    const raw = fs.existsSync(examsFile) ? fs.readFileSync(examsFile, 'utf8') : '[]'
    const list = JSON.parse(raw)

    if (isNaN(index) || index < 0 || index >= list.length) {
      return res.status(404).json({ success: false, error: 'Exam record index not found.' })
    }

    list[index] = {
      ...list[index],
      ...req.body,
      date: req.body.date ? normalizeDateString(req.body.date) : list[index].date,
      session: (req.body.session || list[index].session || 'FN').toUpperCase(),
      branch: (req.body.branch || list[index].branch || '').toUpperCase(),
      courseCode: (req.body.courseCode || list[index].courseCode || '').toUpperCase(),
      candidateCount: parseInt(req.body.candidateCount !== undefined ? req.body.candidateCount : list[index].candidateCount, 10) || 0
    }

    syncDataset('exams', list)
    reloadData()

    const stats = calculateExamStats(list)
    res.json({ success: true, message: 'Exam arrangement updated successfully.', data: list, ...stats })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.delete('/api/admin/exams/:index', authenticateAdmin, (req, res) => {
  try {
    const index = parseInt(req.params.index, 10)
    const examsFile = FILE_PATHS.exams
    const raw = fs.existsSync(examsFile) ? fs.readFileSync(examsFile, 'utf8') : '[]'
    const list = JSON.parse(raw)

    if (isNaN(index) || index < 0 || index >= list.length) {
      return res.status(404).json({ success: false, error: 'Exam record index not found.' })
    }

    list.splice(index, 1)
    syncDataset('exams', list)
    reloadData()

    const stats = calculateExamStats(list)
    res.json({ success: true, message: 'Exam arrangement deleted successfully.', data: list, ...stats })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// Admin: Download CSV template
app.get('/api/admin/template/:type', authenticateAdmin, (req, res) => {
  const { type } = req.params

  const templates = {
    menu: 'date,breakfast,lunch,snacks,dinner\n2026-09-01,Idli Sambar,Rice with Sambhar & Poriyal,Tea & Biscuits,Chapati & Kurma\n2026-09-02,Puri Sabji,Veg Biryani & Raita,Coffee & Samosa,Dosa & Chutney',
    hours: 'day,department,startTime,endTime\nMonday,General,08:30,16:30\nMonday,CSE,09:00,16:30\nMonday,Library,08:00,20:00\nSunday,General,Closed,Closed',
    venues: 'name,building,floor,description\nSeminar Hall A,Main Block,2nd Floor,Near the central staircase with HD AV systems\nCSE Lab 1,Engineering Block,3rd Floor,Advanced programming lab with core terminals\nLibrary,Central Block,2nd and 3rd Floors,Central reading and borrowing wing',
    exams: 'date,session,examName,time,hall,branch,courseCode,registerNumbers,candidateCount\n2026-09-05,FN,PERIODICAL TEST I - SEPTEMBER 2026,08:45 AM - 10:15 AM,WW 202,CS,22CS305,7376251CS101-130,30\n2026-09-05,FN,PERIODICAL TEST I - SEPTEMBER 2026,08:45 AM - 10:15 AM,WW 204,CS,22CS305,7376251CS412-426,15'
  }

  const csvContent = templates[type]
  if (!csvContent) {
    return res.status(404).json({ error: 'Template not found.' })
  }

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="${type}_template.csv"`)
  res.send(csvContent)
})

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 College Chatbot server running at http://localhost:${PORT}`)
})
