/**
 * FogOfWar - 黑雾系统
 *
 * 三种瓦片状态：
 *   0 = 未探索（黑雾）
 *   1 = 已探索但不在当前视野内（灰雾，显示地形但不显示实体）
 *   2 = 在当前视野内（完全可见）
 *
 * 数据存储：
 *   - fogExplored: Uint8Array[COLS*ROWS] - 是否曾被探索过（持久化）
 *   - fogVisible:  Uint8Array[COLS*ROWS] - 当前是否在视野内（每 tick 重算）
 *
 * 设计要点：
 *   - 每 tick 从玩家实体位置重新计算 fogVisible
 *   - fogExplored 一旦标记为 1 就不会再清零（"曾经看到过"）
 *   - 单位移动时增量更新，避免全量重算
 */

import { getState } from '../core/GameState.js'
import { MAP_CONFIG, TEAM, FOG_CONFIG } from '../core/constants.js'

const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG

// ===== 黑雾数据 =====
let fogExplored = null  // Uint8Array - 0=未探索, 1=已探索
let fogVisible = null   // Uint8Array - 0=不可见, 1=当前可见
let fogVersion = 0      // 版本号，供渲染器脏检查

/**
 * 初始化黑雾数据（地图生成后调用）
 */
export function initFog() {
  const total = COLS * ROWS
  fogExplored = new Uint8Array(total)
  fogVisible = new Uint8Array(total)
}

/**
 * 重置黑雾数据
 */
export function resetFog() {
  fogExplored = null
  fogVisible = null
  fogVersion = 0
}

/**
 * 获取黑雾状态数据（供渲染器使用）
 */
export function getFogData() {
  return { fogExplored, fogVisible, version: fogVersion }
}

/**
 * 查询单个瓦片的可见状态
 * @returns {number} 0=未探索, 1=已探索(灰雾), 2=可见
 */
export function getTileVisibility(col, row) {
  if (!FOG_CONFIG.enabled) return 2
  if (!fogExplored || !fogVisible) return 2
  const idx = row * COLS + col
  if (fogVisible[idx]) return 2
  if (fogExplored[idx]) return 1
  return 0
}

/**
 * 设置黑雾开关
 */
export function setFogEnabled(enabled) {
  FOG_CONFIG.enabled = enabled
}

/**
 * 每帧更新黑雾 - 由 GameLoop 调用
 *
 * 策略：全量重算 fogVisible，再合并到 fogExplored
 * 对于 500x500 地图，这个量级可以接受
 */
export function updateFog() {
  if (!FOG_CONFIG.enabled) return
  if (!fogExplored || !fogVisible) return

  const state = getState()
  if (!state.mapReady) return

  // 清空当前可见状态
  fogVisible.fill(0)
  fogVersion++

  // 遍历所有玩家实体，揭示视野
  for (const entity of state.entities.values()) {
    if (entity.team !== TEAM.PLAYER) continue
    if (entity.state === 'dead') continue

    let centerX, centerY, visionRange

    if (entity.entityType === 'building') {
      centerX = (entity.tileX + entity.size.w / 2) * TILE_SIZE
      centerY = (entity.tileY + entity.size.h / 2) * TILE_SIZE
      visionRange = FOG_CONFIG.buildingVisionRange
    } else {
      centerX = entity.x
      centerY = entity.y
      visionRange = FOG_CONFIG.unitVisionRange
    }

    revealArea(centerX, centerY, visionRange)
  }
}

/**
 * 揭示以世界坐标 (wx, wy) 为中心、range 瓦片为半径的区域
 */
function revealArea(wx, wy, range) {
  const centerCol = Math.floor(wx / TILE_SIZE)
  const centerRow = Math.floor(wy / TILE_SIZE)
  const r2 = range * range

  const minCol = Math.max(0, centerCol - range)
  const maxCol = Math.min(COLS - 1, centerCol + range)
  const minRow = Math.max(0, centerRow - range)
  const maxRow = Math.min(ROWS - 1, centerRow + range)

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const dx = col - centerCol
      const dy = row - centerRow
      if (dx * dx + dy * dy > r2) continue

      const idx = row * COLS + col
      fogVisible[idx] = 1
      fogExplored[idx] = 1
    }
  }
}

/**
 * 增量更新：某个实体移动后，刷新旧位置和新位置的视野
 * 比全量 updateFog 轻量，用于单位移动时调用
 */
export function revealAtTile(col, row, range) {
  if (!FOG_CONFIG.enabled) return
  if (!fogExplored || !fogVisible) return

  const r2 = range * range
  const minCol = Math.max(0, col - range)
  const maxCol = Math.min(COLS - 1, col + range)
  const minRow = Math.max(0, row - range)
  const maxRow = Math.min(ROWS - 1, row + range)

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const dx = c - col
      const dy = r - row
      if (dx * dx + dy * dy > r2) continue
      const idx = r * COLS + c
      fogVisible[idx] = 1
      fogExplored[idx] = 1
    }
  }
}
