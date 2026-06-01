import { useState, useEffect, useCallback } from 'react'
import { fetchNews, analyzeWithBothAIs } from './services'

const IMP = {
  HIGH:   { bg:'#ef4444', text:'#fca5a5', border:'#7f1d1d' },
  MEDIUM: { bg:'#f59e0b', text:'#fcd34d', border:'#78350f' },
  LOW:    { bg:'#22c55e', text:'#86efac', border:'#14532d' },
}
const CON = {
  CONFIRMED: { icon:'✅', color:'#4ade80', label:'CONFIRMED' },
  DISPUTED:  { icon:'⚠️', color:'#fbbf24', label:'DISPUTED'  },
  REVIEW:    { icon:'🔍', color:'#f87171', label:'REVIEW'    },
  ANALYZING: { icon:'⏳', color:'#475569', label:'ANALYZING' },
}

function useIsMobile() {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return m
}

function Card({ a, selected, onClick }) {
  const imp = IMP[a.impact] || IMP.LOW
  const con = CON[a.confirmStatus] || CON.ANALYZING
  return (
    <div onClick={onClick} style={{
      padding:'14px 18px', borderBottom:'1px solid #111118', cursor:'pointer',
      background: selected ? '#091510' : 'transparent',
      borderLeft: selected ? '3px solid #00ff88' : '3px solid transparent',
    }}>
      <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'7px',flexWrap:'wrap'}}>
        <span style={{background:imp.bg,color:'#fff',fontSize:'10px',fontWeight:'700',padding:'2px 8px',letterSpacing:'1px',flexShrink:0}}>
          {a.impact}
        </span>
        <span style={{color:con.color,fontSize:'10px',fontWeight:'700'}}>
          {con.icon} {con.label}
        </span>
        <span style={{color:'#334155',fontSize:'10px',marginLeft:'auto',flexShrink:0}}>{a.time}</span>
      </div>
      <div style={{color:'#334155',fontSize:'10px',marginBottom:'6px',letterSpacing:'0.5px'}}>{a.source}</div>
      <div style={{fontSize:'14px',lineHeight:'1.5',marginBottom:'10px',color:selected?'#e2e8f0':'#94a3b8',fontFamily:"'IBM Plex Sans',sans-serif",fontWeight:'500'}}>{a.title}</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:'4px'}}>
        {(a.instruments||[]).slice(0,4).map((inst,i)=>(
          <span key={i} style={{
            fontSize:'11px',padding:'2px 7px',fontFamily:'monospace',fontWeight:'700',
            border:`1px solid ${inst.includes('↑')?'#166534':inst.includes('↓')?'#7f1d1d':'#1e293b'}`,
            color: inst.includes('↑')?'#4ade80':inst.includes('↓')?'#f87171':'#64748b',
          }}>{inst}</span>
        ))}
      </div>
    </div>
  )
}

function Reader({ a, onBack, isMobile }) {
  if (!a) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'#1e293b',fontSize:'14px',fontFamily:'monospace'}}>
      ← SELECT AN ARTICLE
    </div>
  )
  const imp = IMP[a.impact] || IMP.LOW
  const con = CON[a.confirmStatus] || CON.ANALYZING
  return (
    <div style={{padding: isMobile?'18px 16px':'28px 36px',overflow:'auto',height:'100%',fontFamily:"'IBM Plex Sans',sans-serif"}}>
      {isMobile && (
        <button onClick={onBack} style={{background:'transparent',border:'1px solid #1e293b',color:'#4ade80',padding:'6px 14px',fontSize:'11px',fontFamily:'monospace',cursor:'pointer',letterSpacing:'1px',marginBottom:'16px'}}>← BACK TO FEED</button>
      )}
      <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'16px',alignItems:'center'}}>
        <span style={{background:imp.bg,color:'#fff',fontSize:'10px',fontWeight:'700',padding:'3px 10px',letterSpacing:'2px'}}>{a.impact} IMPACT</span>
        <span style={{color:con.color,fontSize:'10px',fontWeight:'700',border:`1px solid ${con.color}40`,padding:'3px 10px',background:`${con.color}15`,letterSpacing:'1px'}}>{con.icon} {con.label}</span>
        <span style={{color:'#334155',fontSize:'11px',marginLeft:'auto',fontFamily:'monospace'}}>{a.source} · {a.time}</span>
      </div>
      <h2 style={{fontSize: isMobile?'18px':'22px',lineHeight:'1.35',color:'#f1f5f9',marginBottom:'24px',fontWeight:'700'}}>{a.title}</h2>
      {(a.instruments||[]).length > 0 && (
        <div style={{marginBottom:'22px'}}>
          <div style={{fontSize:'10px',color:'#334155',letterSpacing:'2px',marginBottom:'8px',fontFamily:'monospace'}}>AFFECTED INSTRUMENTS</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:'8px'}}>
            {a.instruments.map((inst,i)=>(
              <span key={i} style={{
                fontSize:'13px',padding:'6px 14px',fontFamily:'monospace',fontWeight:'700',
                border:`1px solid ${inst.includes('↑')?'#166534':inst.includes('↓')?'#7f1d1d':'#1e293b'}`,
                color: inst.includes('↑')?'#4ade80':inst.includes('↓')?'#f87171':'#64748b',
              }}>{inst}</span>
            ))}
          </div>
        </div>
      )}
      {a.confirmStatus !== 'ANALYZING' && (a.groqAnalysis || a.geminiAnalysis) && (
        <div style={{marginBottom:'24px'}}>
          <div style={{fontSize:'10px',color:'#334155',letterSpacing:'2px',marginBottom:'10px',fontFamily:'monospace'}}>AI DUAL VERIFICATION</div>
          <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
            {a.groqAnalysis && (
              <div style={{flex:1,minWidth:'220px',background:'#091510',border:'1px solid #166534',padding:'14px 16px'}}>
                <div style={{fontSize:'10px',color:'#4ade80',letterSpacing:'1px',marginBottom:'8px',fontFamily:'monospace'}}>◆ GROQ — LLAMA 3</div>
                <div style={{fontSize:'11px',color:'#475569',marginBottom:'6px',fontFamily:'monospace'}}>IMPACT: <span style={{color:IMP[a.groqAnalysis.impact]?.text||'#fff',fontWeight:'700'}}>{a.groqAnalysis.impact}</span></div>
                <div style={{fontSize:'13px',color:'#86efac',lineHeight:'1.6'}}>{a.groqAnalysis.verdict}</div>
              </div>
            )}
            {a.geminiAnalysis && (
              <div style={{flex:1,minWidth:'220px',background:'#090f1a',border:'1px solid #1e3a5f',padding:'14px 16px'}}>
                <div style={{fontSize:'10px',color:'#60a5fa',letterSpacing:'1px',marginBottom:'8px',fontFamily:'monospace'}}>◆ GEMINI — GOOGLE</div>
                <div style={{fontSize:'11px',color:'#475569',marginBottom:'6px',fontFamily:'monospace'}}>IMPACT: <span style={{color:IMP[a.geminiAnalysis.impact]?.text||'#fff',fontWeight:'700'}}>{a.geminiAnalysis.impact}</span></div>
                <div style={{fontSize:'13px',color:'#93c5fd',lineHeight:'1.6'}}>{a.geminiAnalysis.verdict}</div>
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{borderTop:'1px solid #1e293b',paddingTop:'22px'}}>
        <p style={{fontSize:'15px',lineHeight:'1.9',color:'#94a3b8',marginBottom:'14px'}}><strong style={{color:'#cbd5e1'}}>{a.summary}</strong></p>
        {a.link && (
          <a href={a.link} target="_blank" rel="noopener noreferrer" style={{display:'inline-block',marginTop:'8px',color:'#00ff88',fontSize:'12px',textDecoration:'none',border:'1px solid #166534',padding:'7px 16px',fontFamily:'monospace',letterSpacing:'1px'}}>READ FULL ARTICLE →</a>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const isMobile = useIsMobile()
  const [articles, setArticles] = useState([])
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [tickerIdx, setTickerIdx] = useState(0)
  const FILTERS = ['ALL','HIGH','CONFIRMED','STOCKS','FOREX','CRYPTO','OIL & GOLD']

  const analyzeOne = useCallback(async (article) => {
    const result = await analyzeWithBothAIs(article)
    setArticles(prev => prev.map(a => a.id === article.id ? {...a,...result} : a))
    if (result.impact === 'HIGH' && result.confirmStatus === 'CONFIRMED') {
      if ('Notification' in window && Notification.permission === 'granted')
        new Notification(`🔴 ${article.title}`, {body: result.groqAnalysis?.verdict || ''})
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.frequency.value = 880
        g.gain.setValueAtTime(0.2, ctx.currentTime)
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
        o.start(); o.stop(ctx.currentTime + 0.4)
      } catch(e){}
    }
  }, [])

  const loadNews = useCallback(async () => {
    try {
      const news = await fetchNews()
      setArticles(prev => {
        const map = {}; prev.forEach(a => map[a.id] = a)
        return news.map(n => map[n.id] || n)
      })
      setLastUpdated(new Date()); setLoading(false)
      news.forEach(a => analyzeOne(a))
    } catch(e) { setLoading(false) }
  }, [analyzeOne])

  useEffect(() => {
    loadNews()
    const t = setInterval(loadNews, 60000)
    if ('Notification' in window) Notification.requestPermission()
    return () => clearInterval(t)
  }, [loadNews])

  useEffect(() => {
    if (!articles.length) return
    const t = setInterval(() => setTickerIdx(i => (i+1) % articles.length), 5000)
    return () => clearInterval(t)
  }, [articles.length])

  const high = articles.filter(a => a.impact === 'HIGH')
  const filtered = articles.filter(a => {
    if (filter==='ALL') return true
    if (filter==='HIGH') return a.impact==='HIGH'
    if (filter==='CONFIRMED') return a.confirmStatus==='CONFIRMED'
    const inst = a.instruments||[]
    if (filter==='FOREX') return inst.some(i=>['USD','EUR','GBP','JPY','CAD','AUD','CHF'].some(x=>i.includes(x)))
    if (filter==='CRYPTO') return inst.some(i=>['BTC','ETH','Bitcoin','Crypto'].some(x=>i.includes(x)))
    if (filter==='OIL & GOLD') return inst.some(i=>['Oil','Gold','Silver','WTI','Brent','Crude'].some(x=>i.includes(x)))
    if (filter==='STOCKS') return inst.some(i=>['S&P','Nasdaq','Stock','Equity','Nikkei','DAX'].some(x=>i.includes(x)))
    return true
  })

  const showReader = isMobile ? selected !== null : true
  const showFeed = isMobile ? selected === null : true

  return (
    <div style={{fontFamily:"'IBM Plex Mono','Courier New',monospace",background:'#0a0a0f',color:'#e2e8f0',height:'100vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{background:'#0d0d14',borderBottom:'1px solid #1e293b',padding:isMobile?'10px 14px':'11px 20px',display:'flex',alignItems:'center',gap:isMobile?'10px':'20px',flexShrink:0}}>
        <span style={{color:'#00ff88',fontWeight:'700',fontSize:isMobile?'12px':'15px',letterSpacing:isMobile?'2px':'3px'}}>◆ TERMINAL</span>
        {!isMobile && <span style={{color:'#1e293b',fontSize:'11px',flex:1}}>{loading?'CONNECTING...':`${articles.length} ARTICLES · ${high.length} HIGH`}</span>}
        <div style={{flex:1}}/>
        <button onClick={loadNews} style={{background:'transparent',border:'1px solid #1e293b',color:'#4ade80',padding:'4px 10px',fontSize:'10px',fontFamily:'monospace',cursor:'pointer',letterSpacing:'1px'}}>↺ REFRESH</button>
      </div>

      <div style={{background:'rgba(239,68,68,0.08)',borderBottom:'1px solid rgba(239,68,68,0.15)',padding:'6px 16px',fontSize:'11px',color:'#fca5a5',display:'flex',gap:'10px',alignItems:'center',flexShrink:0,overflow:'hidden'}}>
        <span style={{color:'#ef4444',fontWeight:'700',flexShrink:0,letterSpacing:'1px'}}>● LIVE</span>
        <span style={{overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{high[tickerIdx%Math.max(high.length,1)]?.title||articles[0]?.title||'Scanning feeds...'}</span>
      </div>

      <div style={{background:'#0d0d14',borderBottom:'1px solid #1e293b',padding:'8px 12px',display:'flex',gap:'5px',flexShrink:0,flexWrap:'nowrap',overflowX:'auto',alignItems:'center'}}>
        {FILTERS.map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{
            background:filter===f?'#00ff88':'transparent',color:filter===f?'#0a0a0f':'#334155',
            border:`1px solid ${filter===f?'#00ff88':'#1e293b'}`,padding:'4px 10px',fontSize:'10px',
            fontFamily:'monospace',fontWeight:'700',cursor:'pointer',letterSpacing:'1px',flexShrink:0,
          }}>{f}</button>
        ))}
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        {showFeed && (
          <div style={{width:isMobile?'100%':'400px',borderRight:isMobile?'none':'1px solid #1e293b',overflow:'auto',flexShrink:0}}>
            {loading && <div style={{padding:'24px',color:'#1e293b',fontSize:'12px',textAlign:'center',letterSpacing:'2px'}}>◆ LOADING...</div>}
            {filtered.map(a=><Card key={a.id} a={a} selected={selected?.id===a.id} onClick={()=>setSelected(a)} />)}
          </div>
        )}
        {showReader && (
          <div style={{flex:1,overflow:'hidden',background:'#0a0a0f'}}>
            <Reader a={selected} onBack={()=>setSelected(null)} isMobile={isMobile}/>
          </div>
        )}
      </div>
    </div>
  )
}