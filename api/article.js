// Vercel serverless function - extracts clean article content via jina.ai Reader
function cleanArticleText(text) {
  if (!text) return ''
  let paras = text.split('\n').map(p => p.trim()).filter(Boolean)

  // Find the first "real" paragraph (long, has sentence punctuation)
  // This skips navigation menus, breadcrumbs, etc. at the top
  let startIdx = 0
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i]
    const sentenceCount = (p.match(/[.!?]/g) || []).length
    if (p.length > 100 && sentenceCount >= 1 && p.split(' ').length > 15) {
      startIdx = i
      break
    }
  }
  paras = paras.slice(startIdx)

  // Stop at footer/related/promo sections
  const stopPattern = /^(related|recommended|more from|read more|trending|you might also|sign up|subscribe|comments \(|©|share this|follow us|advertisement|most popular|editor'?s pick)/i
  const endIdx = paras.findIndex((p, i) => i > 2 && stopPattern.test(p))
  if (endIdx > 2) paras = paras.slice(0, endIdx)

  // Keep only substantial lines, drop obvious junk
  const junkPattern = /^(skip to|home page|create (free )?account|log ?in|sign ?in|menu|search|cookie|privacy policy|terms of use|©|\d+ min read|by [a-z .]+$)/i
  paras = paras.filter(p => {
    if (p.length < 40) return false
    if (junkPattern.test(p)) return false
    return true
  })

  return paras.join('\n\n')
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600')

  const url = req.query.url
  if (!url) return res.status(400).json({ error: 'URL required' })

  // ── jina.ai Reader (primary) ──
  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 12000)
    const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'text',
        // Ask jina to focus on the main article and skip nav/aside
        'X-Remove-Selector': 'header, nav, footer, aside, .ad, .ads, .advertisement, .related, .recommended, .newsletter, .subscribe',
      },
      signal: ctrl.signal,
    })
    clearTimeout(timeout)

    if (jinaRes.ok) {
      let text = await jinaRes.text()
      text = text
        .replace(/^Title:.*$/gm, '')
        .replace(/^URL Source:.*$/gm, '')
        .replace(/^Published Time:.*$/gm, '')
        .replace(/^Image \d+:.*$/gm, '')
        .replace(/^Markdown Content:\s*/gm, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^#+\s*/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/^>\s*/gm, '')
        .replace(/={3,}/g, '')
        .replace(/-{3,}/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

      const cleaned = cleanArticleText(text)
      if (cleaned.length > 250) {
        return res.status(200).json({ content: cleaned.slice(0, 15000) })
      }
    }
  } catch (e) {}

  // ── Direct scrape fallback ──
  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 8000)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
        'Accept': 'text/html',
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
      .replace(/<!--[\s\S]*?-->/g, '')

    let articleHTML = null
    const patterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<main[^>]*>([\s\S]*?)<\/main>/i,
    ]
    for (const p of patterns) {
      const match = html.match(p)
      if (match && match[1].length > 500) { articleHTML = match[1]; break }
    }
    if (!articleHTML) articleHTML = html

    const paragraphs = articleHTML.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || []
    const raw = paragraphs
      .map(p => p.replace(/<[^>]*>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ').trim())
      .join('\n')
    const cleaned = cleanArticleText(raw)
    if (cleaned.length > 200) {
      return res.status(200).json({ content: cleaned.slice(0, 12000) })
    }
  } catch (e) {}

  return res.status(200).json({
    content: null,
    message: 'Full text not available for this source. Tap "Open Original" to read it on the publisher site.'
  })
}
