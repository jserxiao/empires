import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * 渲染循环 hook
 * 管理主画布的 requestAnimationFrame 渲染循环，
 * 并在选中单位信息变化时触发 React 状态更新
 */
export function useRenderLoop({ canvasRef, map, images, loadingImages, loadingMap, viewportRef, getMovingUnits, getSelectedUnits, selectionBoxRef, renderViewport }) {
  const [selectedInfo, setSelectedInfo] = useState(null)
  const selectedInfoRef = useRef(null)

  useEffect(() => {
    if (!map || loadingImages || loadingMap) return
    const canvas = canvasRef.current
    if (!canvas) return

    // 仅在 canvas 尺寸变化时重设大小
    const syncCanvasSize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }

    let rafId
    const renderLoop = () => {
      const ctx = canvas.getContext('2d')
      syncCanvasSize()

      const movingUnits = getMovingUnits()
      const selectedUnits = getSelectedUnits()
      const selectionBox = selectionBoxRef.current

      renderViewport(ctx, map, viewportRef.current, images, movingUnits, selectedUnits, selectionBox)

      // 更新选中单位信息面板（仅在内容变化时触发 setState）
      let newInfo = null
      if (selectedUnits.length > 0) {
        newInfo = selectedUnits.map(s => ({
          name: s.unit.name,
          hp: s.unit.hp ?? 100,
          maxHp: s.unit.maxHp ?? 100,
        }))
      }
      const prev = selectedInfoRef.current
      const changed = !prev && newInfo ||
        prev && !newInfo ||
        prev && newInfo && (
          prev.length !== newInfo.length ||
          prev.some((p, i) => p.name !== newInfo[i].name || p.hp !== newInfo[i].hp || p.maxHp !== newInfo[i].maxHp)
        )
      if (changed) {
        selectedInfoRef.current = newInfo
        setSelectedInfo(newInfo)
      }

      rafId = requestAnimationFrame(renderLoop)
    }

    rafId = requestAnimationFrame(renderLoop)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [map, images, loadingImages, loadingMap])

  return { selectedInfo }
}
