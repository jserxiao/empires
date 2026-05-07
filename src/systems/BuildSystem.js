/**
 * 建造系统 - 管理建筑施工进度和训练队列
 */

import {
  getState, addBuildProgress, createUnit,
  recalcPopulation, getEntity, removeEntity,
} from '../core/GameState.js'
import { MAP_CONFIG, ENTITY_STATE, UNIT_DEFS, UNIT_TYPE } from '../core/constants.js'
import { invalidateStaticCache } from '../game/GameRenderer.js'

const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG

/**
 * 每帧更新建造和训练
 */
export function updateBuild(dt) {
  const state = getState()
  if (!state.mapReady) return

  // 更新建造进度
  for (const entity of state.entities.values()) {
    if (entity.entityType !== 'unit') continue
    if (entity.state === ENTITY_STATE.BUILDING) {
      processBuild(entity, dt, state)
    }
  }

  // 更新训练队列
  updateTrainingQueues(dt, state)
}

function processBuild(entity, dt, state) {
  const building = state.buildings.get(entity.buildTargetId)
  if (!building || building.isBuilt) {
    entity.state = ENTITY_STATE.IDLE
    entity.animState = 'idle'
    entity.buildTargetId = null
    return
  }

  // 检查距离
  const bx = (building.tileX + building.size.w / 2) * TILE_SIZE
  const by = (building.tileY + building.size.h / 2) * TILE_SIZE
  const dx = bx - entity.x
  const dy = by - entity.y
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (dist > TILE_SIZE * 2.5) {
    // 太远，重新移动
    entity.state = ENTITY_STATE.IDLE
    entity.animState = 'idle'
    return
  }

  // 每个建造者贡献
  const progressPerSec = 100 / building.buildTime
  addBuildProgress(building.id, progressPerSec * dt)

  if (building.isBuilt) {
    entity.state = ENTITY_STATE.IDLE
    entity.animState = 'idle'
    entity.buildTargetId = null
    invalidateStaticCache()
  }
}

function updateTrainingQueues(dt, state) {
  for (const [buildingId, queue] of state.trainingQueues) {
    if (queue.length === 0) {
      state.trainingQueues.delete(buildingId)
      continue
    }

    const item = queue[0]
    item.progress += dt

    if (item.progress >= item.trainTime) {
      // 训练完成，在建筑周围随机位置生成单位
      const building = state.buildings.get(buildingId)
      if (building) {
        const pos = findSpawnPosition(building, state)
        // 如果训练类型有 randomTrainResult，随机选一个实际类型
        const actualType = resolveTrainType(item.unitType)
        createUnit(actualType, pos.x, pos.y, item.team)
        recalcPopulation()
      }

      queue.shift()
    }
  }
}

/**
 * 解析训练类型 - 如果定义了 randomTrainResult，随机选一个实际单位类型
 */
function resolveTrainType(unitType) {
  const def = UNIT_DEFS[unitType]
  if (def?.randomTrainResult?.length > 0) {
    return def.randomTrainResult[Math.floor(Math.random() * def.randomTrainResult.length)]
  }
  return unitType
}

/**
 * 在建筑周围寻找一个可通行的随机位置生成单位
 * 船坞生成的战船需要在水面上
 */
function findSpawnPosition(building, state) {
  const isShipyard = building.type === 'shipyard'

  // 尝试在建筑周围 1~3 格范围内寻找可通行位置
  for (let radius = 1; radius <= 3; radius++) {
    const candidates = []
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) < radius && Math.abs(dy) < radius) continue // 只要边缘
        const tx = building.tileX + Math.floor(building.size.w / 2) + dx
        const ty = building.tileY + Math.floor(building.size.h / 2) + dy
        if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) continue
        const idx = ty * COLS + tx
        const terrain = state.terrain[idx]
        // 船坞生成战船：必须在水面（深水/浅水）
        if (isShipyard) {
          if (terrain !== 0 && terrain !== 1) continue
        } else {
          // 普通建筑生成陆地单位：水面不可通行
          if (terrain === 0 || terrain === 1) continue
        }
        if (state.resource[idx]) continue
        // 检查是否有建筑占位
        let blocked = false
        for (const b of state.buildings.values()) {
          if (tx >= b.tileX && tx < b.tileX + b.size.w && ty >= b.tileY && ty < b.tileY + b.size.h) {
            blocked = true; break
          }
        }
        if (blocked) continue
        candidates.push({ x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 })
      }
    }
    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)]
    }
  }

  // 兜底：直接在建筑右边生成
  return {
    x: (building.tileX + building.size.w) * TILE_SIZE + TILE_SIZE / 2,
    y: (building.tileY + Math.floor(building.size.h / 2)) * TILE_SIZE + TILE_SIZE / 2,
  }
}
