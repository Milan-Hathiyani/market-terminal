const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY

const FEEDS = [
  { url: 'https://finance.yahoo.com/news/rssindex', source: 'Yahoo Finance' },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', source: 'CNBC' },
  { url: 'https://feeds.reuters.com/reuters/businessNews', source: 'Reuters' },
  { url: 'https://www.investing.com/rss/news.rss', source: 'Investing.com' },
  { url: 'https://cryptopanic.com/news/rss/', source: 'CryptoPanic' },
]

function timeAgo(date) {
  const s = Math.floor((new Date() - new Date(date)) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function parseXML(xmlString) {
  const parser = new DOMParser()
  const xml = parser.parseFromString(xmlString, 'text/xml')
  const items = xml.querySelectorAll('item')
  const results = []
  items.forEach(item => {
    results.push({
      title: item.querySelector('title')?.textContent || '',
      link: item.querySelector('link')?.textContent || '',
      description: item.querySelector('description')?.textContent?.replace(/<[^>]*>/g, '').slice(0, 400) || '',
      pubDate: item.querySelector('pubDate')?.textContent || new Date().toISOString(),
    })
  })
  return results
}

export async function fetchNews() {
  const all = []
  await Promise.allSettled(
    FEEDS.map(async ({ url, source }) => {
      try {
        const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`)
        const data = await res.json()
        const items = parseXML(data.contents)
        items.slice(0, 12).forEach(item => {
          const id = item.title.replace(/\s+/g, '-').toLowerCase().slice(0, 50)
          all.push({
            id, title: item.title, summary: item.description,
            link: item.link, source, time: timeAgo(item.pubDate),
            pubDate: item.pubDate, impact: 'LOW', instruments: [],
            confirmStatus: 'ANALYZING',
          })
        })
      } catch (e) { console.warn(`Feed failed: ${source}`) }
    })
  )
  const seen = new Set()
  return all
    .filter(a => a.title && !seen.has(a.id) && seen.add(a.id))
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, 60)
}

const PROMPT = (title, summary) => `You are a financial markets analyst. Analyze this news headline and return ONLY a JSON object with no other text.

Headline: "${title}"
${summary ? `Summary: "${summary}"` : ''}

Return exactly:
{"impact":"HIGH","instruments":["USD ↑","Gold ↓"],"verdict":"one sentence on market impact"}

Rules:
- HIGH = Fed decisions, wars, crashes, major crises, surprise earnings
- MEDIUM = regular earnings, economic data, OPEC, mergers
- LOW = minor company news, routine updates
- Add ↑ or ↓ to each instrument`

async function callGroq(title, summary) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: PROMPT(title, summary) }],
      temperature: 0.1, max_tokens: 250,
    })
  })
  const d = await res.json()
  return JSON.parse(d.choices?.[0]?.message?.content?.replace(/```json|```/g, '').trim() || '{}')
}

async function callGemini(title, summary) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT(title, summary) }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 250 }
      })
    }
  )
  const d = await res.json()
  return JSON.parse(d.candidates?.[0]?.content?.parts?.[0]?.text?.replace(/```json|```/g, '').trim() || '{}')
}

export async function analyzeWithBothAIs(article) {
  try {
    const [g, m] = await Promise.allSettled([
      callGroq(article.title, article.summary),
      callGemini(article.title, article.summary),
    ])
    const groq = g.status === 'fulfilled' ? g.value : null
    const gem = m.status === 'fulfilled' ? m.value : null
    if (!groq && !gem) return { confirmStatus: 'REVIEW', impact: 'LOW', instruments: [] }
    if (!groq) return { confirmStatus: 'REVIEW', impact: gem.impact, instruments: gem.instruments || [], geminiAnalysis: gem }
    if (!gem) return { confirmStatus: 'REVIEW', impact: groq.impact, instruments: groq.instruments || [], groqAnalysis: groq }
    const lvl = { HIGH: 2, MEDIUM: 1, LOW: 0 }
    const diff = Math.abs(lvl[groq.impact] - lvl[gem.impact])
    const confirmStatus = diff === 0 ? 'CONFIRMED' : diff === 1 ? 'DISPUTED' : 'REVIEW'
    const impact = lvl[groq.impact] >= lvl[gem.impact] ? groq.impact : gem.impact
    const instruments = [...new Set([...(groq.instruments || []), ...(gem.instruments || [])])]
    return { confirmStatus, impact, instruments, groqAnalysis: groq, geminiAnalysis: gem }
  } catch (e) {
    return { confirmStatus: 'REVIEW', impact: 'LOW', instruments: [] }
  }
}