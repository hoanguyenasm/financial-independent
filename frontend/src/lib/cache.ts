const P = 'fire.cache.'

export function saveCache(key: string, data: unknown): void {
  try { localStorage.setItem(P + key, JSON.stringify(data)) } catch {}
}

export function loadCache<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(P + key)
    return v ? (JSON.parse(v) as T) : null
  } catch { return null }
}

export function clearAllCache(): void {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(P))
      .forEach(k => localStorage.removeItem(k))
  } catch {}
}
