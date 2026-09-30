/**
 * textCorrection.js
 * 
 * Lightweight, spelling-tolerant text normalization utility for College Chatbot.
 * Uses Damerau-Levenshtein distance and intelligent fuzzy keyword matching
 * without hardcoding hundreds of specific typos or changing original data.
 */

// Canonical chatbot keywords categorized for recognition
const KEYWORDS = [
  // Time and relative dates
  'today',
  'tomorrow',
  'yesterday',
  'tonight',

  // Meals and food terms
  'breakfast',
  'lunch',
  'dinner',
  'snacks',
  'snack',
  'supper',
  'menu',
  'food',
  'eat',
  'eating',
  'having',
  'dish',

  // Operating hours terms
  'hours',
  'timing',
  'schedule',
  'working',
  'open',
  'close',
  'start',
  'end',
  'time',

  // Days of week
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',

  // Months
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',

  // Venues and locations
  'where',
  'location',
  'building',
  'floor',
  'auditorium',
  'library',
  'seminar',
  'room',
  'hall',
  'lab',
  'locate',
  'find',

  // Departments
  'cse',
  'ece',
  'eee',
  'mech',
  'civil',
  'admin',
  'general'
]

// Common English words that should never be altered
const STOP_WORDS = new Set([
  'what', "what's", 'whats', 'is', 'are', 'was', 'were', 'the', 'a', 'an',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'about', 'by', 'from',
  'can', 'could', 'would', 'should', 'will', 'you', 'me', 'i', 'we', 'us',
  'tell', 'show', 'give', 'please', 'do', 'does', 'did', 'have', 'has', 'had',
  'there', 'their', 'they', 'how', 'when', 'which', 'who', 'why', 'any'
])

/**
 * Calculates Damerau-Levenshtein distance between two strings
 * Handles insertions, deletions, substitutions, and adjacent transpositions.
 */
export function getDamerauLevenshteinDistance(str1, str2) {
  const len1 = str1.length
  const len2 = str2.length

  if (len1 === 0) return len2
  if (len2 === 0) return len1

  const matrix = Array.from({ length: len1 + 1 }, () => new Array(len2 + 1).fill(0))

  for (let i = 0; i <= len1; i++) matrix[i][0] = i
  for (let j = 0; j <= len2; j++) matrix[0][j] = j

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,        // deletion
        matrix[i][j - 1] + 1,        // insertion
        matrix[i - 1][j - 1] + cost  // substitution
      )

      // Adjacent transposition
      if (i > 1 && j > 1 && str1[i - 1] === str2[j - 2] && str1[i - 2] === str2[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1)
      }
    }
  }

  return matrix[len1][len2]
}

/**
 * Finds the closest matching keyword for a given word token using fuzzy matching.
 * Returns the matched keyword if within tolerance, or the original word if uncertain.
 */
export function matchFuzzyKeyword(rawWord) {
  if (!rawWord) return rawWord

  const word = rawWord.toLowerCase()

  // 1. If exact keyword, return it
  if (KEYWORDS.includes(word)) {
    return word
  }

  // 2. Handle common possessives (e.g. "todays" -> "today", "tomorrows" -> "tomorrow")
  if (word.endsWith("'s") || word.endsWith("s'")) {
    const base = word.replace(/'s$|s'$/, '')
    if (KEYWORDS.includes(base)) return base
  }
  if (word === 'todays') return 'today'
  if (word === 'tomorrows') return 'tomorrow'
  if (word === 'yesterdays') return 'yesterday'

  // 3. If exact stop word, preserve it
  if (STOP_WORDS.has(word)) {
    return word
  }

  // Short words (<= 3 chars) shouldn't be aggressively fuzzy matched unless exact
  if (word.length <= 3) {
    return word
  }

  let bestMatch = null
  let minDistance = Infinity
  let highestSimilarity = 0

  for (const keyword of KEYWORDS) {
    // Determine maximum allowed distance based on word length
    const maxLen = Math.max(word.length, keyword.length)
    let maxAllowedDistance = 1

    if (maxLen >= 6) {
      maxAllowedDistance = 2
    }

    // Skip candidate if length difference already exceeds max allowed distance
    if (Math.abs(word.length - keyword.length) > maxAllowedDistance) {
      continue
    }

    const distance = getDamerauLevenshteinDistance(word, keyword)
    const similarity = 1 - distance / maxLen

    // Criteria: Distance within threshold and similarity at least 70%
    if (distance <= maxAllowedDistance && similarity >= 0.70) {
      if (distance < minDistance || (distance === minDistance && similarity > highestSimilarity)) {
        minDistance = distance
        highestSimilarity = similarity
        bestMatch = keyword
      }
    }
  }

  // Return the closest matching keyword if found, otherwise keep original word
  return bestMatch || word
}

/**
 * Normalizes input text:
 * - Collapses redundant whitespace
 * - Tokenizes words while separating attached punctuation
 * - Applies fuzzy correction to recognize misspelled keywords
 * - Reassembles into clean, normalized query for the chatbot engine
 * 
 * @param {string} text - Raw input string from the user
 * @returns {string} Normalized and spelling-corrected query
 */
export function normalizeAndCorrectText(text) {
  if (!text || typeof text !== 'string') return ''

  // 1. Trim and collapse extra whitespaces
  const cleaned = text.trim().replace(/\s+/g, ' ')
  if (!cleaned) return ''

  // 2. Tokenize by words and punctuation
  // Matches words (alphanumeric with apostrophes) and separate punctuation
  const tokenRegex = /([a-zA-Z0-9'-]+|[^a-zA-Z0-9\s]+)/g
  const tokens = cleaned.match(tokenRegex) || []

  const correctedTokens = tokens.map((token) => {
    // If token is punctuation (e.g. "?", "!", ","), keep as is
    if (!/^[a-zA-Z0-9'-]+$/.test(token)) {
      return token
    }

    return matchFuzzyKeyword(token)
  })

  // 3. Reconstruct sentence cleanly handling spacing before punctuation
  let result = ''
  for (let i = 0; i < correctedTokens.length; i++) {
    const token = correctedTokens[i]
    const isPunctuation = /^[^a-zA-Z0-9\s]+$/.test(token)

    if (i === 0 || isPunctuation) {
      result += token
    } else {
      result += ' ' + token
    }
  }

  return result.trim()
}
