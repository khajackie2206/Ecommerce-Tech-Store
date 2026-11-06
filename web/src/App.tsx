import { useEffect, useState } from 'react'

// Shapes of the responses from the API
type ApiInfo = { name: string; version: string; time: string }
type Health = { status: 'ok' | 'error'; database: 'up' | 'down' }

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  // fetch() does not throw on 4xx/5xx, so check the status ourselves
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

function App() {
  const [info, setInfo] = useState<ApiInfo | null>(null)
  const [dbUp, setDbUp] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  // An effect with an empty dependency array runs once, after the first render
  useEffect(() => {
    getJson<ApiInfo>('/api/v1')
      .then(setInfo)
      .catch((err: Error) => setError(err.message))

    getJson<Health>('/api/v1/health')
      .then((health) => setDbUp(health.database === 'up'))
      .catch(() => setDbUp(false))
  }, [])

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow">
        <h1 className="text-2xl font-bold text-slate-800">TechStore</h1>
        <p className="mt-1 text-slate-500">Điện thoại, laptop chính hãng</p>

        <ul className="mt-6 space-y-2 rounded-lg border p-4 text-sm">
          <li>
            API:{' '}
            {error && <span className="text-red-600">không gọi được ({error})</span>}
            {!error && !info && <span className="text-slate-500">đang kết nối...</span>}
            {info && (
              <span className="text-emerald-700">
                {info.name} v{info.version}, giờ server{' '}
                {new Date(info.time).toLocaleString('vi-VN')}
              </span>
            )}
          </li>
          <li>
            SQL Server:{' '}
            {dbUp === null && <span className="text-slate-500">đang kiểm tra...</span>}
            {dbUp === true && <span className="text-emerald-700">đã kết nối</span>}
            {dbUp === false && <span className="text-red-600">không kết nối được</span>}
          </li>
        </ul>
      </div>
    </main>
  )
}

export default App
