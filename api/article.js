// Vercel serverless function — fetches and cleans full article content
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600')

  const url = req.query.url
  if (!url) {
    return res.status(400).json({ error: 'URL required' })
  }

  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 8000)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml',
      },
      signal: ctrl.signal,
    })
    clearTimeout(timeout)

    let html = await response.text()

    // Remove scripts, styles, navs, ads, comments
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

    // Try to extract article body
    let articleHTML = null
    const patterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<main[^>]*>([\s\S]*?)<\/main>/i,
      /<div[^>]*(?:class|id)="[^"]*(?:article-body|story-body|post-content|entry-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ]
    for (const p of patterns) {
      const match = html.match(p)
      if (match && match[1].length > 500) {
        articleHTML = match[1]
        break
      }
    }
    if (!articleHTML) articleHTML = html

    // Extract paragraphs
    const paragraphs = articleHTML.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || []
    const text = paragraphs
      .map(p => p
        .replace(/<[^>]*>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      )
      .filter(p => p.length > 40 && !p.match(/^(advertisement|subscribe|sign up|cookie)/i))
      .join('\n\n')

    if (text.length < 100) {
      return res.status(200).json({
        content: null,
        message: 'Article preview not available. Click "Open Original" to read on the source site.'
      })
    }

    res.status(200).json({ content: text.slice(0, 10000) })
  } catch (e) {
    res.status(200).json({
      content: null,
      message: 'Article preview not available. Click "Open Original" to read on the source site.'
    })
  }
}
