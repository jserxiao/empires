/**
 * FogOfWar - 三模式迷雾系统
 *
 * 模式：
 *   0 = 全明 - 无迷雾，所有单位/建筑显示为缩略圆点
 *   1 = 半明 - 视野内全明，视野外显示地形+记忆敌方缩略圆点
 *   2 = 黑雾 - 视野内全明，未探索全黑，已探索非视野显示地形+记忆敌方缩略圆点
 *
 * 瓦片可见状态：
 *   0 = 未探索（黑雾模式下全黑）
 *   1 = 已探索但不在当前视野内
 *   2 = 在当前视野内（完全可见）
 *
 * 敌方记忆：
 *   当敌方实体进入玩家视野时，记录其位置和类型
 *   实体离开视野后，保留最后一次看到的位置作为缩略圆点
 */

import { getState } from '../core/GameState.js'
import { MAP_CONFIG, TEAM, FOG_CONFIG } from '../core/constants.js'

const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG

// ===== 迷雾模式枚举 =====
export const FOG_MODE = {
  FULL_VISIBLE: 0,   // 全明
  HALF_VISIBLE: 1,   // 半明
  BLACK_FOG: 2,      // 黑雾
}

// ===== 当前迷雾模式 =====
let fogMode = FOG_MODE.FULL_VISIBLE

// ===== 黑雾数据 =====
let fogExplored = null  // Uint8Array - 0=未探索, 1=已探索
let fogVisible = null   // Uint8Array - 0=不可见, 1=当前可见
let fogVersion = 0      // 版本号，供渲染器脏检查

// ===== 敌方位置记忆 =====
// Map<entityId, { x, y, entityType, team, id }>
// 当敌方实体在视野内时更新，离开视野后保留最后位置
const enemyMemory = new Map()
let enemyMemoryVersion = 0

/**
 * 初始化迷雾数据（地图生成后调用）
 */
export function initFog() {
  const total = COLS * ROWS
  fogExplored = new Uint8Array(total)
  fogVisible = new Uint8Array(total)
  enemyMemory.clear()
  enemyMemoryVersion = 0
}

/**
 * 重置迷雾数据
 */
export function resetFog() {
  fogExplored = null
  fogVisible = null
  fogVersion = 0
  enemyMemory.clear()
  enemyMemoryVersion = 0
}

/**
 * 获取迷雾状态数据（供渲染器使用）
 */
export function getFogData() {
  return { fogExplored, fogVisible, version: fogVersion }
}

/**
 * 获取迷雾模式
 */
export function getFogMode() {
  return fogMode
}

/**
 * 设置迷雾模式
 */
export function setFogMode(mode) {
  if (mode === fogMode) return
  fogMode = mode
  // 切换到全明模式时不需要任何迷雾数据
  // 切换到半明/黑雾时，如果还没有初始化迷雾数据则初始化
  if (mode !== FOG_MODE.FULL_VISIBLE && !fogExplored) {
    initFog()
  }
  fogVersion++
  enemyMemoryVersion++
}

/**
 * 切换到下一个迷雾模式
 */
export function cycleFogMode() {
  const nextMode = (fogMode + 1) % 3
  setFogMode(nextMode)
  return nextMode
}

/**
 * 查询单个瓦片的可见状态
 * @returns {number} 0=未探索, 1=已探索(灰雾), 2=可见
 */
export function getTileVisibility(col, row) {
  if (fogMode === FOG_MODE.FULL_VISIBLE) return 2
  if (!fogExplored || !fogVisible) return 2
  const idx = row * COLS + col
  if (fogVisible[idx]) return 2
  if (fogExplored[idx]) return 1
  return 0
}

/**
 * 是否启用迷雾（非全明模式）
 */
export function isFogEnabled() {
  return fogMode !== FOG_MODE.FULL_VISIBLE
}

/**
 * 获取敌方位置记忆（供渲染器绘制缩略圆点）
 * @returns {Array<{x, y, entityType, team, id}>}
 */
export function getEnemyMemory() {
  return Array.from(enemyMemory.values())
}

/**
 * 获取敌方记忆版本号（渲染器脏检查用）
 */
export function getEnemyMemoryVersion() {
  return enemyMemoryVersion
}

/**
 * 每帧更新迷雾 - 由 GameLoop 调用
 */
export function updateFog() {
  if (fogMode === FOG_MODE.FULL_VISIBLE) {
    // 全明模式：仍然更新敌方记忆（用于缩略圆点显示）
    updateEnemyMemory()
    return
  }

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

  // 更新敌方记忆
  updateEnemyMemory()
}

/**
 * 更新敌方位置记忆
 * 策略：
 *   - 视野内的敌方实体：更新位置
 *   - 视野外的敌方实体：保留最后记忆的位置
 *   - 已死亡的敌方实体：从记忆中移除
 */
function updateEnemyMemory() {
  const state = getState()
  if (!state.mapReady) return

  // 记录当前存在的敌方实体ID
  const liveEnemyIds = new Set()

  for (const entity of state.entities.values()) {
    if (entity.team === TEAM.PLAYER) continue
    if (entity.state === 'dead') continue
    if (entity.entityType !== 'unit' && entity.entityType !== 'building') continue

    liveEnemyIds.add(entity.id)

    // 检查是否在玩家视野内
    const inVision = isInPlayerVision(entity)

    if (inVision) {
      // 更新记忆位置
      const x = entity.entityType === 'building'
        ? (entity.tileX + entity.size.w / 2) * TILE_SIZE
        : entity.x
      const y = entity.entityType === 'building'
        ? (entity.tileY + entity.size.h / 2) * TILE_SIZE
        : entity.y

      enemyMemory.set(entity.id, {
        id: entity.id,
        x,
        y,
        entityType: entity.entityType,
        team: entity.team,
      })
    }
    // 不在视野内的：保留之前的记忆位置（不做任何操作）
  }

  // 移除已不存在的敌方实体记忆（死亡/被删除的）
  let changed = false
  for (const [id] of enemyMemory) {
    if (!liveEnemyIds.has(id)) {
      enemyMemory.delete(id)
      changed = true
    }
  }

  if (changed) {
    enemyMemoryVersion++
  }
}

/**
 * 检查一个实体是否在玩家视野内
 */
function isInPlayerVision(entity) {
  if (fogMode === FOG_MODE.FULL_VISIBLE) return true
  if (!fogVisible || !fogExplored) return true

  const tileX = entity.entityType === 'building'
    ? Math.floor(entity.tileX + entity.size.w / 2)
    : Math.floor(entity.x / TILE_SIZE)
  const tileY = entity.entityType === 'building'
    ? Math.floor(entity.tileY + entity.size.h / 2)
    : Math.floor(entity.y / TILE_SIZE)

  if (tileX < 0 || tileX >= COLS || tileY < 0 || tileY >= ROWS) return false

  const idx = tileY * COLS + tileX
  return fogVisible[idx] === 1
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
 */
export function revealAtTile(col, row, range) {
  if (fogMode === FOG_MODE.FULL_VISIBLE) return
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
