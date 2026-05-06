/**
 * 战斗系统 - 管理单位的攻击逻辑
 *
 * - 进入攻击范围后自动攻击
 * - 近战/远程统一处理
 * - 仇恨范围自动锁定
 * - 死亡处理
 */

import { getState, removeEntity } from '../core/GameState.js'
import { MAP_CONFIG, ENTITY_STATE, TEAM } from '../core/constants.js'
import { findPath, pathToWorldPath, computePathLength } from '../core/Pathfinding.js'

const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG

/**
 * 每帧更新战斗
 */
export function updateCombat(dt) {
  const state = getState()
  if (!state.mapReady) return

  const projectiles = []

  for (const entity of state.entities.values()) {
    if (entity.entityType !== 'unit') continue
    if (entity.state === ENTITY_STATE.DEAD) continue

    // 攻击中的单位
    if (entity.state === ENTITY_STATE.ATTACKING) {
      processAttack(entity, dt, projectiles)
    }

    // 空闲单位检查仇恨范围
    if (entity.state === ENTITY_STATE.IDLE || entity.state === ENTITY_STATE.MOVING) {
      checkAggro(entity)
    }
  }

  // 建筑攻击（箭塔等）
  for (const building of state.buildings.values()) {
    if (!building.isBuilt || !building.attack) continue
    processBuildingAttack(building, dt, projectiles)
  }

  return projectiles
}

function processAttack(entity, dt, projectiles) {
  const state = getState()
  const target = state.entities.get(entity.targetId)

  if (!target || target.state === ENTITY_STATE.DEAD) {
    entity.targetId = null
    entity.state = ENTITY_STATE.IDLE
    entity.animState = 'idle'
    return
  }

  // 计算距离
  const dx = target.x - entity.x
  const dy = target.y - entity.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const attackRange = entity.range * TILE_SIZE

  // 超出攻击范围 → 重新移动
  if (dist > attackRange + TILE_SIZE) {
    entity.state = ENTITY_STATE.MOVING
    entity.animState = 'walk'
    // 重新寻路到目标
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
    }
    return
  }

  // 在攻击范围内 → 更新朝向
  if (dx > Math.abs(dy)) entity.animDir = 1      // 右
  else if (dx < -Math.abs(dy)) entity.animDir = 3 // 左
  else if (dy > 0) entity.animDir = 2              // 下
  else entity.animDir = 0                           // 上

  // 攻击冷却
  entity.attackCooldown -= dt
  if (entity.attackCooldown <= 0) {
    entity.attackCooldown = 1 / entity.attackSpeed

    if (entity.range <= 1) {
      // 近战：直接扣血
      const damage = Math.max(1, entity.attack - (target.armor || 0))
      target.hp -= damage
    } else {
      // 远程：创建弹道
      projectiles.push({
        startX: entity.x,
        startY: entity.y,
        targetId: target.id,
        targetX: target.x,
        targetY: target.y,
        damage: Math.max(1, entity.attack - (target.armor || 0)),
        speed: 500, // 像素/秒
        progress: 0,
      })
    }

    // 检查目标死亡
    if (target.hp <= 0) {
      target.hp = 0
      target.state = ENTITY_STATE.DEAD
      target.animState = 'death'
      // 延迟移除（等死亡动画播放）
      setTimeout(() => removeEntity(target.id), 500)
      entity.targetId = null
      entity.state = ENTITY_STATE.IDLE
      entity.animState = 'idle'
    }
  }
}

function checkAggro(entity) {
  const state = getState()
  if (entity.team === TEAM.NEUTRAL) return

  const aggroRange = entity.aggroRange * TILE_SIZE

  for (const other of state.entities.values()) {
    if (other.id === entity.id) continue
    if (other.entityType !== 'unit' && other.entityType !== 'building') continue
    if (other.state === ENTITY_STATE.DEAD) continue
    if (other.team === entity.team || other.team === TEAM.NEUTRAL) continue

    const dx = other.x - entity.x
    const dy = other.y - entity.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist <= aggroRange) {
      entity.targetId = other.id
      if (dist <= entity.range * TILE_SIZE) {
        entity.state = ENTITY_STATE.ATTACKING
        entity.animState = 'attack'
      } else {
        entity.state = ENTITY_STATE.MOVING
        entity.animState = 'walk'
        // 寻路到目标
        const targetCol = Math.floor(other.x / TILE_SIZE)
        const targetRow = Math.floor(other.y / TILE_SIZE)
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
        }
      }
      return
    }
  }
}

function processBuildingAttack(building, dt, projectiles) {
  const state = getState()

  building.attackCooldown -= dt
  if (building.attackCooldown > 0) return

  const bx = (building.tileX + building.size.w / 2) * TILE_SIZE
  const by = (building.tileY + building.size.h / 2) * TILE_SIZE
  const attackRange = building.range * TILE_SIZE

  for (const entity of state.entities.values()) {
    if (entity.entityType !== 'unit') continue
    if (entity.state === ENTITY_STATE.DEAD) continue
    if (entity.team === building.team || entity.team === TEAM.NEUTRAL) continue

    const dx = entity.x - bx
    const dy = entity.y - by
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist <= attackRange) {
      building.attackCooldown = 1 / building.attackSpeed
      projectiles.push({
        startX: bx,
        startY: by,
        targetId: entity.id,
        targetX: entity.x,
        targetY: entity.y,
        damage: building.attack,
        speed: 400,
        progress: 0,
      })

      // 弹道命中后扣血（简化：立即扣血）
      const damage = Math.max(1, building.attack - (entity.armor || 0))
      entity.hp -= damage
      if (entity.hp <= 0) {
        entity.hp = 0
        entity.state = ENTITY_STATE.DEAD
        entity.animState = 'death'
        setTimeout(() => removeEntity(entity.id), 500)
      }
      return
    }
  }
}

/**
 * 更新弹道
 */
export function updateProjectiles(projectiles, dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]
    const dx = p.targetX - p.startX
    const dy = p.targetY - p.startY
    const dist = Math.sqrt(dx * dx + dy * dy)
    p.progress += (p.speed * dt) / Math.max(dist, 1)
    if (p.progress >= 1) {
      projectiles.splice(i, 1)
    }
  }
}
