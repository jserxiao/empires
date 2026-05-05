import { useRef, useCallback, useEffect } from 'react'
import { MAP_CONFIG } from '../mapConstants.js'
import { findPath } from '../pathfinding.js'
import { ensureUnitId, addUnitToTile, removeUnitFromTile, hasUnit, tileContainsUnit } from '../utils/unitHelpers.js'
import { MOVE_SPEED, EASE_DISTANCE, computePathDistance, distributeTargets } from '../utils/movementUtils.js'

const { TILE_SIZE } = MAP_CONFIG

/**
 * 单位移动管理 hook
 *
 * 交互方式（RTS 标准）：
 * - 左键点击单位 → 选中（单选，清除之前的多选）
 * - 左键点击同一单位 → 取消选中
 * - 左键拖拽 → 框选范围内所有单位
 * - 右键点击 → 批量移动所有选中单位到同一目标位置（叠加在同一格子上）
 */
export function useUnitMovement(mapRef, triggerRender, map) {
  const movingUnitsRef = useRef(new Map())
  const animFrameRef = useRef(null)
  const lastTimeRef = useRef(0)
  const selectedUnitsRef = useRef([])
  const runningRef = useRef(false)

  // ==================== 动画循环 ====================

  const startLoop = useCallback(() => {
    if (runningRef.current) return
    runningRef.current = true
    lastTimeRef.current = 0

    const loop = (timestamp) => {
      if (!runningRef.current) return

      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05)
      lastTimeRef.current = timestamp

      const map = mapRef.current

      if (map) {
        const arrived = updateMovingUnits(movingUnitsRef.current, map, dt)
        updateArrivedSelection(arrived, selectedUnitsRef, movingUnitsRef.current)
        cleanupInvalidSelection(selectedUnitsRef, map, movingUnitsRef.current)
      }

      triggerRender()
      animFrameRef.current = requestAnimationFrame(loop)
    }

    animFrameRef.current = requestAnimationFrame(loop)
  }, [mapRef, triggerRender])

  useEffect(() => {
    if (map) {
      startLoop()
    }
    return () => {
      runningRef.current = false
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [map, startLoop])

  // ==================== 框选 ====================

  const handleBoxSelect = useCallback((startCol, startRow, endCol, endRow) => {
    const map = mapRef.current
    if (!map) return

    const minCol = Math.min(startCol, endCol)
    const maxCol = Math.max(startCol, endCol)
    const minRow = Math.min(startRow, endRow)
    const maxRow = Math.max(startRow, endRow)

    const newSelected = []
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const tile = map[row]?.[col]
        if (hasUnit(tile)) {
          for (const u of tile.units) {
            ensureUnitId(u)
            newSelected.push({ col, row, unit: u })
          }
        }
      }
    }

    selectedUnitsRef.current = newSelected
  }, [mapRef])

  // ==================== 单击处理 ====================

  const handleTileClick = useCallback((col, row, isRightClick) => {
    const map = mapRef.current
    if (!map) return

    const tile = map[row]?.[col]
    if (!tile) return

    if (isRightClick) {
      handleRightClick(map, col, row, selectedUnitsRef, movingUnitsRef)
    } else {
      handleLeftClick(tile, col, row, selectedUnitsRef)
    }
  }, [mapRef])

  // ==================== 查询方法 ====================

  const getMovingUnits = useCallback(() => {
    return Array.from(movingUnitsRef.current.values())
  }, [])

  const getSelectedUnits = useCallback(() => {
    const map = mapRef.current
    const result = []

    for (const sel of selectedUnitsRef.current) {
      const tile = map?.[sel.row]?.[sel.col]
      if (tileContainsUnit(tile, sel.unit)) {
        result.push(sel)
        continue
      }

      const foundMover = findMovingUnit(movingUnitsRef.current, sel.unit.id)
      if (foundMover) {
        result.push({ ...sel, movingUnit: foundMover })
      }
    }

    return result
  }, [mapRef])

  const clearSelection = useCallback(() => {
    selectedUnitsRef.current = []
  }, [])

  return {
    handleTileClick,
    handleBoxSelect,
    getMovingUnits,
    getSelectedUnits,
    clearSelection,
  }
}

// ==================== 私有辅助函数 ====================

/** 更新所有移动中的单位位置，返回到达终点的单位列表 */
function updateMovingUnits(movingUnits, map, dt) {
  const arrived = []

  for (const [key, mover] of movingUnits) {
    if (mover.pathIndex >= mover.path.length - 1) {
      const endPt = mover.path[mover.path.length - 1]
      addUnitToTile(map[endPt.y][endPt.x], mover.unit)
      arrived.push({ key, mover })
      continue
    }

    const from = mover.path[mover.pathIndex]
    const to = mover.path[mover.pathIndex + 1]
    const dx = to.x - from.x
    const dy = to.y - from.y
    const segDistPx = Math.sqrt(dx * dx + dy * dy) * TILE_SIZE

    // 平滑速度
    const speedMul = computeSpeedMultiplier(mover.distanceTraveled, mover.totalDistance)
    const actualSpeed = MOVE_SPEED * speedMul

    mover.progress += (actualSpeed * dt) / segDistPx
    mover.distanceTraveled += actualSpeed * dt

    if (mover.progress >= 1) {
      mover.pathIndex++
      mover.progress = 0

      if (mover.pathIndex >= mover.path.length - 1) {
        const endPt = mover.path[mover.path.length - 1]
        addUnitToTile(map[endPt.y][endPt.x], mover.unit)
        arrived.push({ key, mover })
        continue
      }

      const curr = mover.path[mover.pathIndex]
      mover.pixelX = curr.x * TILE_SIZE
      mover.pixelY = curr.y * TILE_SIZE
    } else {
      mover.pixelX = (from.x + dx * mover.progress) * TILE_SIZE
      mover.pixelY = (from.y + dy * mover.progress) * TILE_SIZE
    }
  }

  return arrived
}

/** 计算速度倍率（smoothstep 缓入缓出） */
function computeSpeedMultiplier(distanceTraveled, totalDistance) {
  let speedMul = 1
  if (distanceTraveled < EASE_DISTANCE) {
    const t = distanceTraveled / EASE_DISTANCE
    speedMul = t * t * (3 - 2 * t)
  }
  if (totalDistance - distanceTraveled < EASE_DISTANCE) {
    const t = (totalDistance - distanceTraveled) / EASE_DISTANCE
    speedMul = Math.min(speedMul, t * t * (3 - 2 * t))
  }
  return Math.max(0.2, speedMul)
}

/** 到达终点的单位：更新选中位置，从移动列表中删除 */
function updateArrivedSelection(arrived, selectedUnitsRef, movingUnits) {
  for (const { key, mover } of arrived) {
    const endPt = mover.path[mover.path.length - 1]
    const selEntry = selectedUnitsRef.current.find(s => s.unit.id === mover.unit.id)
    if (selEntry) {
      selEntry.col = endPt.x
      selEntry.row = endPt.y
    }
    movingUnits.delete(key)
  }
}

/** 清理无效选中（单位既不在格子也不在移动中） */
function cleanupInvalidSelection(selectedUnitsRef, map, movingUnits) {
  selectedUnitsRef.current = selectedUnitsRef.current.filter(sel => {
    const tile = map[sel.row]?.[sel.col]
    if (tileContainsUnit(tile, sel.unit)) return true
    return !!findMovingUnit(movingUnits, sel.unit.id)
  })
}

/** 在移动单位列表中按 id 查找 */
function findMovingUnit(movingUnits, unitId) {
  for (const mover of movingUnits.values()) {
    if (mover.unit.id === unitId) return mover
  }
  return null
}

/** 左键：选中/取消单位 */
function handleLeftClick(tile, col, row, selectedUnitsRef) {
  if (hasUnit(tile)) {
    const units = tile.units || []
    units.forEach(u => ensureUnitId(u))

    // 左键单击：只选中最上方（最后绘制）的一个单位
    const topUnit = units[units.length - 1]
    const isAlreadySelected = selectedUnitsRef.current.some(s => s.unit.id === topUnit.id)

    if (isAlreadySelected) {
      selectedUnitsRef.current = selectedUnitsRef.current.filter(
        s => s.unit.id !== topUnit.id
      )
    } else {
      selectedUnitsRef.current = [{ col, row, unit: topUnit }]
    }
  } else {
    // 点击空地 → 取消所有选中
    selectedUnitsRef.current = []
  }
}

/** 右键：批量移动选中单位 */
function handleRightClick(map, col, row, selectedUnitsRef, movingUnitsRef) {
  const selected = selectedUnitsRef.current
  if (selected.length === 0) return

  const targets = distributeTargets(map, col, row, selected.length)

  for (let i = 0; i < selected.length; i++) {
    const sel = selected[i]
    const target = targets[i]
    if (!target) continue

    const { unitData, startCol, startRow } = resolveUnitData(sel, map, movingUnitsRef)
    if (!unitData) continue

    const path = findPath(map, startCol, startRow, target.col, target.row)
    if (path.length < 2) {
      const oldTile = map[sel.row]?.[sel.col]
      if (oldTile && !hasUnit(oldTile)) {
        addUnitToTile(oldTile, unitData)
      }
      continue
    }

    const totalDistance = computePathDistance(path)
    const moveKey = `${startCol},${startRow}_${i}_${Date.now()}`

    movingUnitsRef.current.set(moveKey, {
      unit: unitData,
      path,
      pathIndex: 0,
      progress: 0,
      pixelX: startCol * TILE_SIZE,
      pixelY: startRow * TILE_SIZE,
      totalDistance,
      distanceTraveled: 0,
    })

    const oldTile = map[sel.row]?.[sel.col]
    removeUnitFromTile(oldTile, unitData)
  }
}

/** 解析单位数据：先从格子获取，再从移动列表获取 */
function resolveUnitData(sel, map, movingUnitsRef) {
  const oldTile = map[sel.row]?.[sel.col]
  let unitData = null
  let startCol = sel.col
  let startRow = sel.row

  // 从格子中获取
  if (hasUnit(oldTile)) {
    unitData = oldTile.units.find(u => u.id === sel.unit.id) || null
  }

  // 从移动列表中获取
  if (!unitData) {
    for (const [key, mover] of movingUnitsRef.current) {
      if (mover.unit.id === sel.unit.id) {
        unitData = mover.unit
        startCol = Math.round(mover.pixelX / TILE_SIZE)
        startRow = Math.round(mover.pixelY / TILE_SIZE)
        movingUnitsRef.current.delete(key)
        break
      }
    }
  }

  return { unitData, startCol, startRow }
}
