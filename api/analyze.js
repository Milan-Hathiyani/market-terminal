// Vercel serverless function - runs dual AI analysis server-side (avoids browser CORS blocks)
const GROQ_KEY = process.env.VITE_GROQ_API_KEY || process.env.GROQ_API_KEY
const GEMINI_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY

const PROMPT = (title, summary) => `You are an expert financial markets analyst. Analyze this news and return ONLY a JSON object, nothing else.

Headline: "${title}"
${summary ? `Context: "${String(summary).slice(0, 300)}"` : ''}

Return exactly this format:
{"impact":"HIGH","instruments":["USD ↑","Gold ↓","S&P500 ↑"],"verdict":"One sentence on market impact"}

Impact rules:
- HIGH = Central bank decisions, wars/conflicts, market crashes, major surprise earnings, geopolitical crises, large M&A
- MEDIUM = Regular earnings reports, economic data releases, OPEC decisions, sector news, analyst upgrades/downgrades
- LOW = Minor company updates, routine news, lifestyle/non-market content

Instrument rules:
- Always include directional arrows (↑ for up, ↓ for down)
- Use clear tickers: USD, EUR, GBP, JPY, Gold, Silver, Oil, S&P500, Nasdaq, BTC, ETH, AAPL, TSLA, etc.
- Only include instruments clearly affected, maximum 5`

function safeParse(text) {
  if (!text) return null
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch (e) {
    // Try to find JSON object in the text
    const match = text.match(/\{[\s\S]*\}/)
    if (match) { try { return JSON.parse(match[0]) } catch (e2) {} }
    return null
  }
}

async function callGroq(title, summary) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: PROMPT(title, summary) }],
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    })
  })
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 120)}`)
  const d = await res.json()
  return safeParse(d.choices?.[0]?.message?.content)
}

const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-2.5-flash']

async function callGemini(title, summary) {
  let lastErr
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: PROMPT(title, summary) }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 300, responseMimeType: 'application/json' }
          })
        }
      )
      if (!res.ok) { lastErr = new Error(`Gemini ${model} ${res.status}`); continue }
      const d = await res.json()
      const parsed = safeParse(d.candidates?.[0]?.content?.parts?.[0]?.text)
      if (parsed) return parsed
      lastErr = new Error(`Gemini ${model}: unparseable`)
    } catch (e) { lastErr = e }
  }
  throw lastErr || new Error('All Gemini models failed')
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch (e) { body = {} } }
  const { title, summary } = body || {}
  if (!title) return res.status(400).json({ error: 'title required' })

  const [g, m] = await Promise.allSettled([
    callGroq(title, summary),
    callGemini(title, summary),
  ])
  const groq = g.status === 'fulfilled' ? g.value : null
  const gem = m.status === 'fulfilled' ? m.value : null

  if (!groq && !gem) {
    return res.status(200).json({
      confirmStatus: 'REVIEW', impact: 'LOW', instruments: [],
      _debug: { groq: g.reason?.message || null, gemini: m.reason?.message || null }
    })
  }

  let result
  if (!groq) {
    result = { confirmStatus: 'REVIEW', impact: gem.impact || 'LOW', instruments: gem.instruments || [], geminiAnalysis: gem }
  } else if (!gem) {
    result = { confirmStatus: 'REVIEW', impact: groq.impact || 'LOW', instruments: groq.instruments || [], groqAnalysis: groq }
  } else {
    const lvl = { HIGH: 2, MEDIUM: 1, LOW: 0 }
    const diff = Math.abs((lvl[groq.impact] ?? 0) - (lvl[gem.impact] ?? 0))
    const confirmStatus = diff === 0 ? 'CONFIRMED' : diff === 1 ? 'DISPUTED' : 'REVIEW'
    const impact = (lvl[groq.impact] ?? 0) >= (lvl[gem.impact] ?? 0) ? groq.impact : gem.impact
    const instruments = [...new Set([...(groq.instruments || []), ...(gem.instruments || [])])].slice(0, 6)
    result = { confirmStatus, impact, instruments, groqAnalysis: groq, geminiAnalysis: gem }
  }
  res.status(200).json(result)
}
