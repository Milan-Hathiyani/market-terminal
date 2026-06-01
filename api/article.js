// Vercel serverless function - extracts clean article content
// Primary: jina.ai Reader (free, reliable, no key required)
// Fallback: direct HTML scraping
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600')

  const url = req.query.url
  if (!url) return res.status(400).json({ error: 'URL required' })

  // ── Try jina.ai Reader first (most reliable) ──
  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 12000)
    const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'text',
      },
      signal: ctrl.signal,
    })
    clearTimeout(timeout)

    if (jinaRes.ok) {
      let text = await jinaRes.text()
      // Strip jina's headers (Title:, URL Source:, Markdown Content:, etc.)
      text = text
        .replace(/^Title:.*$/gm, '')
        .replace(/^URL Source:.*$/gm, '')
        .replace(/^Published Time:.*$/gm, '')
        .replace(/^Markdown Content:\s*/gm, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')           // remove image markdown
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')        // simplify [text](link) to text
        .replace(/^#+\s*/gm, '')                         // remove heading markers
        .replace(/\*\*([^*]+)\*\*/g, '$1')              // remove bold
        .replace(/__([^_]+)__/g, '$1')
        .replace(/^>\s*/gm, '')                          // remove blockquotes
        .replace(/^[-*]\s+/gm, '• ')                    // convert bullets
        .replace(/\n{3,}/g, '\n\n')                     // collapse newlines
        .trim()

      // Quality check - if it's substantial content, return it
      if (text.length > 300) {
        return res.status(200).json({ content: text.slice(0, 15000) })
      }
    }
  } catch (e) {
    // Jina failed, try fallback
  }

  // ── Fallback: Direct HTML scraping ──
  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 8000)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: ctrl.signal,
    })
    clearTimeout(timeout)
    let html = await response.text()

    html = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<form[\s\S]*?<\/form>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')

    let articleHTML = null
    const patterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<main[^>]*>([\s\S]*?)<\/main>/i,
      /<div[^>]*(?:class|id)="[^"]*(?:article-body|story-body|post-content|entry-content|article__content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ]
    for (const p of patterns) {
      const match = html.match(p)
      if (match && match[1].length > 500) { articleHTML = match[1]; break }
    }
    if (!articleHTML) articleHTML = html

    const paragraphs = articleHTML.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || []
    const text = paragraphs
      .map(p => p
        .replace(/<[^>]*>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ').trim()
      )
      .filter(p => p.length > 40 && !p.match(/^(advertisement|subscribe|sign up|cookie|©)/i))
      .join('\n\n')

    if (text.length > 200) {
      return res.status(200).json({ content: text.slice(0, 12000) })
    }
  } catch (e) {}

  return res.status(200).json({
    content: null,
    message: 'Article preview unavailable. Click "Open Original" to read on the source site.'
  })
}
