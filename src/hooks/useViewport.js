import { useRef, useState, useCallback } from 'react'
import { MAP_CONFIG } from '../mapConstants.js'

// 边缘滚动区域宽度（像素）— 鼠标距屏幕边缘在此范围内触发滚动
const EDGE_SIZE = 60
// 滚动速度（像素/帧）— 基础速度，越靠近边缘越快，最高可达 2 倍
const SCROLL_SPEED = 20
// 鼠标移出画布后的固定滚动速度（满速）
const OUT_OF_BOUNDS_SPEED = SCROLL_SPEED * 2

/**
 * 视口状态 + 边缘滚动 / 滚轮交互 hook
 *
 * 交互方式（RTS 标准）：
 * - 鼠标触及屏幕边缘 → 画布自动朝该方向滚动
 * - 鼠标移出画布边界 → 继续按离开时的方向满速滚动
 * - 鼠标滚轮 → 平移画布
 * - 不再使用拖拽移动画布
 *
 * @returns {{ viewport, viewportState, isEdgeScrolling, updateViewport, handlers }}
 */
export function useViewport() {
  const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG

  const initialVp = {
    x: Math.floor((COLS * TILE_SIZE - window.innerWidth) / 2),
    y: Math.floor((ROWS * TILE_SIZE - window.innerHeight) / 2),
  }

  const viewportRef = useRef(initialVp)
  const renderFlagRef = useRef(0)
  const [, setRenderFlag] = useState(0)
  const [viewportState, setViewportState] = useState(initialVp)

  // 边缘滚动状态
  const edgeScrollDirRef = useRef({ dx: 0, dy: 0 })
  const isEdgeScrollingRef = useRef(false)
  const edgeScrollRafRef = useRef(null)
  // 鼠标是否在画布内
  const mouseInCanvasRef = useRef(true)
  // 鼠标离开画布时锁定的滚动方向
  const lockedDirRef = useRef({ dx: 0, dy: 0 })

  // 统一的视口更新方法
  const updateViewport = useCallback((newVp) => {
    viewportRef.current = newVp
    renderFlagRef.current++
    setRenderFlag(renderFlagRef.current)
    setViewportState({ x: newVp.x, y: newVp.y })
  }, [])

  // 移动视口（偏移量），带边界钳制
  const moveViewport = useCallback((dx, dy) => {
    const vp = viewportRef.current
    const maxX = COLS * TILE_SIZE - window.innerWidth
    const maxY = ROWS * TILE_SIZE - window.innerHeight
    const newVp = {
      x: Math.max(0, Math.min(maxX, vp.x + dx)),
      y: Math.max(0, Math.min(maxY, vp.y + dy)),
    }
    updateViewport(newVp)
  }, [updateViewport])

  // 计算鼠标是否在边缘区域，返回滚动方向和速度
  const computeEdgeDirection = useCallback((clientX, clientY) => {
    let dx = 0
    let dy = 0

    // 鼠标在画布外时也触发：clientX/clientY 可能为负数或超过窗口尺寸
    if (clientX < EDGE_SIZE) dx = -1
    else if (clientX > window.innerWidth - EDGE_SIZE) dx = 1

    if (clientY < EDGE_SIZE) dy = -1
    else if (clientY > window.innerHeight - EDGE_SIZE) dy = 1

    // 越靠近边缘速度越快（线性插值），在画布外时满速
    let speedX = SCROLL_SPEED
    let speedY = SCROLL_SPEED

    if (dx === -1) {
      speedX = clientX <= 0
        ? OUT_OF_BOUNDS_SPEED
        : SCROLL_SPEED * (1 - clientX / EDGE_SIZE)
    } else if (dx === 1) {
      speedX = clientX >= window.innerWidth
        ? OUT_OF_BOUNDS_SPEED
        : SCROLL_SPEED * (1 - (window.innerWidth - clientX) / EDGE_SIZE)
    }

    if (dy === -1) {
      speedY = clientY <= 0
        ? OUT_OF_BOUNDS_SPEED
        : SCROLL_SPEED * (1 - clientY / EDGE_SIZE)
    } else if (dy === 1) {
      speedY = clientY >= window.innerHeight
        ? OUT_OF_BOUNDS_SPEED
        : SCROLL_SPEED * (1 - (window.innerHeight - clientY) / EDGE_SIZE)
    }

    return { dx: dx * speedX, dy: dy * speedY }
  }, [])

  // 边缘滚动动画循环
  const startEdgeScrollLoop = useCallback(() => {
    if (edgeScrollRafRef.current) return // 已在运行

    const loop = () => {
      // 鼠标在画布外时，使用锁定的方向（满速）
      if (!mouseInCanvasRef.current) {
        const locked = lockedDirRef.current
        if (locked.dx !== 0 || locked.dy !== 0) {
          moveViewport(locked.dx, locked.dy)
        }
      } else {
        const dir = edgeScrollDirRef.current
        if (dir.dx !== 0 || dir.dy !== 0) {
          moveViewport(dir.dx, dir.dy)
        }
      }
      edgeScrollRafRef.current = requestAnimationFrame(loop)
    }

    edgeScrollRafRef.current = requestAnimationFrame(loop)
  }, [moveViewport])

  const stopEdgeScrollLoop = useCallback(() => {
    if (edgeScrollRafRef.current) {
      cancelAnimationFrame(edgeScrollRafRef.current)
      edgeScrollRafRef.current = null
    }
  }, [])

  // 画布鼠标事件
  const handleMouseMove = useCallback((e, map, onHover) => {
    const clientX = e.clientX
    const clientY = e.clientY
    mouseInCanvasRef.current = true

    // 计算边缘滚动方向
    const dir = computeEdgeDirection(clientX, clientY)
    edgeScrollDirRef.current = dir

    const wasScrolling = isEdgeScrollingRef.current
    isEdgeScrollingRef.current = dir.dx !== 0 || dir.dy !== 0

    // 从不滚动变为滚动 → 启动循环
    if (!wasScrolling && isEdgeScrollingRef.current) {
      startEdgeScrollLoop()
    }

    // 悬停检测
    if (onHover && map) {
      const vp = viewportRef.current
      const tileCol = Math.floor((clientX + vp.x) / TILE_SIZE)
      const tileRow = Math.floor((clientY + vp.y) / TILE_SIZE)
      onHover(tileCol, tileRow)
    }
  }, [computeEdgeDirection, startEdgeScrollLoop])

  const handleMouseDown = useCallback((_e) => {
    // 不再用于拖拽，保留接口以兼容外部调用
  }, [])

  const handleMouseUp = useCallback(() => {
    // 不再用于拖拽
  }, [])

  const handleMouseLeave = useCallback((e) => {
    // 鼠标离开画布 → 锁定离开时的方向，继续满速滚动
    mouseInCanvasRef.current = false

    // 根据鼠标离开位置判断滚动方向
    const clientX = e.clientX
    const clientY = e.clientY
    const dir = computeEdgeDirection(clientX, clientY)

    if (dir.dx !== 0 || dir.dy !== 0) {
      // 锁定为满速方向
      const signX = dir.dx > 0 ? 1 : dir.dx < 0 ? -1 : 0
      const signY = dir.dy > 0 ? 1 : dir.dy < 0 ? -1 : 0
      lockedDirRef.current = { dx: signX * OUT_OF_BOUNDS_SPEED, dy: signY * OUT_OF_BOUNDS_SPEED }
      isEdgeScrollingRef.current = true
      startEdgeScrollLoop()
    } else {
      // 鼠标从非边缘区域离开 → 停止
      edgeScrollDirRef.current = { dx: 0, dy: 0 }
      isEdgeScrollingRef.current = false
      stopEdgeScrollLoop()
    }
  }, [computeEdgeDirection, startEdgeScrollLoop, stopEdgeScrollLoop])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    moveViewport(e.deltaX, e.deltaY)
  }, [moveViewport])

  return {
    viewportRef,
    renderFlagRef,
    viewportState,
    isEdgeScrolling: isEdgeScrollingRef,
    updateViewport,
    moveViewport,
    handlers: {
      handleMouseMove,
      handleMouseDown,
      handleMouseUp,
      handleMouseLeave,
      handleWheel,
    },
  }
}
