import { useState, useEffect, useRef } from 'react'
import { MAP_CONFIG } from '../mapConstants.js'

/**
 * Web Worker 地图数据生成 hook
 * @param {number} seed - 地图种子
 * @returns {{ map: Array|null, loading: boolean, progress: number }}
 */
export function useMapData(seed) {
  const [map, setMap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    setLoading(true)
    setProgress(prev => Math.max(prev, 50))

    const worker = new Worker(
      new URL('../mapGenerator.worker.js', import.meta.url),
      { type: 'module' }
    )

    worker.onmessage = (e) => {
      setMap(e.data.map)
      setLoading(false)
      setProgress(100)
      worker.terminate()
    }

    worker.onerror = (err) => {
      console.error('Worker error:', err)
      worker.terminate()
    }

    worker.postMessage({ cols: MAP_CONFIG.COLS, rows: MAP_CONFIG.ROWS, seed })

    return () => {
      worker.terminate()
    }
  }, [seed])

  return { map, loading, progress }
}
