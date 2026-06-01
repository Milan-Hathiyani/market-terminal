import { createClient } from '@supabase/supabase-js'

const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
)

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
  const xml = new DOMParser().parseFromString(xmlString, 'text/xml')
  return Array.from(xml.querySelectorAll('item')).map(item => ({
    title: item.querySelector('title')?.textContent || '',
    link: item.querySelector('link')?.textContent || '',
    description: item.querySelector('description')?.textContent?.replace(/<[^>]*>/g, '').slice(0, 400) || '',
    pubDate: item.querySelector('pubDate')?.textContent || new Date().toISOString(),
  }))
}

export async function fetchNews() {
  const all = []
  await Promise.allSettled(FEEDS.map(async ({ url, source }) => {
    try {
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`)
      const data = await res.json()
      parseXML(data.contents).slice(0, 12).forEach(item => {
        const id = item.title.replace(/\s+/g, '-').toLowerCase().slice(0, 50)
        all.push({
          id, title: item.title, summary: item.description, link: item.link,
          source, time: timeAgo(item.pubDate), pubDate: item.pubDate,
          impact: 'LOW', instruments: [], confirmStatus: 'ANALYZING',
        })
      })
    } catch (e) { console.warn(`Feed failed: ${source}`) }
  }))
  const seen = new Set()
  return all.filter(a => a.title && !seen.has(a.id) && seen.add(a.id))
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, 60)
}

export async function getCachedAnalyses(ids) {
  if (!ids.length) return {}
  const { data } = await supabase.from('article_cache').select('*').in('id', ids)
  const map = {}
  ;(data || []).forEach(d => {
    map[d.id] = {
      impact: d.impact, instruments: d.instruments || [],
      confirmStatus: d.confirm_status,
      groqAnalysis: d.groq_analysis, geminiAnalysis: d.gemini_analysis,
    }
  })
  return map
}

async function cacheAnalysis(article, result) {
  await supabase.from('article_cache').upsert({
    id: article.id, title: article.title, source: article.source,
    impact: result.impact, instruments: result.instruments,
    confirm_status: result.confirmStatus,
    groq_analysis: result.groqAnalysis || null,
    gemini_analysis: result.geminiAnalysis || null,
  })
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
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    let result
    if (!groq) result = { confirmStatus: 'REVIEW', impact: gem.impact, instruments: gem.instruments || [], geminiAnalysis: gem }
    else if (!gem) result = { confirmStatus: 'REVIEW', impact: groq.impact, instruments: groq.instruments || [], groqAnalysis: groq }
    else {
      const lvl = { HIGH: 2, MEDIUM: 1, LOW: 0 }
      const diff = Math.abs(lvl[groq.impact] - lvl[gem.impact])
      const confirmStatus = diff === 0 ? 'CONFIRMED' : diff === 1 ? 'DISPUTED' : 'REVIEW'
      const impact = lvl[groq.impact] >= lvl[gem.impact] ? groq.impact : gem.impact
      const instruments = [...new Set([...(groq.instruments || []), ...(gem.instruments || [])])]
      result = { confirmStatus, impact, instruments, groqAnalysis: groq, geminiAnalysis: gem }
    }
    await cacheAnalysis(article, result)
    return result
  } catch (e) { return { confirmStatus: 'REVIEW', impact: 'LOW', instruments: [] } }
}

export async function getWatchlist() {
  const { data } = await supabase.from('watchlist').select('*').order('created_at', { ascending: false })
  return data || []
}
export async function addToWatchlist(symbol, name, category) {
  const { error } = await supabase.from('watchlist').insert({ symbol: symbol.toUpperCase(), name, category })
  return !error
}
export async function removeFromWatchlist(id) {
  await supabase.from('watchlist').delete().eq('id', id)
}
export async function getReadArticleIds() {
  const { data } = await supabase.from('read_articles').select('article_id')
  return new Set((data || []).map(d => d.article_id))
}
export async function markAsRead(articleId) {
  await supabase.from('read_articles').upsert({ article_id: articleId })
}

export async function fetchFullArticle(url) {
  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`)
    const data = await res.json()
    const doc = new DOMParser().parseFromString(data.contents, 'text/html')
    const selectors = ['article', '[role="main"]', '.article-body', '.post-content', '.story-content', 'main']
    let content = null
    for (const sel of selectors) {
      const el = doc.querySelector(sel)
      if (el && el.textContent.length > 200) { content = el; break }
    }
    if (!content) content = doc.body
    content.querySelectorAll('script, style, nav, header, footer, aside, iframe, .ad').forEach(el => el.remove())
    const text = Array.from(content.querySelectorAll('p'))
      .map(p => p.textContent.trim())
      .filter(t => t.length > 30)
      .join('\n\n')
    return text.slice(0, 5000) || 'Article preview unavailable.'
  } catch (e) { return 'Article preview unavailable.' }
}