import { useState, useEffect } from 'react'
import { ALL_IMAGE_PATHS } from '../mapConstants.js'

/**
 * 地图图片资源加载 hook
 * @returns {{ images: Object, loading: boolean, progress: number }}
 */
export function useMapAssets() {
  const [images, setImages] = useState({})
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const loadedImages = {}
    let loadedCount = 0
    const totalImages = ALL_IMAGE_PATHS.length

    if (totalImages === 0) {
      setLoading(false)
      return
    }

    ALL_IMAGE_PATHS.forEach(path => {
      const img = new Image()
      img.onload = () => {
        loadedImages[path] = img
        loadedCount++
        setProgress(Math.floor((loadedCount / totalImages) * 50))
        if (loadedCount >= totalImages) {
          setImages(loadedImages)
          setLoading(false)
        }
      }
      img.onerror = () => {
        loadedImages[path] = null
        loadedCount++
        setProgress(Math.floor((loadedCount / totalImages) * 50))
        if (loadedCount >= totalImages) {
          setImages(loadedImages)
          setLoading(false)
        }
      }
      img.src = path
    })
  }, [])

  return { images, loading, progress }
}
