import { createClient } from '@supabase/supabase-js'

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

// === FULL ARTICLE ===
export async function fetchFullArticle(url) {
  try {
    const res = await fetch(`/api/article?url=${encodeURIComponent(url)}`)
    const data = await res.json()
    return data.content || data.message || 'Unable to load article.'
  } catch (e) {
    return 'Unable to load article.'
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

// === AI ANALYSIS (server-side) ===
export async function analyzeWithBothAIs(article) {
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: article.title, summary: article.summary }),
    })
    const result = await res.json()
    // Cache only if we got real analysis
    if (result.groqAnalysis || result.geminiAnalysis) {
      await cacheAnalysis(article, result)
    }
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
