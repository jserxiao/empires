/**
 * 移动系统 - 管理所有单位的路径跟随和位置更新
 *
 * 关键改进：
 * - 单位只有一份位置数据（entity.x, entity.y），不存在 tile/movingUnits 双写问题
 * - 平滑插值：像素级世界坐标
 * - 集群移动：多单位目标分散
 */

import { getState, getMapData } from '../core/GameState.js'
import { findPath, pathToWorldPath, computePathLength, distributeTargets } from '../core/Pathfinding.js'
import { MAP_CONFIG, ENTITY_STATE, TERRAIN } from '../core/constants.js'
import { RESOURCE_DEFS } from '../core/constants.js'

const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG

// 缓入缓出距离
const EASE_DISTANCE = TILE_SIZE * 1.5

/**
 * 发出移动命令
 * @param {number[]} unitIds - 要移动的单位 ID 列表
 * @param {number} targetCol - 目标列
 * @param {number} targetRow - 目标行
 */
export function commandMove(unitIds, targetCol, targetRow) {
  const state = getState()
  const { terrain } = getMapData()

  // 通行检查函数
  const walkableCheck = (x, y) => {
    // 检查建筑占位
    for (const b of state.buildings.values()) {
      if (b.isBuilt && x >= b.tileX && x < b.tileX + b.size.w &&
          y >= b.tileY && y < b.tileY + b.size.h) {
        return false
      }
    }
    return true
  }

  // 分配目标位置
  const targets = distributeTargets(terrain, targetCol, targetRow, unitIds.length, walkableCheck)

  for (let i = 0; i < unitIds.length; i++) {
    const entity = state.entities.get(unitIds[i])
    if (!entity || entity.entityType !== 'unit') continue
    if (entity.state === ENTITY_STATE.DEAD) continue

    const target = targets[i]
    if (!target) continue

    // 起点格子
    const startCol = Math.floor(entity.x / TILE_SIZE)
    const startRow = Math.floor(entity.y / TILE_SIZE)

    const gridPath = findPath(terrain, startCol, startRow, target.col, target.row, walkableCheck)
    if (gridPath.length < 2) continue

    const worldPath = pathToWorldPath(gridPath)
    const totalDistance = computePathLength(worldPath)

    entity.path = worldPath
    entity.pathIndex = 0
    entity.progress = 0
    entity.totalDistance = totalDistance
    entity.distanceTraveled = 0
    entity.state = ENTITY_STATE.MOVING
    entity.targetId = null
    entity.gatherTargetIdx = -1
    entity.buildTargetId = null

    // 设置动画
    entity.animState = 'walk'
    updateAnimDir(entity, worldPath[0], worldPath[1])
  }
}

/**
 * 发出攻击命令
 */
export function commandAttack(unitIds, targetId) {
  const state = getState()
  const target = state.entities.get(targetId)
  if (!target) return

  for (const id of unitIds) {
    const entity = state.entities.get(id)
    if (!entity || entity.entityType !== 'unit') continue
    if (entity.state === ENTITY_STATE.DEAD) continue

    entity.targetId = targetId
    entity.state = ENTITY_STATE.MOVING
    entity.animState = 'walk'

    // 先移动到攻击范围，由 CombatSystem 接管
    const targetCol = Math.floor(target.x / TILE_SIZE)
    const targetRow = Math.floor(target.y / TILE_SIZE)
    const startCol = Math.floor(entity.x / TILE_SIZE)
    const startRow = Math.floor(entity.y / TILE_SIZE)

    const walkableCheck = (x, y) => {
      for (const b of state.buildings.values()) {
        if (b.isBuilt && x >= b.tileX && x < b.tileX + b.size.w &&
            y >= b.tileY && y < b.tileY + b.size.h) return false
      }
      return true
    }

    const gridPath = findPath(state.terrain, startCol, startRow, targetCol, targetRow, walkableCheck)
    if (gridPath.length >= 2) {
      entity.path = pathToWorldPath(gridPath)
      entity.pathIndex = 0
      entity.progress = 0
      entity.totalDistance = computePathLength(entity.path)
      entity.distanceTraveled = 0
      updateAnimDir(entity, entity.path[0], entity.path[1])
    } else {
      entity.path = null
    }
  }
}

/**
 * 发出采集命令
 */
export function commandGather(unitIds, tileX, tileY) {
  const state = getState()
  const resource = getResourceAt(tileX, tileY)
  if (!resource) return

  for (const id of unitIds) {
    const entity = state.entities.get(id)
    if (!entity || !entity.gatherer) continue
    if (entity.state === ENTITY_STATE.DEAD) continue

    entity.gatherTargetIdx = tileY * COLS + tileX
    entity.state = ENTITY_STATE.MOVING
    entity.animState = 'walk'
    entity.targetId = null
    entity.buildTargetId = null

    // 移动到资源旁边
    const startCol = Math.floor(entity.x / TILE_SIZE)
    const startRow = Math.floor(entity.y / TILE_SIZE)

    const walkableCheck = (x, y) => {
      for (const b of state.buildings.values()) {
        if (b.isBuilt && x >= b.tileX && x < b.tileX + b.size.w &&
            y >= b.tileY && y < b.tileY + b.size.h) return false
      }
      return true
    }

    const gridPath = findPath(state.terrain, startCol, startRow, tileX, tileY, walkableCheck)
    if (gridPath.length >= 2) {
      entity.path = pathToWorldPath(gridPath)
      entity.pathIndex = 0
      entity.progress = 0
      entity.totalDistance = computePathLength(entity.path)
      entity.distanceTraveled = 0
      updateAnimDir(entity, entity.path[0], entity.path[1])
    } else {
      entity.path = null
    }
  }
}

/**
 * 发出建造命令
 */
export function commandBuild(unitIds, buildingId) {
  const state = getState()
  const building = state.buildings.get(buildingId)
  if (!building) return

  for (const id of unitIds) {
    const entity = state.entities.get(id)
    if (!entity || !entity.gatherer) continue
    if (entity.state === ENTITY_STATE.DEAD) continue

    entity.buildTargetId = buildingId
    entity.state = ENTITY_STATE.MOVING
    entity.animState = 'walk'
    entity.targetId = null
    entity.gatherTargetIdx = -1

    // 移动到建筑旁边
    const targetCol = building.tileX
    const targetRow = building.tileY
    const startCol = Math.floor(entity.x / TILE_SIZE)
    const startRow = Math.floor(entity.y / TILE_SIZE)

    const walkableCheck = (x, y) => {
      for (const b of state.buildings.values()) {
        if (b.id !== buildingId && b.isBuilt && x >= b.tileX && x < b.tileX + b.size.w &&
            y >= b.tileY && y < b.tileY + b.size.h) return false
      }
      return true
    }

    const gridPath = findPath(state.terrain, startCol, startRow, targetCol, targetRow, walkableCheck)
    if (gridPath.length >= 2) {
      entity.path = pathToWorldPath(gridPath)
      entity.pathIndex = 0
      entity.progress = 0
      entity.totalDistance = computePathLength(entity.path)
      entity.distanceTraveled = 0
      updateAnimDir(entity, entity.path[0], entity.path[1])
    } else {
      entity.path = null
    }
  }
}

/**
 * 每帧更新所有移动中的单位
 */
export function updateMovement(dt) {
  const state = getState()
  if (!state.mapReady) return

  for (const entity of state.entities.values()) {
    if (entity.entityType !== 'unit') continue
    if (entity.state === ENTITY_STATE.DEAD) continue

    // 有路径的单位进行移动
    if (entity.path && entity.pathIndex < entity.path.length - 1) {
      moveAlongPath(entity, dt)
    }
  }
}

function moveAlongPath(entity, dt) {
  const from = entity.path[entity.pathIndex]
  const to = entity.path[entity.pathIndex + 1]
  const dx = to.x - from.x
  const dy = to.y - from.y
  const segDist = Math.sqrt(dx * dx + dy * dy)

  if (segDist < 0.01) {
    entity.pathIndex++
    entity.progress = 0
    if (entity.pathIndex >= entity.path.length - 1) {
      onPathComplete(entity)
    }
    return
  }

  // 匀速移动
  const speed = entity.moveSpeed

  entity.progress += (speed * dt) / segDist
  entity.distanceTraveled += speed * dt

  if (entity.progress >= 1) {
    entity.pathIndex++
    entity.progress = 0

    if (entity.pathIndex >= entity.path.length - 1) {
      onPathComplete(entity)
    } else {
      const curr = entity.path[entity.pathIndex]
      entity.x = curr.x
      entity.y = curr.y
      const next = entity.path[entity.pathIndex + 1]
      updateAnimDir(entity, curr, next)
    }
  } else {
    entity.x = from.x + dx * entity.progress
    entity.y = from.y + dy * entity.progress
  }
}

function onPathComplete(entity) {
  const endPt = entity.path[entity.path.length - 1]
  entity.x = endPt.x
  entity.y = endPt.y
  entity.path = null
  entity.pathIndex = 0
  entity.progress = 0

  // 根据当前意图决定下一步
  if (entity.targetId) {
    // 攻击目标 → CombatSystem 接管
    entity.state = ENTITY_STATE.ATTACKING
    entity.animState = 'attack'
  } else if (entity.gatherTargetIdx >= 0) {
    // 采集目标
    entity.state = ENTITY_STATE.GATHERING
    entity.animState = 'gather'
    entity.gatherCooldown = 0
  } else if (entity.buildTargetId) {
    // 建造目标
    entity.state = ENTITY_STATE.BUILDING
    entity.animState = 'build'
  } else if (entity.carrying) {
    // 携带资源返回
    entity.state = ENTITY_STATE.RETURNING
    entity.animState = 'walk'
  } else {
    entity.state = ENTITY_STATE.IDLE
    entity.animState = 'idle'
  }
}

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

function updateAnimDir(entity, from, to) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) > Math.abs(dy)) {
    entity.animDir = dx > 0 ? 1 : 3 // 右 : 左
  } else {
    entity.animDir = dy > 0 ? 2 : 0 // 下 : 上
  }
}

function getResourceAt(tileX, tileY) {
  const state = getState()
  if (tileX < 0 || tileX >= COLS || tileY < 0 || tileY >= ROWS) return null
  const idx = tileY * COLS + tileX
  const key = state.resource[idx]
  if (!key) return null
  const def = RESOURCE_DEFS[key]
  if (!def) return null
  return { key, def, amount: state.resourceAmount[idx] }
}
