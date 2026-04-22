const SERPER_API_KEY = process.env.SERPER_API_KEY

export async function searchWeb(query) {
  if (!SERPER_API_KEY) throw new Error('SERPER_API_KEY no configurado')

  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ q: query, num: 3, hl: 'es', gl: 'ar' })
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Serper API error ${res.status}: ${text}`)
  }

  const data = await res.json()
  return (data.organic || []).slice(0, 3).map(r => ({
    title:   r.title,
    snippet: r.snippet,
    url:     r.link
  }))
}

export function formatSearchResults(results) {
  if (!results.length) return 'No se encontraron resultados.'
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nFuente: ${r.url}`)
    .join('\n\n')
}
