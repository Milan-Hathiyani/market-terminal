// Vercel serverless function - fetches RSS from many sources in parallel
const FEEDS = [
  // ─── Forex / Currencies ───────────────────────────
  { url: 'https://www.forexlive.com/feed/', source: 'ForexLive', category: 'Forex' },
  { url: 'https://www.dailyfx.com/feeds/market-news', source: 'DailyFX', category: 'Forex' },
  { url: 'https://www.investing.com/rss/news_25.rss', source: 'Investing FX', category: 'Forex' },

  // ─── Stocks / Equities ────────────────────────────
  { url: 'https://finance.yahoo.com/news/rssindex', source: 'Yahoo Finance', category: 'Stocks' },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', source: 'CNBC', category: 'Stocks' },
  { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', source: 'MarketWatch', category: 'Stocks' },
  { url: 'https://seekingalpha.com/market_currents.xml', source: 'Seeking Alpha', category: 'Stocks' },
  { url: 'https://www.businessinsider.com/markets/rss', source: 'Business Insider', category: 'Stocks' },

  // ─── Macro / General Markets ──────────────────────
  { url: 'https://feeds.reuters.com/reuters/businessNews', source: 'Reuters', category: 'Macro' },
  { url: 'https://www.investing.com/rss/news.rss', source: 'Investing.com', category: 'Macro' },
  { url: 'https://www.ft.com/markets?format=rss', source: 'Financial Times', category: 'Macro' },
  { url: 'https://www.zerohedge.com/fullrss2.xml', source: 'ZeroHedge', category: 'Macro' },
  { url: 'https://www.federalreserve.gov/feeds/press_all.xml', source: 'Federal Reserve', category: 'Macro' },

  // ─── Commodities ──────────────────────────────────
  { url: 'https://www.investing.com/rss/news_11.rss', source: 'Investing Commodities', category: 'Commodities' },

  // ─── Crypto ───────────────────────────────────────
  { url: 'https://cryptopanic.com/news/rss/', source: 'CryptoPanic', category: 'Crypto' },
  { url: 'https://cointelegraph.com/rss', source: 'CoinTelegraph', category: 'Crypto' },
  { url: 'https://decrypt.co/feed', source: 'Decrypt', category: 'Crypto' },
  { url: 'https://news.bitcoin.com/feed/', source: 'Bitcoin News', category: 'Crypto' },
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
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/\s+/g, ' ')
    .trim()
}

function extract(item, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  return (item.match(re)?.[1] || '').trim()
}

async function fetchFeed(feedConfig) {
  const { url, source, category } = feedConfig
  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 7000)
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      signal: ctrl.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return []
    const xml = await res.text()
    const items = xml.match(/<item[\s\S]*?<\/item>/g) || []
    return items.slice(0, 12).map(item => {
      const title = clean(extract(item, 'title'))
      const link = clean(extract(item, 'link'))
      const description = clean(extract(item, 'description')).slice(0, 400)
      const pubDate = extract(item, 'pubDate') || new Date().toISOString()
      return { title, link, description, pubDate, source, category }
    }).filter(a => a.title && a.title.length > 10)
  } catch (e) {
    return []
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=20, s-maxage=20, stale-while-revalidate=60')

  const results = await Promise.allSettled(FEEDS.map(f => fetchFeed(f)))
  const all = []
  results.forEach(r => { if (r.status === 'fulfilled') all.push(...r.value) })

  const seen = new Set()
  const deduped = all.filter(a => {
    const id = a.title.replace(/\s+/g, '-').toLowerCase().slice(0, 50)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })

  deduped.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
  res.status(200).json(deduped.slice(0, 120))
}
