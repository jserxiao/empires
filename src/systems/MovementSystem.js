/**
 * 移动系统 - 管理所有单位的路径跟随和位置更新
 *
 * 关键改进：
 * - 单位只有一份位置数据（entity.x, entity.y），不存在 tile/movingUnits 双写问题
 * - 平滑插值：像素级世界坐标
 * - 集群移动：多单位目标分散
 */

import { getState, getMapData, createWalkableCheck, spatialUpdateUnit } from '../core/GameState.js'
import { findPath, pathToWorldPath, computePathLength, distributeTargets } from '../core/Pathfinding.js'
import { MAP_CONFIG, ENTITY_STATE, TERRAIN, RESOURCE_DEFS } from '../core/constants.js'

const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG

// 缓入缓出距离
const EASE_DISTANCE = TILE_SIZE * 1.5

/**
 * 发出移动命令
 * @param {number[]} unitIds - 要移动的单位 ID 列表
 * @param {number} targetCol - 目标列
 * @param {number} targetRow - 目标行
 */
/**
 * 将当前实际位置插入路径开头，避免闪回格子中心
 * 当单位不在格子正中心时，先从当前位置平滑走到第一个路径点
 */
export function prependCurrentPosition(entity, worldPath) {
  const first = worldPath[0]
  const dx = entity.x - first.x
  const dy = entity.y - first.y
  // 如果当前位置和路径起点差距很小，不需要插入
  if (dx * dx + dy * dy < 1) return worldPath
  return [{ x: entity.x, y: entity.y }, ...worldPath]
}

export function commandMove(unitIds, targetCol, targetRow) {
  const state = getState()
  const { terrain } = getMapData()

  const walkableCheck = createWalkableCheck(state)

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

    const worldPath = prependCurrentPosition(entity, pathToWorldPath(gridPath))
    const totalDistance = computePathLength(worldPath)

    entity.path = worldPath
    entity.pathIndex = 0
    entity.progress = 0
    entity.totalDistance = totalDistance
    entity.distanceTraveled = 0
    entity.state = ENTITY_STATE.MOVING
    entity.targetId = null
    entity.gatherTargetIdx = -1
    entity.gatherResourceType = null
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

  // 如果目标是建筑，寻路时排除该建筑以便走近攻击
  const excludeId = target.entityType === 'building' ? targetId : undefined
  const walkableCheck = createWalkableCheck(state, excludeId)

  for (const id of unitIds) {
    const entity = state.entities.get(id)
    if (!entity || entity.entityType !== 'unit') continue
    if (entity.state === ENTITY_STATE.DEAD) continue

    entity.targetId = targetId
    entity.state = ENTITY_STATE.MOVING
    entity.animState = 'walk'
    // 清除之前的采集/建造目标，防止攻击命令被覆盖
    entity.gatherTargetIdx = -1
    entity.gatherResourceType = null
    entity.buildTargetId = null

    const startCol = Math.floor(entity.x / TILE_SIZE)
    const startRow = Math.floor(entity.y / TILE_SIZE)

    let targetCol, targetRow
    if (target.entityType === 'building') {
      // 建筑目标：寻路到建筑周围最近的相邻可通行格子，避免走进建筑内部
      const adjacent = findAdjacentWalkable(state, target, startCol, startRow, walkableCheck)
      if (adjacent) {
        targetCol = adjacent.col
        targetRow = adjacent.row
      } else {
        // 没有可达的相邻格子，不移动
        continue
      }
    } else {
      // 单位目标：寻路到单位位置
      targetCol = Math.floor(target.x / TILE_SIZE)
      targetRow = Math.floor(target.y / TILE_SIZE)
    }

    const gridPath = findPath(state.terrain, startCol, startRow, targetCol, targetRow, walkableCheck)
    if (gridPath.length >= 2) {
const _wp = prependCurrentPosition(entity, pathToWorldPath(gridPath))
entity.path = _wp
entity.pathIndex = 0
entity.progress = 0
entity.totalDistance = computePathLength(_wp)
entity.distanceTraveled = 0
updateAnimDir(entity, _wp[0], _wp[1])
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
    entity.gatherResourceType = resource.def.type  // 记录正在采集的资源类型
    entity.state = ENTITY_STATE.MOVING
    entity.animState = 'walk'
    entity.targetId = null
    entity.buildTargetId = null

    // 移动到资源旁边的可通行格子（而非资源格本身）
    const startCol = Math.floor(entity.x / TILE_SIZE)
    const startRow = Math.floor(entity.y / TILE_SIZE)

    // 寻路不排除资源障碍，所有资源都是不可通行的
    const walkableCheck = createWalkableCheck(state)

    // 寻找资源格周围最近的相邻可通行格子
    const adjacent = findAdjacentWalkableForResource(state, tileX, tileY, startCol, startRow, walkableCheck)
    if (!adjacent) {
      entity.path = null
      continue
    }

    const gridPath = findPath(state.terrain, startCol, startRow, adjacent.col, adjacent.row, walkableCheck)
    if (gridPath.length >= 2) {
const _wp = prependCurrentPosition(entity, pathToWorldPath(gridPath))
entity.path = _wp
entity.pathIndex = 0
entity.progress = 0
entity.totalDistance = computePathLength(_wp)
entity.distanceTraveled = 0
updateAnimDir(entity, _wp[0], _wp[1])
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

  // 寻路时排除目标建筑本身，让农民能走到建筑旁边
  const walkableCheck = createWalkableCheck(state, buildingId)

  for (const id of unitIds) {
    const entity = state.entities.get(id)
    if (!entity || !entity.gatherer) continue
    if (entity.state === ENTITY_STATE.DEAD) continue

    entity.buildTargetId = buildingId
    entity.state = ENTITY_STATE.MOVING
    entity.animState = 'walk'
    entity.targetId = null
    entity.gatherTargetIdx = -1

    // 移动到建筑旁边的可通行格子，而非建筑内部
    const startCol = Math.floor(entity.x / TILE_SIZE)
    const startRow = Math.floor(entity.y / TILE_SIZE)
    const adjacent = findAdjacentWalkable(state, building, startCol, startRow, walkableCheck)
    if (!adjacent) continue
    const targetCol = adjacent.col
    const targetRow = adjacent.row

    const gridPath = findPath(state.terrain, startCol, startRow, targetCol, targetRow, walkableCheck)
    if (gridPath.length >= 2) {
const _wp = prependCurrentPosition(entity, pathToWorldPath(gridPath))
entity.path = _wp
entity.pathIndex = 0
entity.progress = 0
entity.totalDistance = computePathLength(_wp)
entity.distanceTraveled = 0
updateAnimDir(entity, _wp[0], _wp[1])
    } else {
      entity.path = null
    }
  }
}

/**
 * 寻找资源格周围最近的相邻可通行格子
 * 与建筑不同，资源是单格，所以先检查四周4个正方向，再尝试对角线
 * @param {object} state - 游戏状态
 * @param {number} tileX - 资源格列
 * @param {number} tileY - 资源格行
 * @param {number} fromCol - 起点列
 * @param {number} fromRow - 起点行
 * @param {function} walkableCheck - 可通行检查函数
 * @returns {{col: number, row: number}|null}
 */
export function findAdjacentWalkableForResource(state, tileX, tileY, fromCol, fromRow, walkableCheck) {
  // 4个正方向（上下左右）
  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
  ]

  let bestDist = Infinity
  let best = null

  for (const dir of dirs) {
    const nx = tileX + dir.dx
    const ny = tileY + dir.dy
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
    if (!walkableCheck(nx, ny)) continue
    const dist = Math.abs(nx - fromCol) + Math.abs(ny - fromRow)
    if (dist < bestDist) {
      bestDist = dist
      best = { col: nx, row: ny }
    }
  }

  // 如果4个正方向都没找到，尝试4个对角线方向
  if (!best) {
    const diags = [
      { dx: -1, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: -1, dy: 1 },
      { dx: 1, dy: 1 },
    ]
    for (const dir of diags) {
      const nx = tileX + dir.dx
      const ny = tileY + dir.dy
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
      // 对角线方向需检查两侧格子是否也可通行（避免穿墙）
      const side1x = tileX + dir.dx, side1y = tileY
      const side2x = tileX, side2y = tileY + dir.dy
      if (side1x < 0 || side1x >= COLS || side1y < 0 || side1y >= ROWS) continue
      if (side2x < 0 || side2x >= COLS || side2y < 0 || side2y >= ROWS) continue
      if (!walkableCheck(side1x, side1y) || !walkableCheck(side2x, side2y)) continue
      if (!walkableCheck(nx, ny)) continue
      const dist = Math.abs(nx - fromCol) + Math.abs(ny - fromRow)
      if (dist < bestDist) {
        bestDist = dist
        best = { col: nx, row: ny }
      }
    }
  }

  return best
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
  // 记录旧位置用于空间索引更新
  const oldX = entity.x
  const oldY = entity.y

  // 匀速移动
  const speed = entity.moveSpeed
  let remainingDist = speed * dt
  entity.distanceTraveled += remainingDist

  // 循环消耗剩余移动距离，避免跨段时丢失进度导致闪回
  let iterations = 0
  const MAX_ITERATIONS = 10 // 安全限制，防止无限循环

  while (remainingDist > 0.01 && iterations < MAX_ITERATIONS) {
    iterations++

    if (entity.pathIndex >= entity.path.length - 1) {
      onPathComplete(entity)
      break
    }

    const from = entity.path[entity.pathIndex]
    const to = entity.path[entity.pathIndex + 1]
    const dx = to.x - from.x
    const dy = to.y - from.y
    const segDist = Math.sqrt(dx * dx + dy * dy)

    if (segDist < 0.01) {
      // 跳过零长段
      entity.pathIndex++
      entity.progress = 0
      continue
    }

    // 当前段剩余距离
    const remainingInSeg = (1 - entity.progress) * segDist

    if (remainingDist >= remainingInSeg) {
      // 可以走完当前段
      // 检查目标格子是否仍然可通行
      const state = getState()
      const targetTileX = Math.floor(to.x / TILE_SIZE)
      const targetTileY = Math.floor(to.y / TILE_SIZE)
      const walkableCheck = createWalkableCheck(state)
      if (!walkableCheck(targetTileX, targetTileY)) {
        entity.path = null
        entity.state = ENTITY_STATE.IDLE
        entity.animState = 'idle'
        break
      }

      remainingDist -= remainingInSeg
      entity.pathIndex++
      entity.progress = 0

      if (entity.pathIndex >= entity.path.length - 1) {
        onPathComplete(entity)
        break
      } else {
        // 位置设为新段的起点
        const curr = entity.path[entity.pathIndex]
        entity.x = curr.x
        entity.y = curr.y
        const next = entity.path[entity.pathIndex + 1]
        updateAnimDir(entity, curr, next)
      }
    } else {
      // 在当前段内移动
      entity.progress += remainingDist / segDist

      const newX = from.x + dx * entity.progress
      const newY = from.y + dy * entity.progress

      // 检查新位置所在格子是否可通行
      const state = getState()
      const newTileX = Math.floor(newX / TILE_SIZE)
      const newTileY = Math.floor(newY / TILE_SIZE)
      const oldTileX = Math.floor(entity.x / TILE_SIZE)
      const oldTileY = Math.floor(entity.y / TILE_SIZE)
      if (newTileX !== oldTileX || newTileY !== oldTileY) {
        const walkableCheck = createWalkableCheck(state)
        if (!walkableCheck(newTileX, newTileY)) {
          entity.path = null
          entity.state = ENTITY_STATE.IDLE
          entity.animState = 'idle'
          break
        }
      }

      entity.x = newX
      entity.y = newY
      remainingDist = 0
    }
  }

  // 更新空间索引
  spatialUpdateUnit(entity, oldX, oldY)
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
  } else if (entity.carrying) {
    // 携带资源返回（优先级高于采集，因为负重满了需要先提交）
    entity.state = ENTITY_STATE.RETURNING
    entity.animState = 'walk'
  } else if (entity.gatherTargetIdx >= 0) {
    // 采集目标
    entity.state = ENTITY_STATE.GATHERING
    entity.animState = 'gather'
    entity.gatherCooldown = 0
  } else if (entity.buildTargetId) {
    // 建造目标
    entity.state = ENTITY_STATE.BUILDING
    entity.animState = 'build'
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

/**
 * 寻找建筑周围最近的相邻可通行格子
 * 遍历建筑四周边缘外侧的格子，找到离起点最近的可通行格子
 * @param {object} state - 游戏状态
 * @param {object} building - 建筑实体
 * @param {number} fromCol - 起点列
 * @param {number} fromRow - 起点行
 * @param {function} walkableCheck - 可通行检查函数
 * @returns {{col: number, row: number}|null}
 */
export function findAdjacentWalkable(state, building, fromCol, fromRow, walkableCheck) {
  const bx = building.tileX
  const by = building.tileY
  const bw = building.size.w
  const bh = building.size.h

  let bestDist = Infinity
  let best = null

  // 遍历建筑周围一圈（紧邻建筑边缘外侧1格）
  for (let dy = -1; dy <= bh; dy++) {
    for (let dx = -1; dx <= bw; dx++) {
      // 只取边缘外侧的格子（跳过建筑内部和角落对角线）
      const isEdge = (dy === -1 || dy === bh) || (dx === -1 || dx === bw)
      if (!isEdge) continue
      // 跳过四个角的对角线格子（避免对角穿墙问题）
      const isCorner = (dy === -1 || dy === bh) && (dx === -1 || dx === bw)
      if (isCorner) continue

      const nx = bx + dx
      const ny = by + dy
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue

      if (walkableCheck(nx, ny)) {
        const dist = Math.abs(nx - fromCol) + Math.abs(ny - fromRow)
        if (dist < bestDist) {
          bestDist = dist
          best = { col: nx, row: ny }
        }
      }
    }
  }

  // 如果没找到非角落的，退而求其次检查角落（但需验证对角线两侧可通行，避免穿墙）
  if (!best) {
    for (let dy = -1; dy <= bh; dy++) {
      for (let dx = -1; dx <= bw; dx++) {
        const isEdge = (dy === -1 || dy === bh) || (dx === -1 || dx === bw)
        if (!isEdge) continue
        const isCorner = (dy === -1 || dy === bh) && (dx === -1 || dx === bw)
        const nx = bx + dx
        const ny = by + dy
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
        // 角落格子需检查两个相邻侧是否也可通行
        if (isCorner) {
          // 角落在 (nx, ny)，需检查 (nx, by) 和 (bx, ny) 是否可通行
          const side1x = nx, side1y = by + (dy === -1 ? 0 : bh)
          const side2x = bx + (dx === -1 ? 0 : bw), side2y = ny
          if (side1x >= 0 && side1x < COLS && side1y >= 0 && side1y < ROWS &&
              side2x >= 0 && side2x < COLS && side2y >= 0 && side2y < ROWS) {
            if (!walkableCheck(side1x, side1y) || !walkableCheck(side2x, side2y)) continue
          }
        }
        if (walkableCheck(nx, ny)) {
          const dist = Math.abs(nx - fromCol) + Math.abs(ny - fromRow)
          if (dist < bestDist) {
            bestDist = dist
            best = { col: nx, row: ny }
          }
        }
      }
    }
  }

  return best
}
