import { useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchNews, analyzeWithBothAIs, getCachedAnalyses,
  getWatchlist, addToWatchlist, removeFromWatchlist,
  getReadArticleIds, markAsRead, fetchFullArticle,
} from './services'

// ── DESIGN TOKENS ──
const C = {
  bg: '#07090d', panel: '#0c0f16', panel2: '#11151e',
  border: '#1a1f2b', border2: '#252c3a',
  text: '#e6eaf2', dim: '#8a94a6', faint: '#525c6e', ghost: '#363f4f',
  accent: '#00e88f', amber: '#f5a623', red: '#ff4d4d', blue: '#4d9fff',
}
const IMP = {
  HIGH:   { c: '#ff4d4d', bg: 'rgba(255,77,77,0.12)', label: 'HIGH' },
  MEDIUM: { c: '#f5a623', bg: 'rgba(245,166,35,0.12)', label: 'MED' },
  LOW:    { c: '#22c55e', bg: 'rgba(34,197,94,0.10)', label: 'LOW' },
}
const CON = {
  CONFIRMED: { icon: '✓', c: '#22c55e', label: 'CONFIRMED' },
  DISPUTED:  { icon: '!', c: '#f5a623', label: 'DISPUTED' },
  REVIEW:    { icon: '?', c: '#ff6b6b', label: 'REVIEW' },
  ANALYZING: { icon: '○', c: '#525c6e', label: 'ANALYZING' },
}

function useIsMobile() {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768)
    window.addEventListener('resize', h); return () => window.removeEventListener('resize', h)
  }, [])
  return m
}

function fmtTime(pubDate) {
  const d = new Date(pubDate)
  if (isNaN(d)) return '--:--'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function matchesWatch(a, wl) {
  const text = `${a.title} ${a.summary || ''} ${(a.instruments || []).join(' ')}`
  return wl.some(w => {
    try {
      if (new RegExp(`\\b${w.symbol}\\b`, 'i').test(text)) return true
      if (w.name && new RegExp(`\\b${w.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) return true
    } catch (e) {}
    return false
  })
}

function Chip({ inst }) {
  const up = inst.includes('↑'), dn = inst.includes('↓')
  return (
    <span style={{
      fontSize: '11px', padding: '2px 8px', fontFamily: 'monospace', fontWeight: 700,
      borderRadius: '3px', whiteSpace: 'nowrap',
      border: `1px solid ${up ? '#15803d' : dn ? '#b91c1c' : C.border2}`,
      background: up ? 'rgba(34,197,94,0.1)' : dn ? 'rgba(255,77,77,0.1)' : 'transparent',
      color: up ? '#4ade80' : dn ? '#ff6b6b' : C.dim,
    }}>{inst}</span>
  )
}

// ── FLASH ITEM ──
function FlashItem({ a, expanded, onToggle, isWatched, onRead, isMobile }) {
  const [article, setArticle] = useState(null)
  const [loadingArt, setLoadingArt] = useState(false)
  const imp = IMP[a.impact] || IMP.LOW
  const con = CON[a.confirmStatus] || CON.ANALYZING

  useEffect(() => {
    if (expanded && !article && a.link) {
      setLoadingArt(true)
      fetchFullArticle(a.link).then(c => { setArticle(c); setLoadingArt(false) })
      onRead(a.id)
    }
  }, [expanded]) // eslint-disable-line

  return (
    <div style={{
      borderBottom: `1px solid ${C.border}`,
      borderLeft: `3px solid ${isWatched ? C.amber : expanded ? C.accent : imp.c}`,
      background: expanded ? 'rgba(0,232,143,0.03)' : 'transparent',
      transition: 'background 0.15s',
    }}>
      {/* Header row */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: '12px',
          padding: isMobile ? '12px 14px' : '13px 18px', cursor: 'pointer',
        }}
      >
        {/* Time */}
        <div style={{
          fontFamily: 'monospace', fontSize: '13px', color: C.faint,
          fontVariantNumeric: 'tabular-nums', flexShrink: 0, paddingTop: '1px',
          minWidth: '42px',
        }}>{fmtTime(a.pubDate)}</div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '2px',
              background: imp.bg, color: imp.c, letterSpacing: '0.5px',
            }}>{imp.label}</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: con.c, fontFamily: 'monospace' }}>
              {con.icon} {con.label}
            </span>
            {isWatched && <span style={{ color: C.amber, fontSize: '12px' }}>★</span>}
            <span style={{ fontSize: '10px', color: C.ghost, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {a.source}
            </span>
            <span style={{ fontSize: '10px', color: C.ghost, marginLeft: 'auto' }}>{a.time}</span>
          </div>

          <div style={{
            fontSize: isMobile ? '14px' : '14.5px', lineHeight: 1.45,
            color: expanded ? C.text : C.dim, fontWeight: 500,
            fontFamily: "'Inter', sans-serif",
          }}>{a.title}</div>

          {(a.instruments || []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
              {a.instruments.slice(0, expanded ? 99 : 5).map((inst, i) => <Chip key={i} inst={inst} />)}
            </div>
          )}
        </div>

        {/* Expand arrow */}
        <div style={{
          color: C.faint, fontSize: '12px', flexShrink: 0, paddingTop: '2px',
          transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s',
        }}>▸</div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: isMobile ? '0 14px 18px 14px' : '0 18px 20px 18px' }}>
          {/* AI dual verification */}
          {(a.groqAnalysis || a.geminiAnalysis) ? (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {a.groqAnalysis && (
                <div style={{ flex: 1, minWidth: '220px', background: 'rgba(34,197,94,0.05)', border: '1px solid #15803d', padding: '12px 14px', borderRadius: '4px' }}>
                  <div style={{ fontSize: '10px', color: '#4ade80', letterSpacing: '1px', marginBottom: '8px', fontFamily: 'monospace', fontWeight: 700 }}>◆ GROQ · LLAMA 3.3</div>
                  <div style={{ fontSize: '11px', color: C.faint, marginBottom: '6px', fontFamily: 'monospace' }}>IMPACT: <span style={{ color: IMP[a.groqAnalysis.impact]?.c || '#fff', fontWeight: 700 }}>{a.groqAnalysis.impact}</span></div>
                  <div style={{ fontSize: '13px', color: '#86efac', lineHeight: 1.6 }}>{a.groqAnalysis.verdict}</div>
                </div>
              )}
              {a.geminiAnalysis && (
                <div style={{ flex: 1, minWidth: '220px', background: 'rgba(77,159,255,0.05)', border: '1px solid #1e4976', padding: '12px 14px', borderRadius: '4px' }}>
                  <div style={{ fontSize: '10px', color: C.blue, letterSpacing: '1px', marginBottom: '8px', fontFamily: 'monospace', fontWeight: 700 }}>◆ GEMINI · 2.0 FLASH</div>
                  <div style={{ fontSize: '11px', color: C.faint, marginBottom: '6px', fontFamily: 'monospace' }}>IMPACT: <span style={{ color: IMP[a.geminiAnalysis.impact]?.c || '#fff', fontWeight: 700 }}>{a.geminiAnalysis.impact}</span></div>
                  <div style={{ fontSize: '13px', color: '#bcd4ff', lineHeight: 1.6 }}>{a.geminiAnalysis.verdict}</div>
                </div>
              )}
            </div>
          ) : a.confirmStatus === 'ANALYZING' ? (
            <div style={{ fontSize: '12px', color: C.faint, fontFamily: 'monospace', marginBottom: '16px' }}>○ AI analyzing...</div>
          ) : null}

          {/* Article body (auto-loaded) */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '16px 18px' }}>
            {loadingArt && <div style={{ fontSize: '12px', color: C.faint, fontFamily: 'monospace' }}>○ Loading full article...</div>}
            {!loadingArt && article && article.split('\n\n').map((p, i) => (
              <p key={i} style={{ fontSize: '14px', lineHeight: 1.8, color: C.dim, marginBottom: '12px' }}>{p}</p>
            ))}
            {a.link && (
              <a href={a.link} target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-block', marginTop: '8px', color: C.dim, fontSize: '11px',
                textDecoration: 'none', border: `1px solid ${C.border2}`, padding: '6px 14px',
                fontFamily: 'monospace', letterSpacing: '1px', borderRadius: '3px',
              }}>↗ OPEN ORIGINAL</a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── WATCHLIST PANEL ──
function WatchPanel({ items, onAdd, onRemove, onClose }) {
  const [symbol, setSymbol] = useState(''); const [name, setName] = useState(''); const [cat, setCat] = useState('Stock')
  const add = async () => { if (!symbol.trim()) return; await onAdd(symbol, name, cat); setSymbol(''); setName('') }
  const inp = { width: '100%', background: C.panel, border: `1px solid ${C.border}`, color: C.text, padding: '10px 12px', fontSize: '13px', fontFamily: 'monospace', marginBottom: '10px', outline: 'none', borderRadius: '3px' }
  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(380px,100%)', background: C.bg, borderLeft: `1px solid ${C.border}`, zIndex: 100, display: 'flex', flexDirection: 'column', boxShadow: '-10px 0 40px rgba(0,0,0,0.6)' }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: C.amber, fontWeight: 700, fontSize: '13px', letterSpacing: '2px', fontFamily: 'monospace' }}>★ WATCHLIST</span>
        <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.dim, padding: '5px 11px', fontSize: '12px', cursor: 'pointer', fontFamily: 'monospace', borderRadius: '3px' }}>✕ CLOSE</button>
      </div>
      <div style={{ padding: '18px 20px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: '10px', color: C.faint, letterSpacing: '2px', marginBottom: '12px', fontFamily: 'monospace' }}>ADD NEW</div>
        <input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="Symbol (AAPL, BTC, Gold)" style={inp} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name (optional)" style={inp} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={inp}>
          <option>Stock</option><option>Forex</option><option>Crypto</option><option>Commodity</option><option>Index</option>
        </select>
        <button onClick={add} style={{ width: '100%', background: C.amber, border: 'none', color: C.bg, padding: '10px', fontSize: '12px', fontFamily: 'monospace', cursor: 'pointer', letterSpacing: '1.5px', fontWeight: 700, borderRadius: '3px' }}>+ ADD TO WATCHLIST</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {items.length === 0 && <div style={{ padding: '30px 20px', color: C.faint, fontSize: '12px', textAlign: 'center', fontFamily: 'monospace', lineHeight: 1.6 }}>Empty watchlist.<br />Add your first instrument.</div>}
        {items.map(it => (
          <div key={it.id} style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.amber, fontWeight: 700, fontSize: '14px', fontFamily: 'monospace' }}>{it.symbol}</div>
              {it.name && <div style={{ color: C.dim, fontSize: '12px', marginTop: '2px' }}>{it.name}</div>}
              <div style={{ color: C.faint, fontSize: '10px', fontFamily: 'monospace', letterSpacing: '1px', marginTop: '3px' }}>{it.category}</div>
            </div>
            <button onClick={() => onRemove(it.id)} style={{ background: 'transparent', border: '1px solid #7f1d1d', color: '#ff6b6b', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontFamily: 'monospace', borderRadius: '3px' }}>REMOVE</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── MAIN APP ──
export default function App() {
  const isMobile = useIsMobile()
  const [articles, setArticles] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [tickerIdx, setTickerIdx] = useState(0)
  const [watchlist, setWatchlist] = useState([])
  const [readIds, setReadIds] = useState(new Set())
  const [showWatch, setShowWatch] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const queueRef = useRef([])
  const FILTERS = ['ALL', '🔴 HIGH', '✓ CONFIRMED', '★ WATCHING', 'FOREX', 'STOCKS', 'CRYPTO', 'COMMODITIES', 'MACRO']

  const analyzeOne = useCallback(async (article) => {
    const result = await analyzeWithBothAIs(article)
    setArticles(prev => prev.map(a => a.id === article.id ? { ...a, ...result } : a))
    if (result.impact === 'HIGH' && result.confirmStatus === 'CONFIRMED') {
      if ('Notification' in window && Notification.permission === 'granted')
        new Notification(`🔴 ${article.title}`, { body: result.groqAnalysis?.verdict || result.geminiAnalysis?.verdict || '', icon: '/icon.svg' })
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const o = ctx.createOscillator(), g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination); o.frequency.value = 880
        g.gain.setValueAtTime(0.15, ctx.currentTime)
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
        o.start(); o.stop(ctx.currentTime + 0.4)
      } catch (e) {}
    }
  }, [])

  const loadNews = useCallback(async () => {
    try {
      const news = await fetchNews()
      if (!news.length) { setLoading(false); return }
      const cached = await getCachedAnalyses(news.map(n => n.id))
      setArticles(prev => {
        const map = {}; prev.forEach(a => map[a.id] = a)
        return news.map(n => ({ ...n, ...(map[n.id] || {}), ...(cached[n.id] || {}) }))
      })
      setLoading(false); setLastUpdated(new Date())
      // Queue uncached for analysis, throttled
      const toAnalyze = news.filter(n => !cached[n.id] && !queueRef.current.includes(n.id))
      queueRef.current.push(...toAnalyze.map(n => n.id))
      for (let i = 0; i < toAnalyze.length; i += 2) {
        await Promise.all(toAnalyze.slice(i, i + 2).map(analyzeOne))
        await new Promise(r => setTimeout(r, 400))
      }
    } catch (e) { setLoading(false) }
  }, [analyzeOne])

  useEffect(() => {
    loadNews()
    getWatchlist().then(setWatchlist)
    getReadArticleIds().then(setReadIds)
    const t = setInterval(loadNews, 30000)
    if ('Notification' in window) Notification.requestPermission()
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
    return () => clearInterval(t)
  }, [loadNews])

  useEffect(() => {
    if (!articles.length) return
    const t = setInterval(() => setTickerIdx(i => (i + 1) % articles.length), 5000)
    return () => clearInterval(t)
  }, [articles.length])

  const handleRead = useCallback((id) => {
    setReadIds(prev => { if (prev.has(id)) return prev; markAsRead(id); return new Set([...prev, id]) })
  }, [])

  const high = articles.filter(a => a.impact === 'HIGH')
  const filtered = articles.filter(a => {
    if (filter === 'ALL') return true
    if (filter === '🔴 HIGH') return a.impact === 'HIGH'
    if (filter === '✓ CONFIRMED') return a.confirmStatus === 'CONFIRMED'
    if (filter === '★ WATCHING') return matchesWatch(a, watchlist)
    if (filter === 'FOREX') return a.category === 'Forex' || (a.instruments || []).some(i => ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'].some(x => i.includes(x)))
    if (filter === 'STOCKS') return a.category === 'Stocks' || (a.instruments || []).some(i => ['S&P', 'Nasdaq', 'AAPL', 'TSLA', 'Nikkei', 'DAX'].some(x => i.includes(x)))
    if (filter === 'CRYPTO') return a.category === 'Crypto' || (a.instruments || []).some(i => ['BTC', 'ETH', 'Bitcoin', 'Crypto'].some(x => i.includes(x)))
    if (filter === 'COMMODITIES') return a.category === 'Commodities' || (a.instruments || []).some(i => ['Oil', 'Gold', 'Silver', 'WTI', 'Brent'].some(x => i.includes(x)))
    if (filter === 'MACRO') return a.category === 'Macro'
    return true
  })

  const ticker = high[tickerIdx % Math.max(high.length, 1)] || articles[tickerIdx % Math.max(articles.length, 1)]
  const btn = (active, isStar) => ({
    background: active ? (isStar ? C.amber : C.accent) : 'transparent',
    color: active ? C.bg : C.faint,
    border: `1px solid ${active ? (isStar ? C.amber : C.accent) : C.border}`,
    padding: '5px 12px', fontSize: '10.5px', fontFamily: 'monospace', fontWeight: 700,
    cursor: 'pointer', letterSpacing: '0.5px', flexShrink: 0, whiteSpace: 'nowrap', borderRadius: '3px',
  })

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: C.bg, color: C.text, height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* HEADER */}
      <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: isMobile ? '11px 14px' : '12px 22px', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        <span style={{ color: C.accent, fontWeight: 700, fontSize: isMobile ? '13px' : '15px', letterSpacing: isMobile ? '2px' : '3px', fontFamily: 'monospace' }}>◆ TERMINAL</span>
        {!isMobile && <span style={{ color: C.faint, fontSize: '11px', fontFamily: 'monospace' }}>{loading ? 'CONNECTING...' : `${articles.length} FLASHES · ${high.length} HIGH`}</span>}
        <div style={{ flex: 1 }} />
        {!isMobile && lastUpdated && <span style={{ color: C.ghost, fontSize: '10px', fontFamily: 'monospace' }}>SYNC {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>}
        <button onClick={() => setShowWatch(true)} style={{ background: 'transparent', border: '1px solid #78350f', color: C.amber, padding: '5px 12px', fontSize: '11px', fontFamily: 'monospace', cursor: 'pointer', letterSpacing: '1px', fontWeight: 700, borderRadius: '3px' }}>★ {watchlist.length}</button>
        <button onClick={loadNews} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.accent, padding: '5px 12px', fontSize: '11px', fontFamily: 'monospace', cursor: 'pointer', borderRadius: '3px' }}>↺</button>
      </div>

      {/* TICKER */}
      <div style={{ background: 'linear-gradient(90deg, rgba(255,77,77,0.15), rgba(255,77,77,0.02))', borderBottom: '1px solid rgba(255,77,77,0.2)', padding: '7px 18px', fontSize: '12px', color: '#ffb3b3', display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0, overflow: 'hidden' }}>
        <span style={{ color: C.red, fontWeight: 700, flexShrink: 0, letterSpacing: '1.5px', fontFamily: 'monospace', fontSize: '11px' }}>● LIVE</span>
        <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontWeight: 500 }}>{ticker?.title || 'Scanning live feeds...'}</span>
      </div>

      {/* FILTERS */}
      <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: '9px 14px', display: 'flex', gap: '6px', flexShrink: 0, overflowX: 'auto', alignItems: 'center' }}>
        {FILTERS.map(f => <button key={f} onClick={() => setFilter(f)} style={btn(filter === f, f.includes('★'))}>{f}</button>)}
      </div>

      {/* FEED (single column, centered) */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: '820px' }}>
          {loading && <div style={{ padding: '50px 20px', color: C.faint, fontSize: '12px', textAlign: 'center', letterSpacing: '2px', fontFamily: 'monospace' }}>○ LOADING LIVE FEEDS...</div>}
          {!loading && filtered.length === 0 && <div style={{ padding: '50px 20px', color: C.faint, fontSize: '12px', textAlign: 'center', fontFamily: 'monospace' }}>NO FLASHES IN THIS FILTER</div>}
          {filtered.map(a => (
            <FlashItem
              key={a.id}
              a={a}
              expanded={expandedId === a.id}
              onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
              isWatched={matchesWatch(a, watchlist)}
              onRead={handleRead}
              isMobile={isMobile}
            />
          ))}
        </div>
      </div>

      {showWatch && <WatchPanel items={watchlist} onAdd={async (s, n, c) => { await addToWatchlist(s, n, c); setWatchlist(await getWatchlist()) }} onRemove={async (id) => { await removeFromWatchlist(id); setWatchlist(await getWatchlist()) }} onClose={() => setShowWatch(false)} />}
    </div>
  )
}
