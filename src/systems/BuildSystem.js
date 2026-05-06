/**
 * 建造系统 - 管理建筑施工进度和训练队列
 */

import {
  getState, addBuildProgress, createUnit,
  recalcPopulation, getEntity, removeEntity,
} from '../core/GameState.js'
import { MAP_CONFIG, ENTITY_STATE, UNIT_DEFS } from '../core/constants.js'

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
      // 训练完成，在建筑旁生成单位
      const building = state.buildings.get(buildingId)
      if (building) {
        const spawnX = (building.tileX + building.size.w) * TILE_SIZE + TILE_SIZE / 2
        const spawnY = (building.tileY + Math.floor(building.size.h / 2)) * TILE_SIZE + TILE_SIZE / 2
        createUnit(item.unitType, spawnX, spawnY, item.team)
        recalcPopulation()
      }

      queue.shift()
    }
  }
}
