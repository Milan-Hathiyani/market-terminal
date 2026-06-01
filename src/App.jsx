import { useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchNews, analyzeWithBothAIs, getCachedAnalyses,
  getWatchlist, addToWatchlist, removeFromWatchlist,
  getReadArticleIds, markAsRead, fetchFullArticle,
} from './services'

// ── PREMIUM THEME ──
const C = {
  bg: '#0e1015', panel: '#15191f', panel2: '#1a1f27',
  border: '#232932', border2: '#2d3540',
  text: '#eef1f6', dim: '#98a1b2', faint: '#5b6575', ghost: '#3b4350',
  gold: '#f5b13d', goldDim: '#bd8629',
  green: '#34d399', red: '#f87171', blue: '#60a5fa',
}
const IMP = {
  HIGH:   { c: '#f87171', bg: 'rgba(248,113,113,0.13)', label: 'HIGH' },
  MEDIUM: { c: '#f5b13d', bg: 'rgba(245,177,61,0.13)', label: 'MED' },
  LOW:    { c: '#34d399', bg: 'rgba(52,211,153,0.10)', label: 'LOW' },
}
const CON = {
  CONFIRMED: { icon: '✓', c: '#34d399', label: 'CONFIRMED' },
  DISPUTED:  { icon: '!', c: '#f5b13d', label: 'DISPUTED' },
  REVIEW:    { icon: '?', c: '#f87171', label: 'REVIEW' },
  ANALYZING: { icon: '○', c: '#5b6575', label: 'ANALYZING' },
}
const FONT = "'Hanken Grotesk', system-ui, sans-serif"
const MONO = "'IBM Plex Mono', monospace"

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

// ── Toggle switch ──
function Toggle({ on, onClick, label, color }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent',
      border: 'none', cursor: 'pointer', padding: '4px 2px',
    }}>
      <span style={{
        width: '36px', height: '20px', borderRadius: '12px', position: 'relative',
        background: on ? color : C.border2, transition: 'background 0.2s', flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: '2px', left: on ? '18px' : '2px',
          width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s',
        }} />
      </span>
      <span style={{ fontSize: '11px', fontWeight: 700, color: on ? color : C.faint, fontFamily: MONO, letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

function Chip({ inst }) {
  const up = inst.includes('↑'), dn = inst.includes('↓')
  return (
    <span style={{
      fontSize: '12px', padding: '3px 9px', fontFamily: MONO, fontWeight: 700,
      borderRadius: '4px', whiteSpace: 'nowrap',
      border: `1px solid ${up ? '#15803d' : dn ? '#b91c1c' : C.border2}`,
      background: up ? 'rgba(52,211,153,0.1)' : dn ? 'rgba(248,113,113,0.1)' : 'transparent',
      color: up ? C.green : dn ? C.red : C.dim,
    }}>{inst}</span>
  )
}

// ── FLASH ITEM ──
function FlashItem({ a, expanded, onToggle, isWatched, onRead, isMobile, isNew }) {
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
    <div className={isNew ? 'flash-new' : ''} style={{
      borderBottom: `1px solid ${C.border}`,
      borderLeft: `3px solid ${isWatched ? C.gold : expanded ? C.gold : imp.c}`,
      background: expanded ? 'rgba(245,177,61,0.04)' : 'transparent',
      transition: 'background 0.15s',
    }}>
      <div onClick={onToggle} style={{
        display: 'flex', alignItems: 'flex-start', gap: '13px',
        padding: isMobile ? '14px 15px' : '15px 20px', cursor: 'pointer',
      }}>
        <div style={{
          fontFamily: MONO, fontSize: '14px', color: C.faint, fontWeight: 600,
          fontVariantNumeric: 'tabular-nums', flexShrink: 0, paddingTop: '2px', minWidth: '44px',
        }}>{fmtTime(a.pubDate)}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '3px', background: imp.bg, color: imp.c, letterSpacing: '0.5px', fontFamily: MONO }}>{imp.label}</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: con.c, fontFamily: MONO }}>{con.icon} {con.label}</span>
            {isWatched && <span style={{ color: C.gold, fontSize: '13px' }}>★</span>}
            {isNew && <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '3px', background: C.gold, color: C.bg, letterSpacing: '0.5px', fontFamily: MONO }}>NEW</span>}
            <span style={{ fontSize: '11px', color: C.ghost, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: MONO }}>{a.source}</span>
            <span style={{ fontSize: '11px', color: C.ghost, marginLeft: 'auto', fontFamily: MONO }}>{a.time}</span>
          </div>

          <div style={{
            fontSize: isMobile ? '16px' : '17px', lineHeight: 1.4,
            color: expanded ? C.text : '#c5cdda', fontWeight: 600, fontFamily: FONT,
            letterSpacing: '-0.2px',
          }}>{a.title}</div>

          {(a.instruments || []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '9px' }}>
              {a.instruments.slice(0, expanded ? 99 : 5).map((inst, i) => <Chip key={i} inst={inst} />)}
            </div>
          )}
        </div>

        <div style={{ color: C.faint, fontSize: '13px', flexShrink: 0, paddingTop: '3px', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>▸</div>
      </div>

      {expanded && (
        <div style={{ padding: isMobile ? '0 15px 20px 15px' : '0 20px 22px 20px' }}>
          {/* Summary standfirst */}
          {(a.aiSummary || a.summary) && (
            <div style={{
              fontSize: '15px', lineHeight: 1.6, color: C.text, fontWeight: 500,
              fontFamily: FONT, marginBottom: '18px', paddingLeft: '14px',
              borderLeft: `2px solid ${C.gold}`,
            }}>{a.aiSummary || a.summary}</div>
          )}

          {/* AI dual verification */}
          {(a.groqAnalysis || a.geminiAnalysis) ? (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {a.groqAnalysis && (
                <div style={{ flex: 1, minWidth: '230px', background: 'rgba(52,211,153,0.05)', border: '1px solid #15803d', padding: '13px 15px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '10px', color: C.green, letterSpacing: '1px', marginBottom: '8px', fontFamily: MONO, fontWeight: 700 }}>◆ GROQ · LLAMA 3.3</div>
                  <div style={{ fontSize: '11px', color: C.faint, marginBottom: '6px', fontFamily: MONO }}>IMPACT: <span style={{ color: IMP[a.groqAnalysis.impact]?.c || '#fff', fontWeight: 700 }}>{a.groqAnalysis.impact}</span></div>
                  <div style={{ fontSize: '14px', color: '#a7f3d0', lineHeight: 1.6, fontFamily: FONT }}>{a.groqAnalysis.verdict}</div>
                </div>
              )}
              {a.geminiAnalysis && (
                <div style={{ flex: 1, minWidth: '230px', background: 'rgba(96,165,250,0.05)', border: '1px solid #1e4976', padding: '13px 15px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '10px', color: C.blue, letterSpacing: '1px', marginBottom: '8px', fontFamily: MONO, fontWeight: 700 }}>◆ GEMINI · 2.0 FLASH</div>
                  <div style={{ fontSize: '11px', color: C.faint, marginBottom: '6px', fontFamily: MONO }}>IMPACT: <span style={{ color: IMP[a.geminiAnalysis.impact]?.c || '#fff', fontWeight: 700 }}>{a.geminiAnalysis.impact}</span></div>
                  <div style={{ fontSize: '14px', color: '#bfdbfe', lineHeight: 1.6, fontFamily: FONT }}>{a.geminiAnalysis.verdict}</div>
                </div>
              )}
            </div>
          ) : a.confirmStatus === 'ANALYZING' ? (
            <div style={{ fontSize: '13px', color: C.faint, fontFamily: MONO, marginBottom: '16px' }}>○ AI analyzing...</div>
          ) : null}

          {/* Full article */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '18px 20px' }}>
            {loadingArt && <div style={{ fontSize: '13px', color: C.faint, fontFamily: MONO }}>○ Loading full article...</div>}
            {!loadingArt && article && article.split('\n\n').map((p, i) => (
              <p key={i} style={{ fontSize: '15px', lineHeight: 1.75, color: C.dim, marginBottom: '13px', fontFamily: FONT }}>{p}</p>
            ))}
            {a.link && (
              <a href={a.link} target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-block', marginTop: '8px', color: C.dim, fontSize: '12px',
                textDecoration: 'none', border: `1px solid ${C.border2}`, padding: '7px 15px',
                fontFamily: MONO, letterSpacing: '1px', borderRadius: '4px',
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
  const inp = { width: '100%', background: C.panel, border: `1px solid ${C.border}`, color: C.text, padding: '11px 13px', fontSize: '14px', fontFamily: MONO, marginBottom: '11px', outline: 'none', borderRadius: '5px' }
  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(390px,100%)', background: C.bg, borderLeft: `1px solid ${C.border}`, zIndex: 100, display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 40px rgba(0,0,0,0.6)' }}>
      <div style={{ padding: '17px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: C.gold, fontWeight: 700, fontSize: '14px', letterSpacing: '2px', fontFamily: MONO }}>★ WATCHLIST</span>
        <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.dim, padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: MONO, borderRadius: '4px' }}>✕ CLOSE</button>
      </div>
      <div style={{ padding: '20px 22px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: '10px', color: C.faint, letterSpacing: '2px', marginBottom: '13px', fontFamily: MONO }}>ADD NEW</div>
        <input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="Symbol (AAPL, BTC, Gold)" style={inp} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name (optional)" style={inp} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={inp}>
          <option>Stock</option><option>Forex</option><option>Crypto</option><option>Commodity</option><option>Index</option>
        </select>
        <button onClick={add} style={{ width: '100%', background: C.gold, border: 'none', color: C.bg, padding: '11px', fontSize: '13px', fontFamily: MONO, cursor: 'pointer', letterSpacing: '1.5px', fontWeight: 700, borderRadius: '5px' }}>+ ADD TO WATCHLIST</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {items.length === 0 && <div style={{ padding: '32px 22px', color: C.faint, fontSize: '13px', textAlign: 'center', fontFamily: MONO, lineHeight: 1.6 }}>Empty watchlist.<br />Add your first instrument.</div>}
        {items.map(it => (
          <div key={it.id} style={{ padding: '15px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.gold, fontWeight: 700, fontSize: '15px', fontFamily: MONO }}>{it.symbol}</div>
              {it.name && <div style={{ color: C.dim, fontSize: '13px', marginTop: '2px', fontFamily: FONT }}>{it.name}</div>}
              <div style={{ color: C.faint, fontSize: '10px', fontFamily: MONO, letterSpacing: '1px', marginTop: '3px' }}>{it.category}</div>
            </div>
            <button onClick={() => onRemove(it.id)} style={{ background: 'transparent', border: '1px solid #7f1d1d', color: C.red, padding: '5px 11px', fontSize: '11px', cursor: 'pointer', fontFamily: MONO, borderRadius: '4px' }}>REMOVE</button>
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
  const [importantOnly, setImportantOnly] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [tickerIdx, setTickerIdx] = useState(0)
  const [watchlist, setWatchlist] = useState([])
  const [readIds, setReadIds] = useState(new Set())
  const [showWatch, setShowWatch] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [newIds, setNewIds] = useState(new Set())
  const seenRef = useRef(new Set())
  const soundRef = useRef(true)
  const queueRef = useRef([])
  const FILTERS = ['ALL', 'FOREX', 'STOCKS', 'CRYPTO', 'COMMODITIES', 'MACRO']

  useEffect(() => { soundRef.current = soundOn }, [soundOn])

  const analyzeOne = useCallback(async (article) => {
    const result = await analyzeWithBothAIs(article)
    setArticles(prev => prev.map(a => a.id === article.id ? { ...a, ...result } : a))
    if (result.impact === 'HIGH' && result.confirmStatus === 'CONFIRMED') {
      if ('Notification' in window && Notification.permission === 'granted')
        new Notification(`🔴 ${article.title}`, { body: result.groqAnalysis?.verdict || result.geminiAnalysis?.verdict || '', icon: '/icon.svg' })
      if (soundRef.current) {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)()
          const o = ctx.createOscillator(), g = ctx.createGain()
          o.connect(g); g.connect(ctx.destination); o.frequency.value = 880
          g.gain.setValueAtTime(0.15, ctx.currentTime)
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
          o.start(); o.stop(ctx.currentTime + 0.4)
        } catch (e) {}
      }
    }
  }, [])

  const loadNews = useCallback(async () => {
    try {
      const news = await fetchNews()
      if (!news.length) { setLoading(false); return }
      const cached = await getCachedAnalyses(news.map(n => n.id))

      // Detect genuinely new items (skip very first load)
      if (seenRef.current.size > 0) {
        const fresh = news.filter(n => !seenRef.current.has(n.id)).map(n => n.id)
        if (fresh.length) {
          setNewIds(new Set(fresh))
          setTimeout(() => setNewIds(new Set()), 4500)
        }
      }
      news.forEach(n => seenRef.current.add(n.id))

      setArticles(prev => {
        const map = {}; prev.forEach(a => map[a.id] = a)
        return news.map(n => ({ ...n, ...(map[n.id] || {}), ...(cached[n.id] || {}) }))
      })
      setLoading(false); setLastUpdated(new Date())

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
  const q = search.trim().toLowerCase()
  const filtered = articles.filter(a => {
    if (importantOnly && a.impact !== 'HIGH') return false
    if (q && !`${a.title} ${a.summary || ''} ${(a.instruments || []).join(' ')}`.toLowerCase().includes(q)) return false
    if (filter === 'ALL') return true
    if (filter === 'FOREX') return a.category === 'Forex' || (a.instruments || []).some(i => ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'].some(x => i.includes(x)))
    if (filter === 'STOCKS') return a.category === 'Stocks' || (a.instruments || []).some(i => ['S&P', 'Nasdaq', 'AAPL', 'TSLA', 'Nikkei', 'DAX'].some(x => i.includes(x)))
    if (filter === 'CRYPTO') return a.category === 'Crypto' || (a.instruments || []).some(i => ['BTC', 'ETH', 'Bitcoin', 'Crypto'].some(x => i.includes(x)))
    if (filter === 'COMMODITIES') return a.category === 'Commodities' || (a.instruments || []).some(i => ['Oil', 'Gold', 'Silver', 'WTI', 'Brent'].some(x => i.includes(x)))
    if (filter === 'MACRO') return a.category === 'Macro'
    return true
  })

  const ticker = high[tickerIdx % Math.max(high.length, 1)] || articles[tickerIdx % Math.max(articles.length, 1)]
  const fBtn = (active) => ({
    background: active ? C.gold : 'transparent', color: active ? C.bg : C.faint,
    border: `1px solid ${active ? C.gold : C.border}`, padding: '6px 14px', fontSize: '11px',
    fontFamily: MONO, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.5px',
    flexShrink: 0, whiteSpace: 'nowrap', borderRadius: '4px',
  })
  const iconBtn = { background: 'transparent', border: `1px solid ${C.border}`, color: C.dim, padding: '7px 11px', fontSize: '13px', fontFamily: MONO, cursor: 'pointer', borderRadius: '5px' }

  return (
    <div style={{ fontFamily: FONT, background: C.bg, color: C.text, height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* HEADER */}
      <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: isMobile ? '12px 15px' : '13px 24px', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        <span style={{ color: C.gold, fontWeight: 800, fontSize: isMobile ? '15px' : '17px', letterSpacing: isMobile ? '1px' : '2px', fontFamily: MONO }}>◆ TERMINAL</span>
        {!isMobile && <span style={{ color: C.faint, fontSize: '12px', fontFamily: MONO }}>{loading ? 'CONNECTING...' : `${articles.length} FLASHES · ${high.length} HIGH`}</span>}

        {!isMobile && (
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍  Search headlines..." style={{
            marginLeft: 'auto', width: '230px', background: C.bg, border: `1px solid ${C.border}`,
            color: C.text, padding: '8px 13px', fontSize: '13px', fontFamily: FONT, outline: 'none', borderRadius: '6px',
          }} />
        )}
        {isMobile && <div style={{ flex: 1 }} />}

        <Toggle on={importantOnly} onClick={() => setImportantOnly(v => !v)} label={isMobile ? '⚡' : '⚡ IMPORTANT'} color={C.red} />
        <button onClick={() => setSoundOn(v => !v)} style={{ ...iconBtn, color: soundOn ? C.gold : C.faint }} title="Toggle sound">{soundOn ? '🔊' : '🔇'}</button>
        <button onClick={() => setShowWatch(true)} style={{ ...iconBtn, border: '1px solid #6b4a16', color: C.gold }}>★ {watchlist.length}</button>
        <button onClick={loadNews} style={{ ...iconBtn, color: C.green }}>↺</button>
      </div>

      {/* Mobile search row */}
      {isMobile && (
        <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: '0 15px 11px 15px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍  Search headlines..." style={{
            width: '100%', background: C.bg, border: `1px solid ${C.border}`, color: C.text,
            padding: '9px 13px', fontSize: '14px', fontFamily: FONT, outline: 'none', borderRadius: '6px',
          }} />
        </div>
      )}

      {/* TICKER */}
      <div style={{ background: 'linear-gradient(90deg, rgba(248,113,113,0.14), rgba(248,113,113,0.02))', borderBottom: '1px solid rgba(248,113,113,0.2)', padding: '8px 20px', fontSize: '13px', color: '#fca5a5', display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0, overflow: 'hidden' }}>
        <span className="live-dot" style={{ color: C.red, fontWeight: 700, flexShrink: 0, letterSpacing: '1.5px', fontFamily: MONO, fontSize: '11px' }}>● LIVE</span>
        <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontWeight: 500, fontFamily: FONT }}>{ticker?.title || 'Scanning live feeds...'}</span>
      </div>

      {/* FILTERS */}
      <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: '10px 15px', display: 'flex', gap: '7px', flexShrink: 0, overflowX: 'auto', alignItems: 'center' }}>
        {FILTERS.map(f => <button key={f} onClick={() => setFilter(f)} style={fBtn(filter === f)}>{f}</button>)}
        <span style={{ marginLeft: 'auto', color: C.ghost, fontSize: '11px', fontFamily: MONO, flexShrink: 0, paddingLeft: '10px' }}>{filtered.length} SHOWN</span>
      </div>

      {/* FEED */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: '860px' }}>
          {loading && <div style={{ padding: '54px 20px', color: C.faint, fontSize: '13px', textAlign: 'center', letterSpacing: '2px', fontFamily: MONO }}>○ LOADING LIVE FEEDS...</div>}
          {!loading && filtered.length === 0 && <div style={{ padding: '54px 20px', color: C.faint, fontSize: '13px', textAlign: 'center', fontFamily: MONO }}>NO FLASHES MATCH</div>}
          {filtered.map(a => (
            <FlashItem
              key={a.id} a={a}
              expanded={expandedId === a.id}
              onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
              isWatched={matchesWatch(a, watchlist)}
              onRead={handleRead}
              isMobile={isMobile}
              isNew={newIds.has(a.id)}
            />
          ))}
        </div>
      </div>

      {showWatch && <WatchPanel items={watchlist} onAdd={async (s, n, c) => { await addToWatchlist(s, n, c); setWatchlist(await getWatchlist()) }} onRemove={async (id) => { await removeFromWatchlist(id); setWatchlist(await getWatchlist()) }} onClose={() => setShowWatch(false)} />}
    </div>
  )
}
