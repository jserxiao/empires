/**
 * 单位移动工具函数 - 路径计算、目标分配、平滑移动
 */

import { MAP_CONFIG } from '../mapConstants.js'
import { findPath } from '../pathfinding.js'

const { TILE_SIZE } = MAP_CONFIG

// 单位移动速度（像素/秒）
export const MOVE_SPEED = 4 * TILE_SIZE // 4 格/秒 → 256 像素/秒
// 加速/减速区域长度（像素）— 起步和停步的过渡距离
export const EASE_DISTANCE = TILE_SIZE * 1.5

/** 计算路径总长度（像素） */
export function computePathDistance(path) {
  let total = 0
  for (let i = 0; i < path.length - 1; i++) {
    const dx = path[i + 1].x - path[i].x
    const dy = path[i + 1].y - path[i].y
    total += Math.sqrt(dx * dx + dy * dy) * TILE_SIZE
  }
  return total
}

/** 计算当前速度倍率（考虑起步加速和停步减速，smoothstep 曲线） */
export function computeSpeedMultiplier(distanceTraveled, totalDistance) {
  const distFromStart = distanceTraveled
  const distToEnd = totalDistance - distanceTraveled

  let speedMul = 1
  if (distFromStart < EASE_DISTANCE) {
    const t = distFromStart / EASE_DISTANCE
    speedMul = t * t * (3 - 2 * t) // smoothstep
  }
  if (distToEnd < EASE_DISTANCE) {
    const t = distToEnd / EASE_DISTANCE
    speedMul = Math.min(speedMul, t * t * (3 - 2 * t))
  }

  return Math.max(0.2, speedMul)
}

/** 更新移动单位的插值位置，返回是否到达路径终点 */
export function updateMoverPosition(mover) {
  const from = mover.path[mover.pathIndex]
  const to = mover.path[mover.pathIndex + 1]

  const dx = to.x - from.x
  const dy = to.y - from.y
  const segDistPx = Math.sqrt(dx * dx + dy * dy) * TILE_SIZE

  const speedMul = computeSpeedMultiplier(mover.distanceTraveled, mover.totalDistance)
  const actualSpeed = MOVE_SPEED * speedMul

  const progressDelta = (actualSpeed * /* dt */ 0) / segDistPx
  // 注意：dt 由调用方传入，这里只提供位置插值公式
  return { dx, dy, segDistPx, actualSpeed }
}

/**
 * 目标分配算法：所有单位都指向同一个目标格子（右键点击位置）
 * 批量选中单位右键移动时，所有单位都走向同一个格子，
 * 到达后叠加显示在同一格子上。
 * 如果目标格子不可通行，寻找最近的可达格子。
 */
export function distributeTargets(map, centerCol, centerRow, count) {
  if (count <= 0) return []

  // 找到最近的可通行目标格子
  const target = findWalkableTarget(map, centerCol, centerRow)
  if (!target) return []

  // 所有单位都指向同一个目标
  return Array.from({ length: count }, () => ({ col: target.col, row: target.row }))
}

/** 从指定位置开始，找到最近的可通行格子 */
export function findWalkableTarget(map, col, row) {
  const rows = map.length
  const cols = map[0].length

  // 目标本身可通行
  if (col >= 0 && col < cols && row >= 0 && row < rows) {
    const tile = map[row][col]
    if (tile && !tile.structure && tile.terrain !== 'deep_water') {
      return { col, row }
    }
  }

  // 螺旋搜索最近的可通行格子
  for (let radius = 1; radius < 10; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) < radius && Math.abs(dy) < radius) continue

        const nx = col + dx
        const ny = row + dy
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue

        const tile = map[ny][nx]
        if (tile && !tile.structure && tile.terrain !== 'deep_water') {
          return { col: nx, row: ny }
        }
      }
    }
  }

  return null
}
