/**
 * 采集系统 - 管理农夫的资源采集和运送
 *
 * 采集循环：走到资源旁 → 持续采集直到负重满 → 携带资源返回仓库 → 存入 → 再次采集
 * - 农民有最大负重(maxCarry)，采集到负重满后才返回提交资源
 * - 如果当前采集的资源耗尽，搜索附近同类型资源继续采集
 * - 如果附近一定范围内没有同类型资源了，则留在原地变为空闲
 */

import { getState, addResource, consumeResource, clearSelectedResourceIfDepleted, createWalkableCheck } from '../core/GameState.js'
import { MAP_CONFIG, ENTITY_STATE, RESOURCE_DEFS } from '../core/constants.js'
import { findPath, pathToWorldPath, computePathLength } from '../core/Pathfinding.js'
import { findAdjacentWalkableForResource, prependCurrentPosition } from './MovementSystem.js'
import { invalidateStaticCache } from '../game/GameRenderer.js'

const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG

// 搜索同类资源的范围（曼哈顿距离）
const SAME_TYPE_SEARCH_RADIUS = 8

export function updateGather(dt) {
  const state = getState()
  if (!state.mapReady) return

  for (const entity of state.entities.values()) {
    if (entity.entityType !== 'unit' || !entity.gatherer) continue
    if (entity.state === ENTITY_STATE.DEAD) continue

    if (entity.state === ENTITY_STATE.GATHERING) {
      processGather(entity, dt, state)
    } else if (entity.state === ENTITY_STATE.RETURNING) {
      processReturn(entity, state)
    }
  }
}

function processGather(entity, dt, state) {
  const idx = entity.gatherTargetIdx
  if (idx < 0) {
    entity.state = ENTITY_STATE.IDLE
    entity.animState = 'idle'
    return
  }

  const tileX = idx % COLS
  const tileY = Math.floor(idx / COLS)
  const resourceKey = state.resource[idx]

  // 资源已被采完
  if (!resourceKey || state.resourceAmount[idx] <= 0) {
    // 获取当前正在采集的资源类型
    const currentResType = entity.carrying?.type ||
      (resourceKey ? RESOURCE_DEFS[resourceKey]?.type : null)

    // 搜索附近同类型的资源
    const nearby = findNearbySameTypeResource(state, tileX, tileY, currentResType)
    if (nearby) {
      // 找到同类型资源，记录资源类型以便后续搜索
      entity.gatherResourceType = RESOURCE_DEFS[state.resource[nearby.tileY * COLS + nearby.tileX]]?.type || currentResType
      entity.gatherTargetIdx = nearby.tileY * COLS + nearby.tileX
      moveEntityTo(entity, nearby.tileX, nearby.tileY, state)
    } else {
      // 附近没有同类型资源了
      // 如果身上已经有携带的资源，先回去提交
      if (entity.carrying && entity.carrying.amount > 0) {
        const dropSite = findNearestDropSite(state, entity.x, entity.y, entity.carrying.type)
        if (dropSite) {
          moveEntityTo(entity, dropSite.tileX, dropSite.tileY, state)
          entity.state = ENTITY_STATE.RETURNING
        } else {
          // 没有仓库，直接加资源，留在原地
          addResource(entity.team, entity.carrying.type, entity.carrying.amount)
          entity.carrying = null
          entity.state = ENTITY_STATE.IDLE
          entity.animState = 'idle'
          entity.gatherTargetIdx = -1
          entity.gatherResourceType = null
        }
      } else {
        // 身上没有资源，留在原地变为空闲
        entity.state = ENTITY_STATE.IDLE
        entity.animState = 'idle'
        entity.gatherTargetIdx = -1
        entity.gatherResourceType = null
      }
    }
    return
  }

  // 检查距离是否足够近
  const resCenterX = tileX * TILE_SIZE + TILE_SIZE / 2
  const resCenterY = tileY * TILE_SIZE + TILE_SIZE / 2
  const dx = resCenterX - entity.x
  const dy = resCenterY - entity.y
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (dist > TILE_SIZE * 1.5) {
    moveEntityTo(entity, tileX, tileY, state)
    return
  }

  // 检查负重是否已满
  const maxCarry = entity.maxCarry || 20
  const currentCarry = entity.carrying ? entity.carrying.amount : 0
  if (currentCarry >= maxCarry) {
    // 负重已满，返回提交资源
    const def = RESOURCE_DEFS[resourceKey]
    const resourceType = entity.carrying?.type || def?.type
    const dropSite = findNearestDropSite(state, entity.x, entity.y, resourceType)
    if (dropSite) {
      moveEntityTo(entity, dropSite.tileX, dropSite.tileY, state)
      entity.state = ENTITY_STATE.RETURNING
    } else {
      // 没有仓库，直接加资源
      if (entity.carrying) {
        addResource(entity.team, entity.carrying.type, entity.carrying.amount)
        entity.carrying = null
      }
      entity.state = ENTITY_STATE.IDLE
      entity.animState = 'idle'
    }
    return
  }

  // 采集冷却
  entity.gatherCooldown -= dt
  if (entity.gatherCooldown > 0) return

  const def = RESOURCE_DEFS[resourceKey]
  if (!def) return

  entity.gatherCooldown = 1 / def.gatherRate
  // 记录正在采集的资源类型
  entity.gatherResourceType = def.type

  // 计算本次能采集的数量（不超过剩余负重）
  const remainCarry = maxCarry - currentCarry
  const toGather = Math.min(entity.carryAmount || 2, remainCarry)

  const gathered = consumeResource(tileX, tileY, toGather)
  if (gathered > 0) {
    // 检查资源是否被采完，需要刷新静态缓存
    if (!state.resource[idx] || state.resourceAmount[idx] <= 0) {
      invalidateStaticCache()
      clearSelectedResourceIfDepleted()
    }

    if (entity.carrying) {
      entity.carrying.amount += gathered
    } else {
      entity.carrying = { type: def.type, amount: gathered }
    }

    // 采集后检查负重是否满了
    if (entity.carrying.amount >= maxCarry) {
      // 负重满了，返回提交
      const dropSite = findNearestDropSite(state, entity.x, entity.y, entity.carrying.type)
      if (dropSite) {
        moveEntityTo(entity, dropSite.tileX, dropSite.tileY, state)
        entity.state = ENTITY_STATE.RETURNING
      } else {
        addResource(entity.team, entity.carrying.type, entity.carrying.amount)
        entity.carrying = null
        entity.state = ENTITY_STATE.IDLE
        entity.animState = 'idle'
      }
    }
    // 负重未满，继续在当前位置采集（下一轮 processGather 会继续）
  }
}

function processReturn(entity, state) {
  if (!entity.path) {
    // 到达仓库，提交资源
    if (entity.carrying) {
      addResource(entity.team, entity.carrying.type, entity.carrying.amount)
      entity.carrying = null
    }

    // 提交后自动返回之前的采集点继续采集
    if (entity.gatherTargetIdx >= 0) {
      const tileX = entity.gatherTargetIdx % COLS
      const tileY = Math.floor(entity.gatherTargetIdx / COLS)
      const idx = entity.gatherTargetIdx

      // 检查原采集点是否还有资源
      if (state.resource[idx] && state.resourceAmount[idx] > 0) {
        moveEntityTo(entity, tileX, tileY, state)
      } else {
        // 原采集点资源耗尽，搜索附近同类型资源
        const resourceType = entity.gatherResourceType
        const nearby = findNearbySameTypeResource(state, tileX, tileY, resourceType)
        if (nearby) {
          entity.gatherTargetIdx = nearby.tileY * COLS + nearby.tileX
          moveEntityTo(entity, nearby.tileX, nearby.tileY, state)
        } else {
          // 没有同类型资源了，留在城镇中心附近变为空闲
          entity.state = ENTITY_STATE.IDLE
          entity.animState = 'idle'
          entity.gatherTargetIdx = -1
          entity.gatherResourceType = null
        }
      }
    } else {
      entity.state = ENTITY_STATE.IDLE
      entity.animState = 'idle'
      entity.gatherResourceType = null
    }
  }
}

function moveEntityTo(entity, tileX, tileY, state) {
  const startCol = Math.floor(entity.x / TILE_SIZE)
  const startRow = Math.floor(entity.y / TILE_SIZE)

  // 不排除资源障碍，所有资源都是不可通行的
  const walkableCheck = createWalkableCheck(state)

  // 寻找资源格周围最近的相邻可通行格子
  const adjacent = findAdjacentWalkableForResource(state, tileX, tileY, startCol, startRow, walkableCheck)
  if (!adjacent) {
    entity.state = ENTITY_STATE.IDLE
    entity.animState = 'idle'
    return
  }

  const gridPath = findPath(state.terrain, startCol, startRow, adjacent.col, adjacent.row, walkableCheck)
  if (gridPath.length >= 2) {
const _wp = prependCurrentPosition(entity, pathToWorldPath(gridPath))
entity.path = _wp
entity.pathIndex = 0
entity.progress = 0
entity.totalDistance = computePathLength(_wp)
entity.distanceTraveled = 0
    entity.state = ENTITY_STATE.MOVING
    entity.animState = 'walk'
  } else {
    entity.state = ENTITY_STATE.IDLE
    entity.animState = 'idle'
  }
}

function findNearestDropSite(state, wx, wy, resourceType) {
  let best = null
  let bestDist = Infinity

  for (const b of state.buildings.values()) {
    if (!b.isBuilt || !b.dropSite) continue
    // dropTypes 为 null 表示接受所有类型（城镇中心）
    if (b.dropTypes && !b.dropTypes.includes(resourceType)) continue

    const bx = (b.tileX + b.size.w / 2) * TILE_SIZE
    const by = (b.tileY + b.size.h / 2) * TILE_SIZE
    const dist = Math.sqrt((bx - wx) ** 2 + (by - wy) ** 2)
    if (dist < bestDist) {
      bestDist = dist
      best = b
    }
  }
  return best
}

/**
 * 搜索附近同类型的资源
 * @param {object} state - 游戏状态
 * @param {number} centerX - 中心瓦片X
 * @param {number} centerY - 中心瓦片Y
 * @param {string|null} resourceType - 资源类型（food/wood/gold/stone）
 * @returns {{tileX: number, tileY: number}|null}
 */
function findNearbySameTypeResource(state, centerX, centerY, resourceType) {
  if (!resourceType) return findNearbyResource(state, centerX, centerY)

  for (let r = 1; r <= SAME_TYPE_SEARCH_RADIUS; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const nx = centerX + dx, ny = centerY + dy
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
        const idx = ny * COLS + nx
        const resKey = state.resource[idx]
        if (resKey && state.resourceAmount[idx] > 0) {
          const def = RESOURCE_DEFS[resKey]
          if (def && def.type === resourceType) {
            return { tileX: nx, tileY: ny }
          }
        }
      }
    }
  }
  return null
}

/**
 * 搜索附近的任何资源（备用，当资源类型未知时使用）
 */
function findNearbyResource(state, centerX, centerY) {
  for (let r = 1; r <= SAME_TYPE_SEARCH_RADIUS; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const nx = centerX + dx, ny = centerY + dy
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
        const idx = ny * COLS + nx
        if (state.resource[idx] && state.resourceAmount[idx] > 0) {
          return { tileX: nx, tileY: ny }
        }
      }
    }
  }
  return null
}
