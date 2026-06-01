// Diagnostic endpoint - open /api/test in your browser to check if keys are reaching the server.
// SAFE: it only reports whether each key EXISTS, never the actual key value.
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const groq = process.env.VITE_GROQ_API_KEY || process.env.GROQ_API_KEY
  const gemini = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY
  const supaUrl = process.env.VITE_SUPABASE_URL
  const supaKey = process.env.VITE_SUPABASE_KEY

  res.status(200).json({
    GROQ_KEY: groq ? `FOUND (starts with ${groq.slice(0, 6)}...)` : 'MISSING',
    GEMINI_KEY: gemini ? `FOUND (starts with ${gemini.slice(0, 6)}...)` : 'MISSING',
    SUPABASE_URL: supaUrl ? 'FOUND' : 'MISSING',
    SUPABASE_KEY: supaKey ? 'FOUND' : 'MISSING',
    note: 'If any key says MISSING, that is why AI is failing. Add it to Vercel env vars.',
  })
}
