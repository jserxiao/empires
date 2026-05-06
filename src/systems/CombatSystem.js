/**
 * 战斗系统 - 管理单位的攻击逻辑
 *
 * - 进入攻击范围后自动攻击
 * - 近战/远程统一处理
 * - 仇恨范围自动锁定
 * - 死亡处理
 */

import { getState, removeEntity, createWalkableCheck, getEntitiesInRange } from '../core/GameState.js'
import { MAP_CONFIG, ENTITY_STATE, TEAM } from '../core/constants.js'
import { findPath, pathToWorldPath, computePathLength } from '../core/Pathfinding.js'
import { invalidateStaticCache } from '../game/GameRenderer.js'

const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG

/** 判断实体是否已死亡（兼容单位和建筑） */
function isDead(entity) {
  if (entity.entityType === 'building') return entity.hp <= 0
  return entity.state === ENTITY_STATE.DEAD
}

/** 击杀目标（单位和建筑统一处理） */
function killTarget(target, attacker) {
  target.hp = 0
  if (target.entityType === 'building') {
    // 建筑被摧毁：延迟移除并刷新静态缓存
    invalidateStaticCache()
    setTimeout(() => removeEntity(target.id), 300)
  } else {
    target.state = ENTITY_STATE.DEAD
    target.animState = 'death'
    setTimeout(() => removeEntity(target.id), 500)
  }
  if (attacker) {
    attacker.targetId = null
    attacker.state = ENTITY_STATE.IDLE
    attacker.animState = 'idle'
  }
}

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

  if (!target || isDead(target)) {
    entity.targetId = null
    entity.state = ENTITY_STATE.IDLE
    entity.animState = 'idle'
    return
  }

  // 计算距离（建筑用中心点）
  const tx = target.entityType === 'building'
    ? (target.tileX + target.size.w / 2) * TILE_SIZE
    : target.x
  const ty = target.entityType === 'building'
    ? (target.tileY + target.size.h / 2) * TILE_SIZE
    : target.y
  const dx = tx - entity.x
  const dy = ty - entity.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const attackRange = entity.range * TILE_SIZE

  // 超出攻击范围 → 重新移动
  if (dist > attackRange + TILE_SIZE) {
    entity.state = ENTITY_STATE.MOVING
    entity.animState = 'walk'
    // 重新寻路到目标
    const targetCol = Math.floor(tx / TILE_SIZE)
    const targetRow = Math.floor(ty / TILE_SIZE)
    const startCol = Math.floor(entity.x / TILE_SIZE)
    const startRow = Math.floor(entity.y / TILE_SIZE)

    // 如果目标是建筑，寻路时排除该建筑以便走近攻击
    const excludeId = target.entityType === 'building' ? target.id : undefined
    const walkableCheck = createWalkableCheck(state, excludeId)

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

    const damage = Math.max(1, entity.attack - (target.armor || 0))

    if (entity.range <= 1) {
      // 近战：直接扣血
      target.hp -= damage
      // 被攻击的农民逃跑
      if (target.gatherer && target.hp > 0) {
        fleeFromAttacker(target, entity)
      }
      // 检查目标死亡
      if (target.hp <= 0) {
        killTarget(target, entity)
      }
    } else {
      // 远程：创建弹道（命中后扣血）
      projectiles.push({
        startX: entity.x,
        startY: entity.y,
        attackerId: entity.id,
        targetId: target.id,
        targetX: tx,
        targetY: ty,
        damage,
        speed: 500, // 像素/秒
        progress: 0,
        onHit: true,  // 弹道命中时扣血
      })
    }
  }
}

function checkAggro(entity) {
  const state = getState()
  if (entity.team === TEAM.NEUTRAL) return

  // 农民不主动攻击，跳过仇恨检查
  if (entity.gatherer) return

  const aggroRange = entity.aggroRange * TILE_SIZE

  // 使用空间索引加速范围查询
  const nearby = getEntitiesInRange(entity.x, entity.y, aggroRange)
  for (const other of nearby) {
    if (other.id === entity.id) continue
    if (other.entityType !== 'unit' && other.entityType !== 'building') continue
    if (isDead(other)) continue
    if (other.team === entity.team || other.team === TEAM.NEUTRAL) continue

    // 计算与目标的距离
    const ox = other.entityType === 'building'
      ? (other.tileX + other.size.w / 2) * TILE_SIZE : other.x
    const oy = other.entityType === 'building'
      ? (other.tileY + other.size.h / 2) * TILE_SIZE : other.y
    const dx = ox - entity.x
    const dy = oy - entity.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    entity.targetId = other.id
    if (dist <= entity.range * TILE_SIZE) {
      entity.state = ENTITY_STATE.ATTACKING
      entity.animState = 'attack'
    } else {
      entity.state = ENTITY_STATE.MOVING
      entity.animState = 'walk'
      // 寻路到目标
      const targetCol = Math.floor(ox / TILE_SIZE)
      const targetRow = Math.floor(oy / TILE_SIZE)
      const startCol = Math.floor(entity.x / TILE_SIZE)
      const startRow = Math.floor(entity.y / TILE_SIZE)

      // 如果仇恨目标是建筑，寻路时排除该建筑
      const excludeId = other.entityType === 'building' ? other.id : undefined
      const walkableCheck = createWalkableCheck(state, excludeId)

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

/**
 * 农民被攻击逃跑逻辑
 * 当农民受到伤害时，向远离攻击者的方向逃跑
 * @param {object} victim - 被攻击的实体
 * @param {object} attacker - 攻击者
 */
export function fleeFromAttacker(victim, attacker) {
  if (!victim.gatherer) return  // 只有农民逃跑
  if (victim.state === ENTITY_STATE.DEAD) return

  const state = getState()

  // 计算逃跑方向：远离攻击者
  const dx = victim.x - (attacker.entityType === 'building'
    ? (attacker.tileX + attacker.size.w / 2) * TILE_SIZE : attacker.x)
  const dy = victim.y - (attacker.entityType === 'building'
    ? (attacker.tileY + attacker.size.h / 2) * TILE_SIZE : attacker.y)
  const dist = Math.sqrt(dx * dx + dy * dy) || 1

  // 逃跑目标：沿远离方向跑 5 格
  const fleeDist = 5
  const targetCol = Math.floor(victim.x / TILE_SIZE + (dx / dist) * fleeDist)
  const targetRow = Math.floor(victim.y / TILE_SIZE + (dy / dist) * fleeDist)

  // 限制在地图范围内
  const clampedCol = Math.max(1, Math.min(COLS - 2, targetCol))
  const clampedRow = Math.max(1, Math.min(ROWS - 2, targetRow))

  const startCol = Math.floor(victim.x / TILE_SIZE)
  const startRow = Math.floor(victim.y / TILE_SIZE)

  // 中断当前动作
  victim.targetId = null
  victim.gatherTargetIdx = -1
  victim.gatherResourceType = null
  victim.buildTargetId = null
  victim.carrying = null  // 逃跑时丢弃携带的资源

  const walkableCheck = createWalkableCheck(state)
  const gridPath = findPath(state.terrain, startCol, startRow, clampedCol, clampedRow, walkableCheck)
  if (gridPath.length >= 2) {
    victim.path = pathToWorldPath(gridPath)
    victim.pathIndex = 0
    victim.progress = 0
    victim.totalDistance = computePathLength(victim.path)
    victim.distanceTraveled = 0
    victim.state = ENTITY_STATE.MOVING
    victim.animState = 'walk'
  }
}

function processBuildingAttack(building, dt, projectiles) {
  const state = getState()

  building.attackCooldown -= dt
  if (building.attackCooldown > 0) return

  const bx = (building.tileX + building.size.w / 2) * TILE_SIZE
  const by = (building.tileY + building.size.h / 2) * TILE_SIZE
  const attackRange = building.range * TILE_SIZE

  // 使用空间索引查找附近敌人
  const nearby = getEntitiesInRange(bx, by, attackRange)
  for (const entity of nearby) {
    if (entity.entityType !== 'unit') continue
    if (isDead(entity)) continue
    if (entity.team === building.team || entity.team === TEAM.NEUTRAL) continue

    const dx = entity.x - bx
    const dy = entity.y - by
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist <= attackRange) {
      building.attackCooldown = 1 / building.attackSpeed
      // 建筑远程攻击：弹道命中后扣血
      projectiles.push({
        startX: bx,
        startY: by,
        attackerId: building.id,
        targetId: entity.id,
        targetX: entity.x,
        targetY: entity.y,
        damage: Math.max(1, building.attack - (entity.armor || 0)),
        speed: 400,
        progress: 0,
        onHit: true,  // 标记弹道命中时需扣血
      })
      return
    }
  }
}

/**
 * 更新弹道
 */
export function updateProjectiles(projectiles, dt) {
  const state = getState()
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]
    const dx = p.targetX - p.startX
    const dy = p.targetY - p.startY
    const dist = Math.sqrt(dx * dx + dy * dy)
    p.progress += (p.speed * dt) / Math.max(dist, 1)
    if (p.progress >= 1) {
      // 弹道命中：扣血
      if (p.onHit) {
        const target = state.entities.get(p.targetId)
        if (target && !isDead(target)) {
          target.hp -= p.damage
          // 被弹道攻击的农民逃跑
          if (target.gatherer && target.hp > 0) {
            const attacker = state.entities.get(p.attackerId) || { entityType: 'building', tileX: Math.floor(p.startX / TILE_SIZE), size: { w: 1, h: 1 }, tileY: Math.floor(p.startY / TILE_SIZE) }
            fleeFromAttacker(target, attacker)
          }
          if (target.hp <= 0) {
            killTarget(target, null)
          }
        }
      }
      projectiles.splice(i, 1)
    }
  }
}
