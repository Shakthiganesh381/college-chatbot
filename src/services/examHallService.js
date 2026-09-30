/**
 * examHallService.js
 * 
 * Service module for Exam Hall Finder.
 * Handles Indian timezone date calculations, session filtering (FN/AN),
 * and exam arrangement querying outside React UI components.
 */

import examData from '../data/exams.json' with { type: 'json' }

/**
 * Returns today's date formatted as YYYY-MM-DD in Asia/Kolkata (India) timezone.
 * Dynamic and never hardcoded.
 */
export function getTodayDateStringIndia(customDate = new Date()) {
  const options = {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }
  // 'en-CA' locale produces standard ISO format: YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', options).format(customDate)
}

/**
 * Formats a YYYY-MM-DD date string into human readable format (e.g. "05 September 2026").
 */
export function formatDisplayDate(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr

  const dateObj = new Date(`${dateStr}T12:00:00+05:30`)
  return dateObj.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata'
  })
}

/**
 * Retrieves all stored exam arrangements.
 */
export function getAllExams() {
  return Array.isArray(examData) ? examData : []
}

/**
 * Retrieves all exam arrangements scheduled for today (Asia/Kolkata date).
 * 
 * @param {Array} examsList - Optional list of exam objects (defaults to all exams)
 * @param {string} customTodayDate - Optional date string (YYYY-MM-DD) for testing
 * @returns {Array} Array of exam arrangements for today
 */
export function getTodayExams(examsList = getAllExams(), customTodayDate = null) {
  const todayStr = customTodayDate || getTodayDateStringIndia()
  return examsList.filter((item) => item.date === todayStr)
}

/**
 * Checks if there is any exam arrangement scheduled for today.
 */
export function hasExamToday(examsList = getAllExams(), customTodayDate = null) {
  const todayExams = getTodayExams(examsList, customTodayDate)
  return todayExams.length > 0
}

/**
 * Finds the next upcoming exam date strictly in the future relative to today's date.
 * Returns null if no future exam exists.
 * 
 * @param {Array} examsList 
 * @param {string} customTodayDate 
 * @returns {string|null} YYYY-MM-DD of the next upcoming exam date
 */
export function getNextScheduledExamDate(examsList = getAllExams(), customTodayDate = null) {
  const todayStr = customTodayDate || getTodayDateStringIndia()

  const futureDates = examsList
    .map((item) => item.date)
    .filter((d) => d > todayStr)
    .sort()

  return futureDates.length > 0 ? futureDates[0] : null
}

/**
 * Normalizes date strings to standard YYYY-MM-DD format (Indian format DD/MM/YYYY).
 * Examples:
 * 01/09/2026 -> 2026-09-01
 * 1/09/2026 -> 2026-09-01
 * 01-09-2026 -> 2026-09-01
 * 2026-09-01 -> 2026-09-01
 */
export function normalizeDateString(rawDate) {
  if (!rawDate) return ''
  const clean = String(rawDate).trim()

  // 1. Strict ISO Match: YYYY-MM-DD
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
  const dmyShort = clean.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2})$/)
  if (dmyShort) {
    const d = String(dmyShort[1]).padStart(2, '0')
    const m = String(dmyShort[2]).padStart(2, '0')
    const y = `20${dmyShort[3]}`
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

  // 5. Embedded Indian Date Match
  const embeddedDmy = clean.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/)
  if (embeddedDmy) {
    const d = String(embeddedDmy[1]).padStart(2, '0')
    const m = String(embeddedDmy[2]).padStart(2, '0')
    const y = embeddedDmy[3]
    return `${y}-${m}-${d}`
  }

  return clean
}

/**
 * Returns all records matching a specific date.
 */
export function getExamsByDate(dateStr, examsList = getAllExams()) {
  if (!dateStr) return []
  const normDate = normalizeDateString(dateStr)
  return examsList.filter((item) => item.date === normDate)
}

/**
 * Filters exam arrangements for a specific date and session (FN, AN, or ALL).
 * 
 * @param {string} dateStr - Target date (e.g. "2026-09-01" or "01/09/2026")
 * @param {string} session - 'FN' (Forenoon), 'AN' (Afternoon), or 'ALL'
 * @param {Array} examsList - List of exam objects
 * @returns {Array} Array of all matched exam arrangements
 */
export function getExamsByDateAndSession(dateStr, session, examsList = getAllExams()) {
  if (!dateStr) return []

  const targetDate = normalizeDateString(dateStr)
  const targetSession = (session || 'ALL').trim().toUpperCase()

  if (targetSession === 'ALL') {
    return examsList.filter((item) => item.date === targetDate)
  }

  return examsList.filter(
    (item) => item.date === targetDate && item.session.toUpperCase() === targetSession
  )
}

/**
 * Computes data integrity metrics on exams array
 */
export function calculateExamStats(examsList) {
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

  return {
    totalExamRecords: list.length,
    datesFound: distinctDates,
    recordsPerDate,
    fnCount,
    anCount
  }
}

/**
 * Checks if a specific session (FN or AN) exists for a given date.
 */
/**
 * Normalizes a user-entered register number:
 * - Trims leading and trailing whitespace
 * - Removes internal spaces
 * - Converts to uppercase
 * Example: "  7376251cs101  " -> "7376251CS101"
 * 
 * @param {string} raw - Raw register number input
 * @returns {string} Normalized register number
 */
export function normalizeRegisterNumber(raw) {
  if (!raw || typeof raw !== 'string') return ''
  return raw.trim().replace(/\s+/g, '').toUpperCase()
}

/**
 * Parses a single register number into prefix and integer suffix.
 * Example: "7376251CS101" -> { prefix: "7376251CS", num: 101, numStr: "101" }
 */
export function splitRegisterNumber(regStr) {
  const clean = normalizeRegisterNumber(regStr)
  // Extract trailing digits
  const match = clean.match(/^(.*?)(\d+)$/)
  if (!match) {
    return { prefix: clean, num: null, numStr: '' }
  }
  return {
    prefix: match[1],
    num: parseInt(match[2], 10),
    numStr: match[2]
  }
}

/**
 * Checks whether a normalized register number falls within a specific range string.
 * Supports:
 * - Single register number: "7376251CS101"
 * - Simple range: "7376251CS101-130" or "7376251CS101-7376251CS130"
 * - Comma-separated compound ranges: "7376252BT166-189, 7376252BT191-196"
 * 
 * @param {string} targetRegNumber - Target register number (e.g. "7376251CS101")
 * @param {string} rangeString - Range string from exam database
 * @returns {boolean} True if target register number is within range
 */
export function isRegisterNumberInRange(targetRegNumber, rangeString) {
  if (!targetRegNumber || !rangeString) return false

  const target = normalizeRegisterNumber(targetRegNumber)
  const targetParsed = splitRegisterNumber(target)
  if (targetParsed.num === null) {
    // If no digits, fallback to exact string match
    return target === normalizeRegisterNumber(rangeString)
  }

  // Split comma-separated ranges (e.g. "7376252BT166-189, 7376252BT191-196")
  const subRanges = rangeString.split(',').map((s) => s.trim()).filter(Boolean)

  for (const subRange of subRanges) {
    const cleanSub = normalizeRegisterNumber(subRange)

    // Case 1: Simple single register number
    if (!cleanSub.includes('-')) {
      if (cleanSub === target) return true
      continue
    }

    // Case 2: Range with hyphen (e.g. "7376251CS101-130" or "7376251CS101-7376251CS130")
    const [startRaw, endRaw] = cleanSub.split('-').map((s) => s.trim())
    const startParsed = splitRegisterNumber(startRaw)

    if (startParsed.num === null) continue

    // Prefix must match
    if (targetParsed.prefix !== startParsed.prefix) {
      continue
    }

    // Determine end numeric value
    let endNum = null
    if (/^\d+$/.test(endRaw)) {
      // If endRaw is just digits (e.g. "130" or "30")
      if (endRaw.length === startParsed.numStr.length) {
        endNum = parseInt(endRaw, 10)
      } else if (endRaw.length < startParsed.numStr.length) {
        // e.g. start is "101" (3 digits), end is "30" (2 digits) -> "130"
        const prefixDigits = startParsed.numStr.slice(0, -endRaw.length)
        endNum = parseInt(prefixDigits + endRaw, 10)
      } else {
        endNum = parseInt(endRaw, 10)
      }
    } else {
      // Full register number at end (e.g. "7376251CS130")
      const endParsed = splitRegisterNumber(endRaw)
      if (endParsed.prefix === startParsed.prefix && endParsed.num !== null) {
        endNum = endParsed.num
      }
    }

    if (endNum !== null) {
      if (targetParsed.num >= startParsed.num && targetParsed.num <= endNum) {
        return true
      }
    }
  }

  return false
}

/**
 * Searches and finds the exam hall for a student given their register number, date, and session.
 * 
 * @param {Object} params
 * @param {string} params.registerNumber - Student's register number
 * @param {string} params.date - Exam date (YYYY-MM-DD)
 * @param {string} params.session - 'FN' or 'AN'
 * @param {Array} [params.examsList] - Optional custom exams list
 * @returns {Object} Result object with search outcome and hall details
 */
export function findStudentHall({ registerNumber, date, session, examsList = getAllExams() }) {
  const normalizedReg = normalizeRegisterNumber(registerNumber)
  const normalizedDate = normalizeDateString(date || getTodayDateStringIndia())
  const rawSession = (session || 'ALL').trim().toUpperCase()
  const todayStr = getTodayDateStringIndia()

  if (!normalizedReg) {
    return {
      success: false,
      found: false,
      error: 'Please enter a valid register number.'
    }
  }

  // 1. Check if exams exist on this date across the merged array
  const dateExams = examsList.filter((e) => e.date === normalizedDate)
  if (dateExams.length === 0) {
    return {
      success: true,
      found: false,
      noExamOnDate: true,
      message:
        normalizedDate === todayStr
          ? 'No exam hall arrangement is available for today.'
          : `No exam hall arrangement is available for ${formatDisplayDate(normalizedDate)}.`
    }
  }

  // 2. Filter by session if specific session (FN/AN) requested
  const sessionExams =
    rawSession === 'ALL'
      ? dateExams
      : dateExams.filter((e) => e.session.toUpperCase() === rawSession)

  if (sessionExams.length === 0) {
    return {
      success: true,
      found: false,
      noSessionOnDate: true,
      message: `No ${rawSession} exam arrangement is available for ${formatDisplayDate(normalizedDate)}.`
    }
  }

  // 3. Search matching hall among the session exams
  for (const exam of sessionExams) {
    if (isRegisterNumberInRange(normalizedReg, exam.registerNumbers)) {
      return {
        success: true,
        found: true,
        registerNumber: normalizedReg,
        examName: exam.examName,
        degreeSemester: exam.degreeSemester || 'B.E. / B.Tech. - III',
        date: exam.date,
        formattedDate: formatDisplayDate(exam.date),
        session: exam.session,
        time: exam.time,
        hall: exam.hall,
        branch: exam.branch,
        courseCode: exam.courseCode,
        candidateCount: exam.candidateCount,
        registerNumbers: exam.registerNumbers
      }
    }
  }

  // 4. If not found in this date/session, check if student has exam on any other date
  const otherMatches = examsList.filter((e) => isRegisterNumberInRange(normalizedReg, e.registerNumbers))
  let extraHint = ''
  if (otherMatches.length > 0) {
    const otherDates = Array.from(new Set(otherMatches.map((e) => `${formatDisplayDate(e.date)} (${e.session})`))).join(', ')
    extraHint = ` Student has arrangements on: ${otherDates}.`
  }

  return {
    success: true,
    found: false,
    message: `Register number ${normalizedReg} not found in exam hall arrangement for ${formatDisplayDate(normalizedDate)}${rawSession !== 'ALL' ? ` (${rawSession})` : ''}.${extraHint}`
  }
}

/**
 * Generates an ordered list of individual register numbers from a range string.
 * Example: "7376251CS101-105" -> ["7376251CS101", "7376251CS102", "7376251CS103", "7376251CS104", "7376251CS105"]
 * Compound: "7376252BT166-168, 7376252BT191-192" -> ["7376252BT166", "7376252BT167", "7376252BT168", "7376252BT191", "7376252BT192"]
 */
export function generateHallSeatsList(rangeString) {
  if (!rangeString) return []

  const list = []
  const subRanges = rangeString.split(',').map((s) => s.trim()).filter(Boolean)

  for (const subRange of subRanges) {
    const cleanSub = normalizeRegisterNumber(subRange)

    if (!cleanSub.includes('-')) {
      list.push(cleanSub)
      continue
    }

    const [startRaw, endRaw] = cleanSub.split('-').map((s) => s.trim())
    const startParsed = splitRegisterNumber(startRaw)

    if (startParsed.num === null) {
      list.push(cleanSub)
      continue
    }

    let endNum = null
    if (/^\d+$/.test(endRaw)) {
      if (endRaw.length === startParsed.numStr.length) {
        endNum = parseInt(endRaw, 10)
      } else if (endRaw.length < startParsed.numStr.length) {
        const prefixDigits = startParsed.numStr.slice(0, -endRaw.length)
        endNum = parseInt(prefixDigits + endRaw, 10)
      } else {
        endNum = parseInt(endRaw, 10)
      }
    } else {
      const endParsed = splitRegisterNumber(endRaw)
      if (endParsed.prefix === startParsed.prefix && endParsed.num !== null) {
        endNum = endParsed.num
      }
    }

    if (endNum !== null && endNum >= startParsed.num) {
      const digitPadding = startParsed.numStr.length
      for (let i = startParsed.num; i <= endNum; i++) {
        const formattedSuffix = String(i).padStart(digitPadding, '0')
        list.push(`${startParsed.prefix}${formattedSuffix}`)
      }
    } else {
      list.push(startRaw)
    }
  }

  return list
}


