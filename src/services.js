import { createClient } from '@supabase/supabase-js'

const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
)

// === HELPERS ===
function timeAgo(date) {
  const s = Math.floor((new Date() - new Date(date)) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function makeId(title) {
  return title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60)
}

// === NEWS FETCHING ===
export async function fetchNews() {
  try {
    const res = await fetch('/api/news')
    if (!res.ok) throw new Error('News fetch failed')
    const items = await res.json()
    return items.map(item => ({
      id: makeId(item.title),
      title: item.title,
      summary: item.description,
      link: item.link,
      source: item.source,
      category: item.category,
      time: timeAgo(item.pubDate),
      pubDate: item.pubDate,
      impact: 'LOW',
      instruments: [],
      confirmStatus: 'ANALYZING',
    }))
  } catch (e) {
    console.error('Failed to fetch news:', e)
    return []
  }
}

// === FULL ARTICLE FETCH ===
export async function fetchFullArticle(url) {
  try {
    const res = await fetch(`/api/article?url=${encodeURIComponent(url)}`)
    const data = await res.json()
    return data.content || data.message || 'Unable to load article preview.'
  } catch (e) {
    return 'Unable to load article preview.'
  }
}

// === SUPABASE CACHE ===
export async function getCachedAnalyses(ids) {
  if (!ids.length) return {}
  try {
    const { data } = await supabase.from('article_cache').select('*').in('id', ids)
    const map = {}
    ;(data || []).forEach(d => {
      map[d.id] = {
        impact: d.impact,
        instruments: d.instruments || [],
        confirmStatus: d.confirm_status,
        groqAnalysis: d.groq_analysis,
        geminiAnalysis: d.gemini_analysis,
      }
    })
    return map
  } catch (e) { return {} }
}

async function cacheAnalysis(article, result) {
  try {
    await supabase.from('article_cache').upsert({
      id: article.id,
      title: article.title,
      source: article.source,
      impact: result.impact,
      instruments: result.instruments,
      confirm_status: result.confirmStatus,
      groq_analysis: result.groqAnalysis || null,
      gemini_analysis: result.geminiAnalysis || null,
    })
  } catch (e) {}
}

// === AI ANALYSIS ===
const PROMPT = (title, summary) => `You are an expert financial markets analyst. Analyze this news and return ONLY a JSON object, nothing else.

Headline: "${title}"
${summary ? `Context: "${summary.slice(0, 300)}"` : ''}

Return exactly this format:
{"impact":"HIGH","instruments":["USD ↑","Gold ↓","S&P500 ↑"],"verdict":"One sentence on market impact"}

Impact rules:
- HIGH = Central bank decisions, wars/conflicts, market crashes, major surprise earnings, geopolitical crises, large M&A
- MEDIUM = Regular earnings reports, economic data releases, OPEC decisions, sector news, analyst upgrades/downgrades
- LOW = Minor company updates, routine news, lifestyle/non-market content

Instrument rules:
- Always include directional arrows (↑ for up, ↓ for down)
- Use clear tickers: USD, EUR, GBP, JPY, Gold, Silver, Oil, S&P500, Nasdaq, BTC, ETH, AAPL, TSLA, etc.
- Only include instruments clearly affected
- Maximum 5 instruments`

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
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Groq ${res.status}: ${errText.slice(0, 100)}`)
  }
  const d = await res.json()
  const text = d.choices?.[0]?.message?.content || '{}'
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}

// Try multiple Gemini models in order of preference
const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash']

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
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 300,
              responseMimeType: 'application/json',
            }
          })
        }
      )
      if (!res.ok) {
        const errText = await res.text()
        lastErr = new Error(`Gemini ${model} ${res.status}: ${errText.slice(0, 150)}`)
        continue
      }
      const d = await res.json()
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
      return JSON.parse(text.replace(/```json|```/g, '').trim())
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('All Gemini models failed')
}

export async function analyzeWithBothAIs(article) {
  try {
    const [g, m] = await Promise.allSettled([
      callGroq(article.title, article.summary),
      callGemini(article.title, article.summary),
    ])
    const groq = g.status === 'fulfilled' ? g.value : null
    const gem = m.status === 'fulfilled' ? m.value : null

    if (g.status === 'rejected') console.warn('Groq failed:', g.reason?.message)
    if (m.status === 'rejected') console.warn('Gemini failed:', m.reason?.message)

    if (!groq && !gem) return { confirmStatus: 'REVIEW', impact: 'LOW', instruments: [] }

    let result
    if (!groq) {
      result = { confirmStatus: 'REVIEW', impact: gem.impact, instruments: gem.instruments || [], geminiAnalysis: gem }
    } else if (!gem) {
      result = { confirmStatus: 'REVIEW', impact: groq.impact, instruments: groq.instruments || [], groqAnalysis: groq }
    } else {
      const lvl = { HIGH: 2, MEDIUM: 1, LOW: 0 }
      const diff = Math.abs((lvl[groq.impact] ?? 0) - (lvl[gem.impact] ?? 0))
      const confirmStatus = diff === 0 ? 'CONFIRMED' : diff === 1 ? 'DISPUTED' : 'REVIEW'
      const impact = (lvl[groq.impact] ?? 0) >= (lvl[gem.impact] ?? 0) ? groq.impact : gem.impact
      const instruments = [...new Set([...(groq.instruments || []), ...(gem.instruments || [])])].slice(0, 6)
      result = { confirmStatus, impact, instruments, groqAnalysis: groq, geminiAnalysis: gem }
    }
    await cacheAnalysis(article, result)
    return result
  } catch (e) {
    return { confirmStatus: 'REVIEW', impact: 'LOW', instruments: [] }
  }
}

// === WATCHLIST ===
export async function getWatchlist() {
  try {
    const { data } = await supabase.from('watchlist').select('*').order('created_at', { ascending: false })
    return data || []
  } catch (e) { return [] }
}
export async function addToWatchlist(symbol, name, category) {
  const { error } = await supabase.from('watchlist').insert({
    symbol: symbol.toUpperCase().trim(),
    name: name?.trim() || null,
    category: category || 'Stock',
  })
  return !error
}
export async function removeFromWatchlist(id) {
  await supabase.from('watchlist').delete().eq('id', id)
}

// === READ TRACKING ===
export async function getReadArticleIds() {
  try {
    const { data } = await supabase.from('read_articles').select('article_id')
    return new Set((data || []).map(d => d.article_id))
  } catch (e) { return new Set() }
}
export async function markAsRead(articleId) {
  await supabase.from('read_articles').upsert({ article_id: articleId })
}
