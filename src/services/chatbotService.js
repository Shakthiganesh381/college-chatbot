/**
 * Frontend chatbot service client.
 * Dispatches the chat messages to the Express backend API.
 */
const API_BASE = import.meta.env?.VITE_API_BASE_URL || ''

export const getBotResponse = async (query) => {
  if (!query || !query.trim()) return "Please ask me something!"

  try {
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: query.trim() }),
    })

    if (!response.ok) {
      throw new Error(`Server returned HTTP status ${response.status}`)
    }

    const data = await response.json()
    return data.reply
  } catch (error) {
    console.error('Error fetching chatbot response:', error)
    return 'Sorry, I am having trouble connecting to the college server right now. Please check if the server is running.'
  }
}
