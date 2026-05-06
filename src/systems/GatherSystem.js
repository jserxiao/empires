/**
 * 采集系统 - 管理农夫的资源采集和运送
 * 采集循环：走到资源旁 → 采集 → 携带资源 → 返回仓库 → 存入 → 再次采集
 */

import { getState, addResource, consumeResource } from '../core/GameState.js'
import { MAP_CONFIG, ENTITY_STATE, RESOURCE_DEFS } from '../core/constants.js'
import { findPath, pathToWorldPath, computePathLength } from '../core/Pathfinding.js'

const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG

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

  if (!resourceKey || state.resourceAmount[idx] <= 0) {
    const nearby = findNearbyResource(state, tileX, tileY)
    if (nearby) {
      entity.gatherTargetIdx = nearby.tileY * COLS + nearby.tileX
      moveEntityTo(entity, nearby.tileX, nearby.tileY, state)
    } else {
      entity.state = ENTITY_STATE.IDLE
      entity.animState = 'idle'
      entity.gatherTargetIdx = -1
    }
    return
  }

  const resCenterX = tileX * TILE_SIZE + TILE_SIZE / 2
  const resCenterY = tileY * TILE_SIZE + TILE_SIZE / 2
  const dx = resCenterX - entity.x
  const dy = resCenterY - entity.y
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (dist > TILE_SIZE * 1.5) {
    moveEntityTo(entity, tileX, tileY, state)
    return
  }

  entity.gatherCooldown -= dt
  if (entity.gatherCooldown > 0) return

  const def = RESOURCE_DEFS[resourceKey]
  if (!def) return

  entity.gatherCooldown = 1 / def.gatherRate

  const gathered = consumeResource(tileX, tileY, entity.carryAmount)
  if (gathered > 0) {
    entity.carrying = { type: def.type, amount: gathered }

    const dropSite = findNearestDropSite(state, entity.x, entity.y, def.type)
    if (dropSite) {
      moveEntityTo(entity, dropSite.tileX, dropSite.tileY, state)
      entity.state = ENTITY_STATE.RETURNING
    } else {
      addResource(entity.team, def.type, gathered)
      entity.carrying = null
      entity.state = ENTITY_STATE.IDLE
      entity.animState = 'idle'
    }
  }
}

function processReturn(entity, state) {
  if (!entity.path) {
    if (entity.carrying) {
      addResource(entity.team, entity.carrying.type, entity.carrying.amount)
      entity.carrying = null
    }

    if (entity.gatherTargetIdx >= 0) {
      const tileX = entity.gatherTargetIdx % COLS
      const tileY = Math.floor(entity.gatherTargetIdx / COLS)
      moveEntityTo(entity, tileX, tileY, state)
    } else {
      entity.state = ENTITY_STATE.IDLE
      entity.animState = 'idle'
    }
  }
}

function moveEntityTo(entity, tileX, tileY, state) {
  const startCol = Math.floor(entity.x / TILE_SIZE)
  const startRow = Math.floor(entity.y / TILE_SIZE)

  const walkableCheck = (x, y) => {
    for (const b of state.buildings.values()) {
      if (x >= b.tileX && x < b.tileX + b.size.w &&
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

function findNearbyResource(state, centerX, centerY) {
  for (let r = 1; r <= 8; r++) {
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
