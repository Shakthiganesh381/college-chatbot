import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { normalizeAndCorrectText } from './utils/textCorrection.js'

// Resolve dirname in ES module environment
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// File paths
const MENU_FILE = path.resolve(__dirname, '../data/menu.json')
const HOURS_FILE = path.resolve(__dirname, '../data/hours.json')
const VENUES_FILE = path.resolve(__dirname, '../data/venues.json')
const EXAMS_FILE = path.resolve(__dirname, '../data/exams.json')

// In-memory data store
let menuData = {}
let hoursData = []
let venuesData = []
let examsData = []

// Standard JSON reader with safe fallback
const readJSON = (filePath, fallback = {}) => {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const rawData = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(rawData)
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message)
    return fallback
  }
}

// Function to reload all data from disk into memory
export const reloadData = () => {
  menuData = readJSON(MENU_FILE, {})
  hoursData = readJSON(HOURS_FILE, [])
  venuesData = readJSON(VENUES_FILE, [])
  examsData = readJSON(EXAMS_FILE, [])
  console.log('✅ Chatbot data store refreshed successfully')
}

// Function to fetch in-memory data for admin inspection
export const getData = (type) => {
  switch (type) {
    case 'menu':
      return menuData
    case 'hours':
      return hoursData
    case 'venues':
      return venuesData
    case 'exams':
      return examsData
    default:
      return null
  }
}

// Initial load
reloadData()

// Helper to format Date into YYYY-MM-DD using Asia/Kolkata (India) timezone
const getLocalDateString = (date = new Date()) => {
  const options = {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }
  // 'en-CA' locale outputs YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', options).format(date)
}

// Helper to get day name (e.g. "Monday")
const getLocalDayName = (date = new Date()) => {
  return date.toLocaleDateString('en-US', { weekday: 'long' })
}// Helper to parse query and extract menu details
const parseMenuQuery = (query) => {
  const text = query.toLowerCase()
  
  let meal = null
  if (/\bbreakfast\b/.test(text)) meal = 'breakfast'
  else if (/\blunch\b/.test(text)) meal = 'lunch'
  else if (/\bsnacks?\b/.test(text)) meal = 'snacks'
  else if (/\b(dinner|supper)\b/.test(text)) meal = 'dinner'

  let dateStr = null
  const baseDate = new Date()

  if (/\btomorrow\b/.test(text)) {
    const target = new Date(baseDate)
    target.setDate(baseDate.getDate() + 1)
    dateStr = getLocalDateString(target)
  } else if (/\byesterday\b/.test(text)) {
    const target = new Date(baseDate)
    target.setDate(baseDate.getDate() - 1)
    dateStr = getLocalDateString(target)
  } else if (/\b(today|tonight)\b/.test(text)) {
    dateStr = getLocalDateString(baseDate)
  } else {
    // Specific date parsing (e.g. "September 5" or "5th September" or "2026-08-30")
    const months = {
      jan: '01', january: '01',
      feb: '02', february: '02',
      mar: '03', march: '03',
      apr: '04', april: '04',
      may: '05',
      jun: '06', june: '06',
      jul: '07', july: '07',
      aug: '08', august: '08',
      sep: '09', sept: '09', september: '09',
      oct: '10', october: '10',
      nov: '11', november: '11',
      dec: '12', december: '12'
    }

    for (const [name, num] of Object.entries(months)) {
      const regex = new RegExp(`\\b(${name})\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b|\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s*)?(${name})\\b`)
      const match = text.match(regex)
      if (match) {
        const dayNum = match[2] || match[3]
        const dayStr = String(dayNum).padStart(2, '0')
        const currentYear = baseDate.getFullYear()
        dateStr = `${currentYear}-${num}-${dayStr}`
        break
      }
    }
    
    const dateMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
    if (dateMatch) {
      dateStr = dateMatch[0]
    }
  }

  if (!dateStr && meal) {
    dateStr = getLocalDateString(baseDate)
  }

  const isMenuQuestion = /\b(menu|food|eat|eating|having|dish|dishes)\b/.test(text) || meal !== null

  return { meal, dateStr, isMenuQuestion }
}

const getMenuReply = (query) => {
  const { meal, dateStr, isMenuQuestion } = parseMenuQuery(query)
  
  if (!isMenuQuestion && !meal) {
    return null
  }

  const targetDateStr = dateStr || getLocalDateString(new Date())
  const dayMenu = menuData[targetDateStr]

  if (!dayMenu) {
    // Check if we have available dates to suggest
    const availableDates = Object.keys(menuData).sort()
    if (availableDates.length > 0) {
      return `Sorry, I don't have menu information for **${targetDateStr}**. Available dates in the system are: ${availableDates.map(d => `\`${d}\``).join(', ')}.`
    }
    return `Sorry, I don't have menu information for that date.`
  }

  const formattedDate = new Date(targetDateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })

  const todayStr = getLocalDateString(new Date())
  const tomorrowStr = getLocalDateString(new Date(Date.now() + 86400000))
  const yesterdayStr = getLocalDateString(new Date(Date.now() - 86400000))
  
  let relativeLabel = ''
  if (targetDateStr === todayStr) relativeLabel = "today's "
  else if (targetDateStr === tomorrowStr) relativeLabel = "tomorrow's "
  else if (targetDateStr === yesterdayStr) relativeLabel = "yesterday's "

  if (meal) {
    const mealVal = dayMenu[meal]
    if (!mealVal) {
      return `Sorry, I don't have menu information for ${meal} on ${formattedDate}.`
    }
    const mealName = meal.charAt(0).toUpperCase() + meal.slice(1)
    if (relativeLabel) {
      return `${mealName} for ${relativeLabel}(${targetDateStr}) is **${mealVal}**.`
    }
    return `For ${meal} on ${formattedDate}, we are serving **${mealVal}**.`
  } else {
    const label = relativeLabel ? `for ${relativeLabel}(${targetDateStr})` : `on ${formattedDate}`
    return `Here is the menu ${label}:
• **Breakfast**: ${dayMenu.breakfast || 'N/A'}
• **Lunch**: ${dayMenu.lunch || 'N/A'}
• **Snacks**: ${dayMenu.snacks || 'N/A'}
• **Dinner**: ${dayMenu.dinner || 'N/A'}`
  }
}

// Helper to parse query and extract college hours details
const parseHoursQuery = (query) => {
  const text = query.toLowerCase()
  
  const isHoursQuery = /\b(hours|open|opening|close|closed|closing|start|starts|end|ends|time|times|working|schedule|timing)\b/.test(text)
                       
  if (!isHoursQuery) return null

  // Extract department
  let department = 'General'
  if (/\b(cse|computer\s+science)\b/.test(text)) {
    department = 'CSE'
  } else if (/\b(library|lib)\b/.test(text)) {
    department = 'Library'
  } else {
    const depts = ['ece', 'eee', 'mech', 'civil', 'admin']
    for (const d of depts) {
      const reg = new RegExp(`\\b${d}\\b`)
      if (reg.test(text)) {
        department = d.toUpperCase()
        break
      }
    }
  }

  // Determine requested day
  let dayName = null
  const baseDate = new Date()

  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  for (const day of daysOfWeek) {
    const reg = new RegExp(`\\b${day}\\b`)
    if (reg.test(text)) {
      dayName = day.charAt(0).toUpperCase() + day.slice(1)
      break
    }
  }

  if (!dayName) {
    if (/\btomorrow\b/.test(text)) {
      const target = new Date(baseDate)
      target.setDate(baseDate.getDate() + 1)
      dayName = getLocalDayName(target)
    } else if (/\byesterday\b/.test(text)) {
      const target = new Date(baseDate)
      target.setDate(baseDate.getDate() - 1)
      dayName = getLocalDayName(target)
    } else {
      dayName = getLocalDayName(baseDate)
    }
  }

  return { department, dayName }
}

const getHoursReply = (query) => {
  const parsed = parseHoursQuery(query)
  if (!parsed) return null

  const { department, dayName } = parsed

  const record = hoursData.find(
    (item) => item.day.toLowerCase() === dayName.toLowerCase() && 
              item.department.toLowerCase() === department.toLowerCase()
  )

  if (!record) {
    // If specific department is not found for that day, fallback to General or mention
    const anyRecord = hoursData.find(item => item.day.toLowerCase() === dayName.toLowerCase() && item.department.toLowerCase() === 'general')
    if (anyRecord) {
      return `I couldn't find specific hours for the **${department}** department on **${dayName}**, but general college hours are **${anyRecord.startTime} to ${anyRecord.endTime}**.`
    }
    return `Sorry, I don't have operating hours information for ${department} on ${dayName}.`
  }

  if (record.startTime.toLowerCase() === 'closed' || record.endTime.toLowerCase() === 'closed') {
    return `On **${dayName}**, the **${department}** department is **Closed**.`
  }

  if (department === 'General') {
    return `College hours for **${dayName}** are **${record.startTime} to ${record.endTime}**.`
  }

  return `The **${department}** hours for **${dayName}** are **${record.startTime} to ${record.endTime}**.`
}

// Helper to parse query and extract venue details
const parseVenueQuery = (query) => {
  const text = query.toLowerCase()
  
  const isVenueQuery = /\b(where|location|building|floor|find|locate|room|lab|hall|auditorium|library)\b/.test(text)
                       
  if (!isVenueQuery) return null

  // Scan our venues database for exact or substring match
  let foundVenue = null
  for (const venue of venuesData) {
    const venueNameLower = venue.name.toLowerCase()
    if (text.includes(venueNameLower)) {
      foundVenue = venue
      break
    }
  }

  // Fallback regex/keyword matches for common venue patterns
  if (!foundVenue) {
    if (/\bauditorium\b/.test(text)) {
      foundVenue = venuesData.find(v => v.name.toLowerCase().includes('auditorium'))
    } else if (/\b(library|lib)\b/.test(text)) {
      foundVenue = venuesData.find(v => v.name.toLowerCase().includes('library'))
    } else if (/\bseminar\s+hall\s+a\b/.test(text) || /\bhall\s+a\b/.test(text)) {
      foundVenue = venuesData.find(v => v.name.toLowerCase().includes('seminar hall a'))
    } else if (/\bseminar\s+hall\s+b\b/.test(text) || /\bhall\s+b\b/.test(text)) {
      foundVenue = venuesData.find(v => v.name.toLowerCase().includes('seminar hall b'))
    } else if (/\blab\s+1\b/.test(text)) {
      foundVenue = venuesData.find(v => v.name.toLowerCase() === 'lab 1')
    } else if (/\b(cse\s+lab|programming\s+lab)\b/.test(text)) {
      foundVenue = venuesData.find(v => v.name.toLowerCase().includes('cse lab'))
    } else if (/\broom\s+101\b/.test(text) || /\b101\b/.test(text)) {
      foundVenue = venuesData.find(v => v.name.toLowerCase().includes('101'))
    }
  }

  return foundVenue
}

const getVenueReply = (query) => {
  const isVenueQ = query.toLowerCase().includes('where') || 
                    query.toLowerCase().includes('location') || 
                    query.toLowerCase().includes('building') || 
                    query.toLowerCase().includes('floor') || 
                    query.toLowerCase().includes('find') ||
                    query.toLowerCase().includes('room') ||
                    query.toLowerCase().includes('lab') ||
                    query.toLowerCase().includes('hall') ||
                    query.toLowerCase().includes('auditorium') ||
                    query.toLowerCase().includes('library') ||
                    query.toLowerCase().includes('locate')

  if (!isVenueQ) return null

  const venue = parseVenueQuery(query)
  if (!venue) {
    const venueList = venuesData.map(v => v.name).join(', ')
    return `Sorry, I don't have information about that venue. Registered venues include: ${venueList || 'None yet'}.`
  }

  return `🏛️ **${venue.name}** is located in the **${venue.building}** on the **${venue.floor}**.

_${venue.description}_`
}

// Helper: Check if a register number is inside a range string
function isRegNumberInRange(targetReg, rangeStr) {
  if (!targetReg || !rangeStr) return false
  const target = targetReg.trim().toUpperCase()
  const targetMatch = target.match(/^(.*?)(\d+)$/)
  if (!targetMatch) return target === rangeStr.trim().toUpperCase()

  const targetPrefix = targetMatch[1]
  const targetNum = parseInt(targetMatch[2], 10)

  const subRanges = rangeStr.split(',').map((s) => s.trim()).filter(Boolean)
  for (const sub of subRanges) {
    const cleanSub = sub.toUpperCase()
    if (!cleanSub.includes('-')) {
      if (cleanSub === target) return true
      continue
    }
    const [startRaw, endRaw] = cleanSub.split('-').map((s) => s.trim())
    const startMatch = startRaw.match(/^(.*?)(\d+)$/)
    if (!startMatch || startMatch[1] !== targetPrefix) continue

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
      if (endMatch && endMatch[1] === targetPrefix) {
        endNum = parseInt(endMatch[2], 10)
      }
    }

    if (endNum !== null && targetNum >= startNum && targetNum <= endNum) {
      return true
    }
  }
  return false
}

// Helper to parse query and extract exam hall details
const getExamReply = (query) => {
  const text = query.trim().toUpperCase()

  // Match register number pattern (e.g. 7376251CS101, 7376252AG105, 22CS101, etc.)
  const regMatch = text.match(/\b([0-9]{5,8}[A-Z]{2,4}[0-9]{2,4})\b/i) || text.match(/\b([0-9]{2}[A-Z]{2,4}[0-9]{2,4})\b/i)

  const isExamIntent =
    /\b(EXAM|EXAMS|HALL|HALLS|SEAT|SEATING|TEST|ARRANGEMENT|ROOM)\b/i.test(query) || Boolean(regMatch)

  if (!isExamIntent && !regMatch) return null

  if (regMatch) {
    const studentReg = regMatch[1].toUpperCase()

    // Search across ALL exam records in the complete merged array
    const matchingExams = examsData.filter((exam) => isRegNumberInRange(studentReg, exam.registerNumbers))

    if (matchingExams.length > 0) {
      if (matchingExams.length === 1) {
        const exam = matchingExams[0]
        return `🏫 **Exam Hall Found for ${studentReg}**:
• **Assigned Hall**: **${exam.hall}**
• **Examination**: ${exam.examName}
• **Date & Session**: ${exam.date} (${exam.session})
• **Timing**: ${exam.time}
• **Branch & Course**: ${exam.branch} (${exam.courseCode})
• **Allocated Range**: \`${exam.registerNumbers}\`
• **Total Candidates in Hall**: ${exam.candidateCount}

_You can also view the interactive visual seating layout in the **Exam Hall Finder** tab._`
      }

      // If multiple matching exams across dates or sessions
      const listStr = matchingExams
        .map(
          (ex, i) =>
            `**${i + 1}. Date ${ex.date} (${ex.session})**\n• **Hall**: **${ex.hall}** | **Time**: ${ex.time}\n• **Course**: ${ex.branch} (${ex.courseCode}) | **Exam**: ${ex.examName}`
        )
        .join('\n\n')

      return `🏫 **Exam Schedule Found for ${studentReg}** (${matchingExams.length} arrangements found):\n\n${listStr}\n\n_Visit the **Exam Hall Finder** tab to view your visual seating layout._`
    }

    return `I searched across all ${examsData.length} loaded exam records for register number **${studentReg}**, but couldn't find an assigned hall. Please verify your register number or check the **Exam Hall Finder** tab.`
  }

  // Check for today's exam query
  const todayStr = getLocalDateString(new Date())
  const isTodayExamQuery =
    /\b(today|todays|current)\b/i.test(query) &&
    /\b(exam|exams|hall|halls|test|seating)\b/i.test(query)

  if (isTodayExamQuery) {
    const todayExams = examsData.filter((e) => e.date === todayStr)
    if (todayExams.length === 0) {
      const distinctDates = Array.from(new Set(examsData.map((e) => e.date))).sort()
      const datesText =
        distinctDates.length > 0
          ? ` Scheduled exam dates available in the system are: **${distinctDates.join(', ')}**.`
          : ''
      return `No exam hall arrangement is available for today (${todayStr}).${datesText}`
    }

    const hallsList = Array.from(new Set(todayExams.map((e) => e.hall))).join(', ')
    return `🏫 **Today's Exams (${todayStr})**:
• Total arrangements scheduled today: **${todayExams.length}**
• Exam Halls in use: **${hallsList}**

To find your exact hall, please enter your **Register Number** (e.g. \`7376251CS101\`) or open the **Exam Hall Finder** tab.`
  }

  if (/\b(exam|exams|test|periodical|hall|seating)\b/i.test(query)) {
    if (examsData.length === 0) {
      return `No exam hall arrangements are currently loaded in the system.`
    }
    const distinctDates = Array.from(new Set(examsData.map((e) => e.date))).sort()
    return `Exam hall arrangements are available for date(s): **${distinctDates.join(', ')}** (Total: ${examsData.length} records).
To find your specific hall, please provide your **Register Number** (e.g. "Where is my hall for 7376251CS101?") or visit the **Exam Hall Finder** tab.`
  }

  return null
}

/**
 * Main response dispatcher.
 * Resolves the query against Menu, Hours, Venues, and Exams.
 */
export const getBotResponse = (query) => {
  if (!query || !query.trim()) return "Please ask me something!"

  const rawQuery = query.trim()
  // Normalize whitespace, capitalization, and fix spelling mistakes on keywords
  const normalizedQuery = normalizeAndCorrectText(rawQuery)

  // 1. Try Exam Hall lookup
  let reply = getExamReply(rawQuery)
  if (reply) return reply

  // 2. Try Menu lookup
  reply = getMenuReply(normalizedQuery)
  if (reply) return reply

  // 3. Try Hours lookup
  reply = getHoursReply(normalizedQuery)
  if (reply) return reply

  // 4. Try Venue lookup
  reply = getVenueReply(normalizedQuery)
  if (reply) return reply

  // 5. Default Fallback
  return `I received your question: "${rawQuery}". Right now, I can help you with:
• **Exam Hall Finder** (e.g. "Where is my exam hall for 7376251CS101?", "Find seat for 7376252AG105")
• **Food menu** (e.g. "What's today's lunch?", "What's for breakfast tomorrow?")
• **College hours** (e.g. "What time does the CSE department open on Monday?", "Is the library open on Saturday?")
• **Venue locations** (e.g. "Where is Seminar Hall A?", "Find CSE Lab 1")`
}


