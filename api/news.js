// Vercel serverless function — fetches RSS feeds on Vercel's servers (fast, no CORS issues)
const FEEDS = [
  { url: 'https://finance.yahoo.com/news/rssindex', source: 'Yahoo Finance' },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', source: 'CNBC' },
  { url: 'https://feeds.reuters.com/reuters/businessNews', source: 'Reuters' },
  { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', source: 'MarketWatch' },
  { url: 'https://www.investing.com/rss/news.rss', source: 'Investing.com' },
  { url: 'https://www.investing.com/rss/news_25.rss', source: 'Investing Forex' },
  { url: 'https://www.investing.com/rss/news_11.rss', source: 'Investing Commodities' },
  { url: 'https://cryptopanic.com/news/rss/', source: 'CryptoPanic' },
  { url: 'https://www.ft.com/markets?format=rss', source: 'Financial Times' },
]

function clean(text) {
  if (!text) return ''
  return text
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extract(item, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  return (item.match(re)?.[1] || '').trim()
}

async function fetchFeed(url, source) {
  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MarketTerminal/1.0)' },
      signal: ctrl.signal,
    })
    clearTimeout(timeout)
    const xml = await res.text()
    const items = xml.match(/<item[\s\S]*?<\/item>/g) || []
    return items.slice(0, 15).map(item => {
      const title = clean(extract(item, 'title'))
      const link = clean(extract(item, 'link'))
      const description = clean(extract(item, 'description')).slice(0, 400)
      const pubDate = extract(item, 'pubDate') || new Date().toISOString()
      return { title, link, description, pubDate, source }
    }).filter(a => a.title)
  } catch (e) {
    return []
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=60')

  const results = await Promise.allSettled(
    FEEDS.map(f => fetchFeed(f.url, f.source))
  )

  const all = []
  results.forEach(r => {
    if (r.status === 'fulfilled') all.push(...r.value)
  })

  const seen = new Set()
  const deduped = all.filter(a => {
    const id = a.title.replace(/\s+/g, '-').toLowerCase().slice(0, 50)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })

  deduped.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))

  res.status(200).json(deduped.slice(0, 80))
}
