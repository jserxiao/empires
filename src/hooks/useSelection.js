import { useRef, useCallback } from 'react'
import { MAP_CONFIG } from '../mapConstants.js'

const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG

// 框选最小拖拽距离（像素），低于此值视为单击
const BOX_SELECT_THRESHOLD = 5

/**
 * 框选交互 hook
 * 管理鼠标拖拽框选和单击判断逻辑
 */
export function useSelection({ handleTileClick, handleBoxSelect, viewportRef, map }) {
  const selectionBoxRef = useRef(null) // { startX, startY, endX, endY } 屏幕坐标
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef(null) // { clientX, clientY }

  /** 处理鼠标移动：检测框选拖拽 */
  const handleMouseMove = useCallback((e) => {
    // 如果有拖拽起点，检测是否开始框选
    if (dragStartRef.current && !isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.clientX
      const dy = e.clientY - dragStartRef.current.clientY
      if (Math.sqrt(dx * dx + dy * dy) >= BOX_SELECT_THRESHOLD) {
        isDraggingRef.current = true
      }
    }

    // 如果正在框选拖拽，更新选框终点
    if (isDraggingRef.current && dragStartRef.current) {
      selectionBoxRef.current = {
        startX: dragStartRef.current.clientX,
        startY: dragStartRef.current.clientY,
        endX: e.clientX,
        endY: e.clientY,
      }
      return true // 表示正在框选，调用方不更新悬停信息
    }

    return false
  }, [])

  /** 处理鼠标按下：左键记录拖拽起点，右键移动 */
  const handleMouseDown = useCallback((e) => {
    if (e.button === 2) {
      e.preventDefault()
    }

    if (!map) return null

    // macOS 兼容：Ctrl+左键视为右键
    const isRightClick = e.button === 2 || (e.button === 0 && e.ctrlKey)

    if (e.button !== 0 && e.button !== 2) return null

    if (isRightClick) {
      // 右键：批量移动选中单位
      const vp = viewportRef.current
      const tileCol = Math.floor((e.clientX + vp.x) / TILE_SIZE)
      const tileRow = Math.floor((e.clientY + vp.y) / TILE_SIZE)
      if (tileCol >= 0 && tileCol < COLS && tileRow >= 0 && tileRow < ROWS) {
        handleTileClick(tileCol, tileRow, true)
      }
      return null
    }

    // 左键：记录拖拽起点
    dragStartRef.current = { clientX: e.clientX, clientY: e.clientY }
    isDraggingRef.current = false
    selectionBoxRef.current = null
    return null
  }, [map, handleTileClick, viewportRef])

  /** 处理鼠标释放：完成框选或执行单击 */
  const handleMouseUp = useCallback((e) => {
    if (e.button !== 0) return
    if (!map) return

    const start = dragStartRef.current
    if (!start) return

    const dx = e.clientX - start.clientX
    const dy = e.clientY - start.clientY
    const dragDistance = Math.sqrt(dx * dx + dy * dy)

    if (dragDistance >= BOX_SELECT_THRESHOLD) {
      // 框选
      const vp = viewportRef.current
      const startCol = Math.floor((start.clientX + vp.x) / TILE_SIZE)
      const startRow = Math.floor((start.clientY + vp.y) / TILE_SIZE)
      const endCol = Math.floor((e.clientX + vp.x) / TILE_SIZE)
      const endRow = Math.floor((e.clientY + vp.y) / TILE_SIZE)
      handleBoxSelect(startCol, startRow, endCol, endRow)
    } else {
      // 单击
      const vp = viewportRef.current
      const tileCol = Math.floor((e.clientX + vp.x) / TILE_SIZE)
      const tileRow = Math.floor((e.clientY + vp.y) / TILE_SIZE)
      if (tileCol >= 0 && tileCol < COLS && tileRow >= 0 && tileRow < ROWS) {
        handleTileClick(tileCol, tileRow, false)
      }
    }

    // 清理拖拽状态
    isDraggingRef.current = false
    dragStartRef.current = null
    selectionBoxRef.current = null
  }, [map, handleTileClick, handleBoxSelect, viewportRef])

  /** 取消正在进行的框选 */
  const cancelSelection = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      dragStartRef.current = null
      selectionBoxRef.current = null
    }
  }, [])

  return {
    selectionBoxRef,
    isDraggingRef,
    handleMouseMove,
    handleMouseDown,
    handleMouseUp,
    cancelSelection,
  }
}
