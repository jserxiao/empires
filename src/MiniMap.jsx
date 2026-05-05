import { useRef, useEffect, useCallback } from 'react'
import { MAP_CONFIG, TERRAIN_COLORS, ROAD_COLOR } from './mapConstants.js'

const { COLS, ROWS, TILE_SIZE, MINIMAP_SIZE } = MAP_CONFIG

function MiniMap({ map, viewport, onViewportChange }) {
  const canvasRef = useRef(null)
  const minimapDataRef = useRef(null)

  // 生成缩略图（仅在 map 变化时执行一次）
  useEffect(() => {
    if (!map) return

    const canvas = document.createElement('canvas')
    canvas.width = COLS
    canvas.height = ROWS
    const ctx = canvas.getContext('2d')

    const imageData = ctx.createImageData(COLS, ROWS)
    const data = imageData.data

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const tile = map[row][col]
        const idx = (row * COLS + col) * 4

        let color = TERRAIN_COLORS[tile.terrain] || '#333333'
        if (tile.road && tile.road !== 'none') {
          color = ROAD_COLOR
        }

        const r = parseInt(color.slice(1, 3), 16)
        const g = parseInt(color.slice(3, 5), 16)
        const b = parseInt(color.slice(5, 7), 16)

        data[idx] = r
        data[idx + 1] = g
        data[idx + 2] = b
        data[idx + 3] = 255
      }
    }

    ctx.putImageData(imageData, 0, 0)
    minimapDataRef.current = canvas
  }, [map])

  // 渲染小地图 + 视口矩形
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !minimapDataRef.current) return

    const ctx = canvas.getContext('2d')
    canvas.width = MINIMAP_SIZE
    canvas.height = MINIMAP_SIZE

    ctx.imageSmoothingEnabled = false
    ctx.drawImage(minimapDataRef.current, 0, 0, MINIMAP_SIZE, MINIMAP_SIZE)

    const scaleX = MINIMAP_SIZE / (COLS * TILE_SIZE)
    const scaleY = MINIMAP_SIZE / (ROWS * TILE_SIZE)

    const vpX = viewport.x * scaleX
    const vpY = viewport.y * scaleY
    const vpW = window.innerWidth * scaleX
    const vpH = window.innerHeight * scaleY

    // 视口矩形
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.lineWidth = 2
    ctx.strokeRect(vpX, vpY, vpW, vpH)

    // 视口外遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.fillRect(0, 0, MINIMAP_SIZE, vpY)
    ctx.fillRect(0, vpY + vpH, MINIMAP_SIZE, MINIMAP_SIZE - vpY - vpH)
    ctx.fillRect(0, vpY, vpX, vpH)
    ctx.fillRect(vpX + vpW, vpY, MINIMAP_SIZE - vpX - vpW, vpH)
  }, [viewport])

  // 点击/拖拽跳转视口
  const handleClick = useCallback((e) => {
    if (!onViewportChange) return
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const scaleX = (COLS * TILE_SIZE) / MINIMAP_SIZE
    const scaleY = (ROWS * TILE_SIZE) / MINIMAP_SIZE

    const worldX = mx * scaleX - window.innerWidth / 2
    const worldY = my * scaleY - window.innerHeight / 2

    const maxX = COLS * TILE_SIZE - window.innerWidth
    const maxY = ROWS * TILE_SIZE - window.innerHeight

    onViewportChange({
      x: Math.max(0, Math.min(maxX, worldX)),
      y: Math.max(0, Math.min(maxY, worldY)),
    })
  }, [onViewportChange])

  const isDraggingRef = useRef(false)

  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    isDraggingRef.current = true
    handleClick(e)
  }, [handleClick])

  const handleMouseMove = useCallback((e) => {
    if (!isDraggingRef.current) return
    e.preventDefault()
    e.stopPropagation()
    handleClick(e)
  }, [handleClick])

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  if (!map) return null

  return (
    <canvas
      ref={canvasRef}
      className="minimap"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  )
}

export default MiniMap
