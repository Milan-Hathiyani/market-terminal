import { useState, useEffect, useCallback } from 'react'
import {
  fetchNews, analyzeWithBothAIs, getCachedAnalyses,
  getWatchlist, addToWatchlist, removeFromWatchlist,
  getReadArticleIds, markAsRead, fetchFullArticle,
} from './services'

// ── DESIGN TOKENS ─────────────────────────────────────────
const COL = {
  bg: '#07080c',
  panel: '#0c0e14',
  panelLight: '#101319',
  border: '#1a1f2e',
  borderLight: '#252b3d',
  text: '#e5e9f2',
  textDim: '#8b95a8',
  textFaint: '#4a5366',
  accent: '#00ff9c',
  accentDim: '#0d7d4e',
}

const IMP = {
  HIGH:   { bg: '#dc2626', text: '#fecaca', glow: 'rgba(220,38,38,0.4)' },
  MEDIUM: { bg: '#d97706', text: '#fde68a', glow: 'rgba(217,119,6,0.4)' },
  LOW:    { bg: '#16a34a', text: '#bbf7d0', glow: 'rgba(22,163,74,0.4)' },
}
const CON = {
  CONFIRMED: { icon: '✅', color: '#22c55e', label: 'CONFIRMED' },
  DISPUTED:  { icon: '⚠️', color: '#eab308', label: 'DISPUTED' },
  REVIEW:    { icon: '🔍', color: '#ef4444', label: 'REVIEW' },
  ANALYZING: { icon: '◌',  color: '#475569', label: 'ANALYZING' },
}

// ── HOOKS ─────────────────────────────────────────────────
function useIsMobile() {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return m
}

function matchesWatch(article, watchlist) {
  const text = `${article.title} ${article.summary || ''} ${(article.instruments || []).join(' ')}`
  return watchlist.some(w => {
    try {
      if (new RegExp(`\\b${w.symbol}\\b`, 'i').test(text)) return true
      if (w.name && new RegExp(`\\b${w.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) return true
    } catch (e) {}
    return false
  })
}

// ── COMPONENTS ────────────────────────────────────────────
function Card({ a, selected, onClick, isRead, isWatched }) {
  const imp = IMP[a.impact] || IMP.LOW
  const con = CON[a.confirmStatus] || CON.ANALYZING
  return (
    <div
      onClick={onClick}
      style={{
        padding: '15px 18px',
        borderBottom: `1px solid ${COL.border}`,
        cursor: 'pointer',
        background: selected ? 'rgba(0,255,156,0.05)' : 'transparent',
        borderLeft: selected
          ? `3px solid ${COL.accent}`
          : isWatched
            ? '3px solid #f59e0b'
            : '3px solid transparent',
        opacity: isRead && !selected ? 0.5 : 1,
        transition: 'background 0.15s, opacity 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <span style={{
          background: imp.bg, color: '#fff', fontSize: '10px', fontWeight: 700,
          padding: '2px 8px', letterSpacing: '0.5px', borderRadius: '2px',
          boxShadow: `0 0 0 1px ${imp.bg}30`,
        }}>{a.impact}</span>
        <span style={{ color: con.color, fontSize: '10px', fontWeight: 700 }}>
          {con.icon} {con.label}
        </span>
        {isWatched && <span style={{ color: '#f59e0b', fontSize: '14px', lineHeight: 1 }}>★</span>}
        <span style={{ color: COL.textFaint, fontSize: '10px', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{a.time}</span>
      </div>
      <div style={{ color: COL.textFaint, fontSize: '10px', marginBottom: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
        {a.source}
      </div>
      <div style={{
        fontSize: '14.5px', lineHeight: 1.45, marginBottom: '10px',
        color: selected ? COL.text : COL.textDim,
        fontFamily: "'Inter', 'IBM Plex Sans', sans-serif",
        fontWeight: 500,
      }}>{a.title}</div>
      {(a.instruments || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {a.instruments.slice(0, 4).map((inst, i) => {
            const isUp = inst.includes('↑')
            const isDn = inst.includes('↓')
            return (
              <span key={i} style={{
                fontSize: '11px', padding: '2px 8px', fontFamily: 'monospace', fontWeight: 700,
                borderRadius: '2px',
                border: `1px solid ${isUp ? '#0f5132' : isDn ? '#7f1d1d' : COL.border}`,
                background: isUp ? 'rgba(34,197,94,0.08)' : isDn ? 'rgba(239,68,68,0.08)' : 'transparent',
                color: isUp ? '#4ade80' : isDn ? '#f87171' : COL.textFaint,
              }}>{inst}</span>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Reader({ a, onBack, isMobile }) {
  const [fullContent, setFullContent] = useState(null)
  const [loadingFull, setLoadingFull] = useState(false)
  const [showFull, setShowFull] = useState(false)

  useEffect(() => { setFullContent(null); setShowFull(false) }, [a?.id])

  const loadFull = async () => {
    if (fullContent) { setShowFull(true); return }
    if (!a?.link) return
    setLoadingFull(true)
    setFullContent(await fetchFullArticle(a.link))
    setShowFull(true)
    setLoadingFull(false)
  }

  if (!a) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', color: COL.textFaint, fontSize: '13px',
      fontFamily: 'monospace', letterSpacing: '2px',
    }}>
      ◆ SELECT AN ARTICLE
    </div>
  )

  const imp = IMP[a.impact] || IMP.LOW
  const con = CON[a.confirmStatus] || CON.ANALYZING

  return (
    <div style={{
      padding: isMobile ? '18px 16px' : '32px 40px',
      overflow: 'auto', height: '100%',
      fontFamily: "'Inter', 'IBM Plex Sans', sans-serif",
    }}>
      {isMobile && (
        <button onClick={onBack} style={{
          background: 'transparent', border: `1px solid ${COL.border}`,
          color: COL.accent, padding: '7px 14px', fontSize: '11px',
          fontFamily: 'monospace', cursor: 'pointer',
          letterSpacing: '1px', marginBottom: '20px', borderRadius: '3px',
        }}>← BACK TO FEED</button>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'center' }}>
        <span style={{
          background: imp.bg, color: '#fff', fontSize: '10px', fontWeight: 700,
          padding: '4px 12px', letterSpacing: '1.5px', borderRadius: '2px',
        }}>{a.impact} IMPACT</span>
        <span style={{
          color: con.color, fontSize: '10px', fontWeight: 700,
          border: `1px solid ${con.color}50`, padding: '4px 12px',
          background: `${con.color}12`, letterSpacing: '1px', borderRadius: '2px',
        }}>{con.icon} {con.label}</span>
        <span style={{ color: COL.textFaint, fontSize: '11px', marginLeft: 'auto', fontFamily: 'monospace' }}>
          {a.source} · {a.time}
        </span>
      </div>

      <h2 style={{
        fontSize: isMobile ? '20px' : '26px',
        lineHeight: 1.3, color: COL.text, marginBottom: '28px',
        fontWeight: 700, letterSpacing: '-0.5px',
      }}>{a.title}</h2>

      {(a.instruments || []).length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            fontSize: '10px', color: COL.textFaint, letterSpacing: '2px',
            marginBottom: '10px', fontFamily: 'monospace',
          }}>AFFECTED INSTRUMENTS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {a.instruments.map((inst, i) => {
              const isUp = inst.includes('↑')
              const isDn = inst.includes('↓')
              return (
                <span key={i} style={{
                  fontSize: '13px', padding: '7px 16px', fontFamily: 'monospace',
                  fontWeight: 700, borderRadius: '2px',
                  border: `1px solid ${isUp ? '#0f5132' : isDn ? '#7f1d1d' : COL.border}`,
                  background: isUp ? 'rgba(34,197,94,0.1)' : isDn ? 'rgba(239,68,68,0.1)' : 'transparent',
                  color: isUp ? '#4ade80' : isDn ? '#f87171' : COL.textFaint,
                }}>{inst}</span>
              )
            })}
          </div>
        </div>
      )}

      {a.confirmStatus !== 'ANALYZING' && (a.groqAnalysis || a.geminiAnalysis) && (
        <div style={{ marginBottom: '28px' }}>
          <div style={{
            fontSize: '10px', color: COL.textFaint, letterSpacing: '2px',
            marginBottom: '12px', fontFamily: 'monospace',
          }}>AI DUAL VERIFICATION</div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {a.groqAnalysis && (
              <div style={{
                flex: 1, minWidth: '240px', background: 'rgba(34,197,94,0.05)',
                border: '1px solid #0f5132', padding: '16px 18px', borderRadius: '3px',
              }}>
                <div style={{
                  fontSize: '10px', color: '#4ade80', letterSpacing: '1.5px',
                  marginBottom: '10px', fontFamily: 'monospace', fontWeight: 700,
                }}>◆ GROQ · LLAMA 3.3</div>
                <div style={{ fontSize: '11px', color: COL.textFaint, marginBottom: '8px', fontFamily: 'monospace' }}>
                  IMPACT: <span style={{ color: IMP[a.groqAnalysis.impact]?.text || '#fff', fontWeight: 700 }}>{a.groqAnalysis.impact}</span>
                </div>
                <div style={{ fontSize: '13px', color: '#86efac', lineHeight: 1.6 }}>{a.groqAnalysis.verdict}</div>
              </div>
            )}
            {a.geminiAnalysis && (
              <div style={{
                flex: 1, minWidth: '240px', background: 'rgba(59,130,246,0.05)',
                border: '1px solid #1e3a5f', padding: '16px 18px', borderRadius: '3px',
              }}>
                <div style={{
                  fontSize: '10px', color: '#60a5fa', letterSpacing: '1.5px',
                  marginBottom: '10px', fontFamily: 'monospace', fontWeight: 700,
                }}>◆ GEMINI · 2.5 FLASH</div>
                <div style={{ fontSize: '11px', color: COL.textFaint, marginBottom: '8px', fontFamily: 'monospace' }}>
                  IMPACT: <span style={{ color: IMP[a.geminiAnalysis.impact]?.text || '#fff', fontWeight: 700 }}>{a.geminiAnalysis.impact}</span>
                </div>
                <div style={{ fontSize: '13px', color: '#93c5fd', lineHeight: 1.6 }}>{a.geminiAnalysis.verdict}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ borderTop: `1px solid ${COL.border}`, paddingTop: '24px' }}>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: COL.textDim, marginBottom: '16px' }}>
          <strong style={{ color: COL.text }}>{a.summary}</strong>
        </p>

        {showFull && fullContent && (
          <div style={{
            marginTop: '20px', padding: '24px',
            background: COL.panel, border: `1px solid ${COL.border}`,
            borderRadius: '3px',
          }}>
            {fullContent.split('\n\n').map((p, i) => (
              <p key={i} style={{ fontSize: '14px', lineHeight: 1.85, color: COL.textDim, marginBottom: '14px' }}>{p}</p>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
          {!showFull && (
            <button onClick={loadFull} disabled={loadingFull} style={{
              background: COL.accent, border: 'none', color: COL.bg,
              padding: '10px 20px', fontSize: '12px', fontFamily: 'monospace',
              cursor: loadingFull ? 'wait' : 'pointer', letterSpacing: '1px',
              fontWeight: 700, borderRadius: '3px',
            }}>{loadingFull ? '◌ LOADING...' : '📄 READ FULL ARTICLE'}</button>
          )}
          {a.link && (
            <a href={a.link} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-block', color: COL.textDim, fontSize: '12px',
              textDecoration: 'none', border: `1px solid ${COL.border}`,
              padding: '10px 18px', fontFamily: 'monospace', letterSpacing: '1px',
              borderRadius: '3px',
            }}>↗ OPEN ORIGINAL</a>
          )}
        </div>
      </div>
    </div>
  )
}

function WatchPanel({ items, onAdd, onRemove, onClose }) {
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Stock')

  const handleAdd = async () => {
    if (!symbol.trim()) return
    await onAdd(symbol, name, category)
    setSymbol(''); setName('')
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: 'min(400px, 100%)', background: COL.bg,
      borderLeft: `1px solid ${COL.border}`, zIndex: 100,
      display: 'flex', flexDirection: 'column',
      boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
    }}>
      <div style={{
        padding: '16px 20px', borderBottom: `1px solid ${COL.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          color: '#f59e0b', fontWeight: 700, fontSize: '13px',
          letterSpacing: '2px', fontFamily: 'monospace',
        }}>★ WATCHLIST</span>
        <button onClick={onClose} style={{
          background: 'transparent', border: `1px solid ${COL.border}`,
          color: COL.textDim, padding: '5px 11px', fontSize: '12px',
          cursor: 'pointer', fontFamily: 'monospace', borderRadius: '3px',
        }}>✕ CLOSE</button>
      </div>

      <div style={{ padding: '18px 20px', borderBottom: `1px solid ${COL.border}` }}>
        <div style={{
          fontSize: '10px', color: COL.textFaint, letterSpacing: '2px',
          marginBottom: '12px', fontFamily: 'monospace',
        }}>ADD NEW</div>
        {[
          { val: symbol, set: setSymbol, ph: 'Symbol (e.g. AAPL, BTC, Gold)' },
          { val: name, set: setName, ph: 'Full name (optional)' },
        ].map((f, i) => (
          <input
            key={i}
            value={f.val}
            onChange={e => f.set(e.target.value)}
            placeholder={f.ph}
            style={{
              width: '100%', background: COL.panel,
              border: `1px solid ${COL.border}`, color: COL.text,
              padding: '10px 12px', fontSize: '13px',
              fontFamily: 'monospace', marginBottom: '10px',
              outline: 'none', borderRadius: '3px',
            }}
          />
        ))}
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={{
            width: '100%', background: COL.panel,
            border: `1px solid ${COL.border}`, color: COL.text,
            padding: '10px 12px', fontSize: '13px',
            fontFamily: 'monospace', marginBottom: '12px',
            outline: 'none', borderRadius: '3px',
          }}
        >
          <option>Stock</option><option>Forex</option><option>Crypto</option>
          <option>Commodity</option><option>Index</option>
        </select>
        <button onClick={handleAdd} style={{
          width: '100%', background: '#f59e0b', border: 'none',
          color: COL.bg, padding: '10px', fontSize: '12px',
          fontFamily: 'monospace', cursor: 'pointer',
          letterSpacing: '1.5px', fontWeight: 700, borderRadius: '3px',
        }}>+ ADD TO WATCHLIST</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {items.length === 0 && (
          <div style={{
            padding: '30px 20px', color: COL.textFaint, fontSize: '12px',
            textAlign: 'center', fontFamily: 'monospace', lineHeight: 1.6,
          }}>
            Empty watchlist.<br/>Add your first instrument above.
          </div>
        )}
        {items.map(item => (
          <div key={item.id} style={{
            padding: '14px 20px', borderBottom: `1px solid ${COL.border}`,
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{
                color: '#f59e0b', fontWeight: 700, fontSize: '14px',
                fontFamily: 'monospace', letterSpacing: '0.5px',
              }}>{item.symbol}</div>
              {item.name && <div style={{ color: COL.textDim, fontSize: '12px', marginTop: '2px' }}>{item.name}</div>}
              <div style={{
                color: COL.textFaint, fontSize: '10px',
                fontFamily: 'monospace', letterSpacing: '1px', marginTop: '3px',
              }}>{item.category}</div>
            </div>
            <button onClick={() => onRemove(item.id)} style={{
              background: 'transparent', border: '1px solid #7f1d1d',
              color: '#f87171', padding: '4px 10px', fontSize: '11px',
              cursor: 'pointer', fontFamily: 'monospace', borderRadius: '3px',
            }}>REMOVE</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── MAIN APP ──────────────────────────────────────────────
export default function App() {
  const isMobile = useIsMobile()
  const [articles, setArticles] = useState([])
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [tickerIdx, setTickerIdx] = useState(0)
  const [watchlist, setWatchlist] = useState([])
  const [readIds, setReadIds] = useState(new Set())
  const [showWatch, setShowWatch] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const FILTERS = ['ALL', 'HIGH', 'CONFIRMED', '★ WATCHING', 'STOCKS', 'FOREX', 'CRYPTO', 'OIL & GOLD']

  const analyzeOne = useCallback(async (article) => {
    const result = await analyzeWithBothAIs(article)
    setArticles(prev => prev.map(a => a.id === article.id ? { ...a, ...result } : a))
    if (result.impact === 'HIGH' && result.confirmStatus === 'CONFIRMED') {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`🔴 ${article.title}`, {
          body: result.groqAnalysis?.verdict || result.geminiAnalysis?.verdict || '',
          icon: '/icon.svg',
        })
      }
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.frequency.value = 880
        g.gain.setValueAtTime(0.15, ctx.currentTime)
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
        o.start(); o.stop(ctx.currentTime + 0.4)
      } catch (e) {}
    }
  }, [])

  const loadNews = useCallback(async () => {
    try {
      const news = await fetchNews()
      if (news.length === 0) { setLoading(false); return }
      const cached = await getCachedAnalyses(news.map(n => n.id))
      setArticles(prev => {
        const map = {}; prev.forEach(a => map[a.id] = a)
        return news.map(n => ({ ...n, ...(map[n.id] || {}), ...(cached[n.id] || {}) }))
      })
      setLoading(false)
      setLastUpdated(new Date())
      // Analyze in batches to avoid hammering APIs
      const toAnalyze = news.filter(n => !cached[n.id])
      for (let i = 0; i < toAnalyze.length; i += 3) {
        Promise.all(toAnalyze.slice(i, i + 3).map(analyzeOne))
        await new Promise(r => setTimeout(r, 500))
      }
    } catch (e) {
      console.error('loadNews error:', e)
      setLoading(false)
    }
  }, [analyzeOne])

  useEffect(() => {
    loadNews()
    getWatchlist().then(setWatchlist)
    getReadArticleIds().then(setReadIds)
    const t = setInterval(loadNews, 60000)
    if ('Notification' in window) Notification.requestPermission()
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
    return () => clearInterval(t)
  }, [loadNews])

  useEffect(() => {
    if (!articles.length) return
    const t = setInterval(() => setTickerIdx(i => (i + 1) % articles.length), 5000)
    return () => clearInterval(t)
  }, [articles.length])

  const handleSelect = async (a) => {
    setSelected(a)
    if (!readIds.has(a.id)) {
      markAsRead(a.id)
      setReadIds(prev => new Set([...prev, a.id]))
    }
  }

  const high = articles.filter(a => a.impact === 'HIGH')
  const filtered = articles.filter(a => {
    if (filter === 'ALL') return true
    if (filter === 'HIGH') return a.impact === 'HIGH'
    if (filter === 'CONFIRMED') return a.confirmStatus === 'CONFIRMED'
    if (filter === '★ WATCHING') return matchesWatch(a, watchlist)
    const inst = a.instruments || []
    if (filter === 'FOREX') return inst.some(i => ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'].some(x => i.includes(x)))
    if (filter === 'CRYPTO') return inst.some(i => ['BTC', 'ETH', 'Bitcoin', 'Crypto'].some(x => i.includes(x)))
    if (filter === 'OIL & GOLD') return inst.some(i => ['Oil', 'Gold', 'Silver', 'WTI', 'Brent', 'Crude'].some(x => i.includes(x)))
    if (filter === 'STOCKS') return inst.some(i => ['S&P', 'Nasdaq', 'Stock', 'Equity', 'Nikkei', 'DAX', 'AAPL', 'TSLA'].some(x => i.includes(x)))
    return true
  })

  const tickerArticle = high[tickerIdx % Math.max(high.length, 1)] || articles[tickerIdx % Math.max(articles.length, 1)]
  const showReader = isMobile ? selected !== null : true
  const showFeed = isMobile ? selected === null : true

  return (
    <div style={{
      fontFamily: "'Inter', 'IBM Plex Sans', system-ui, sans-serif",
      background: COL.bg, color: COL.text, height: '100vh',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* HEADER */}
      <div style={{
        background: COL.panel, borderBottom: `1px solid ${COL.border}`,
        padding: isMobile ? '11px 14px' : '12px 22px',
        display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0,
      }}>
        <span style={{
          color: COL.accent, fontWeight: 700,
          fontSize: isMobile ? '13px' : '15px',
          letterSpacing: isMobile ? '2px' : '3px',
          fontFamily: 'monospace',
        }}>◆ TERMINAL</span>
        {!isMobile && (
          <span style={{ color: COL.textFaint, fontSize: '11px', fontFamily: 'monospace' }}>
            {loading ? 'CONNECTING...' : `${articles.length} ARTICLES · ${high.length} HIGH IMPACT`}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {!isMobile && lastUpdated && (
          <span style={{ color: COL.textFaint, fontSize: '10px', fontFamily: 'monospace' }}>
            UPDATED {lastUpdated.toLocaleTimeString()}
          </span>
        )}
        <button onClick={() => setShowWatch(true)} style={{
          background: 'transparent', border: '1px solid #78350f',
          color: '#f59e0b', padding: '5px 12px', fontSize: '11px',
          fontFamily: 'monospace', cursor: 'pointer',
          letterSpacing: '1px', fontWeight: 700, borderRadius: '3px',
        }}>★ {watchlist.length}</button>
        <button onClick={loadNews} style={{
          background: 'transparent', border: `1px solid ${COL.border}`,
          color: COL.accent, padding: '5px 12px', fontSize: '11px',
          fontFamily: 'monospace', cursor: 'pointer',
          letterSpacing: '1px', borderRadius: '3px',
        }}>↺ REFRESH</button>
      </div>

      {/* BREAKING TICKER */}
      <div style={{
        background: 'linear-gradient(90deg, rgba(220,38,38,0.15), rgba(220,38,38,0.03))',
        borderBottom: '1px solid rgba(220,38,38,0.25)',
        padding: '7px 18px', fontSize: '12px', color: '#fca5a5',
        display: 'flex', gap: '12px', alignItems: 'center',
        flexShrink: 0, overflow: 'hidden',
      }}>
        <span style={{
          color: '#ef4444', fontWeight: 700, flexShrink: 0,
          letterSpacing: '1.5px', fontFamily: 'monospace', fontSize: '11px',
        }}>● LIVE</span>
        <span style={{
          overflow: 'hidden', whiteSpace: 'nowrap',
          textOverflow: 'ellipsis', fontWeight: 500,
        }}>
          {tickerArticle?.title || 'Scanning live feeds for breaking news...'}
        </span>
      </div>

      {/* FILTER BAR */}
      <div style={{
        background: COL.panel, borderBottom: `1px solid ${COL.border}`,
        padding: '9px 14px', display: 'flex', gap: '6px',
        flexShrink: 0, overflowX: 'auto', alignItems: 'center',
      }}>
        {FILTERS.map(f => {
          const isStar = f.includes('★')
          const active = filter === f
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: active ? (isStar ? '#f59e0b' : COL.accent) : 'transparent',
                color: active ? COL.bg : COL.textFaint,
                border: `1px solid ${active ? (isStar ? '#f59e0b' : COL.accent) : COL.border}`,
                padding: '5px 12px', fontSize: '10.5px',
                fontFamily: 'monospace', fontWeight: 700,
                cursor: 'pointer', letterSpacing: '1px',
                flexShrink: 0, whiteSpace: 'nowrap', borderRadius: '3px',
              }}
            >{f}</button>
          )
        })}
      </div>

      {/* MAIN BODY */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {showFeed && (
          <div style={{
            width: isMobile ? '100%' : '420px',
            borderRight: isMobile ? 'none' : `1px solid ${COL.border}`,
            overflow: 'auto', flexShrink: 0, background: COL.bg,
          }}>
            {loading && (
              <div style={{
                padding: '40px 20px', color: COL.textFaint, fontSize: '12px',
                textAlign: 'center', letterSpacing: '2px', fontFamily: 'monospace',
              }}>◌ LOADING LIVE FEEDS...</div>
            )}
            {!loading && filtered.length === 0 && (
              <div style={{
                padding: '40px 20px', color: COL.textFaint, fontSize: '12px',
                textAlign: 'center', letterSpacing: '1px', fontFamily: 'monospace',
              }}>NO ARTICLES IN THIS FILTER</div>
            )}
            {filtered.map(a => (
              <Card
                key={a.id}
                a={a}
                selected={selected?.id === a.id}
                isRead={readIds.has(a.id)}
                isWatched={matchesWatch(a, watchlist)}
                onClick={() => handleSelect(a)}
              />
            ))}
          </div>
        )}
        {showReader && (
          <div style={{ flex: 1, overflow: 'hidden', background: COL.bg }}>
            <Reader a={selected} onBack={() => setSelected(null)} isMobile={isMobile} />
          </div>
        )}
      </div>

      {showWatch && (
        <WatchPanel
          items={watchlist}
          onAdd={async (s, n, c) => { await addToWatchlist(s, n, c); setWatchlist(await getWatchlist()) }}
          onRemove={async (id) => { await removeFromWatchlist(id); setWatchlist(await getWatchlist()) }}
          onClose={() => setShowWatch(false)}
        />
      )}
    </div>
  )
}
