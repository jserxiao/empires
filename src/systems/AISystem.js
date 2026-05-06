/**
 * AI 系统 - 蓝色AI玩家策略
 *
 * 策略概述：
 * - 农民自动采集资源，不主动攻击，被攻击会逃跑（由CombatSystem处理）
 * - 优先建造民房增加人口
 * - 建造军营，训练执戟卫士和铁甲卫士
 * - 军营士兵积攒到一定数量后主动进攻敌方
 */

import {
  getState, createUnit, startBuilding, startTraining,
  canAfford, addResource, recalcPopulation,
} from '../core/GameState.js'
import { commandMove, commandAttack, commandGather } from './MovementSystem.js'
import {
  MAP_CONFIG, TEAM, ENTITY_STATE, UNIT_TYPE, BUILDING_TYPE,
  RESOURCE_TYPE, BUILDING_DEFS, UNIT_DEFS,
} from '../core/constants.js'

const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG
const AI_DECISION_INTERVAL = 3
let aiTimer = 0

export function updateAI(dt) {
  const state = getState()
  if (!state.mapReady) return
  aiTimer += dt
  if (aiTimer < AI_DECISION_INTERVAL) return
  aiTimer = 0
  updateTeamAI(TEAM.ENEMY)
}

function updateTeamAI(team) {
  const state = getState()
  const units = []
  const idleUnits = []

  for (const e of state.entities.values()) {
    if (e.entityType !== 'unit' || e.team !== team || e.state === ENTITY_STATE.DEAD) continue
    units.push(e)
    if (e.state === ENTITY_STATE.IDLE) idleUnits.push(e)
  }

  const buildings = []
  for (const b of state.buildings.values()) {
    if (b.team === team) buildings.push(b)
  }

  const pop = state.population[team]
  const res = state.resources[team]

  // 空闲农夫去采集
  for (const unit of idleUnits) {
    if (unit.gatherer) assignGatherer(unit, state)
  }

  // 建造民房增加人口
  if (pop.current + 2 > pop.capacity && canAfford(team, BUILDING_DEFS[BUILDING_TYPE.CIVILIAN_HOUSE].cost)) {
    const pos = findBuildSpot(state, team, 1, 1)
    if (pos) startBuilding(BUILDING_TYPE.CIVILIAN_HOUSE, pos.x, pos.y, team)
  }

  // 建造军营
  const hasMilitaryCamp = buildings.some(b => b.type === BUILDING_TYPE.MILITARY_CAMP && b.isBuilt)
  if (!hasMilitaryCamp && canAfford(team, BUILDING_DEFS[BUILDING_TYPE.MILITARY_CAMP].cost)) {
    const pos = findBuildSpot(state, team, 2, 1)
    if (pos) startBuilding(BUILDING_TYPE.MILITARY_CAMP, pos.x, pos.y, team)
  }

  // 军营训练士兵（交替训练执戟卫士和铁甲卫士）
  if (hasMilitaryCamp) {
    const camp = buildings.find(b => b.type === BUILDING_TYPE.MILITARY_CAMP && b.isBuilt)
    if (camp && pop.current < pop.capacity) {
      const trainingQueue = state.trainingQueues.get(camp.id) || []
      if (trainingQueue.length < 2) {
        // 根据已有士兵比例决定训练哪种单位
        const halberdiers = units.filter(u => u.type === UNIT_TYPE.HALBERDIER)
        const ironGuards = units.filter(u => u.type === UNIT_TYPE.IRON_GUARD)
        const unitType = ironGuards.length < halberdiers.length * 0.5
          ? UNIT_TYPE.IRON_GUARD
          : UNIT_TYPE.HALBERDIER

        if (canAfford(team, UNIT_DEFS[unitType].cost)) {
          startTraining(camp.id, unitType)
        }
      }
    }
  }

  // 训练农夫（城镇中心）
  const farmers = units.filter(u => u.gatherer)
  if (farmers.length < 4) {
    const tc = buildings.find(b => b.type === BUILDING_TYPE.TOWN_CENTER && b.isBuilt)
    if (tc && canAfford(team, UNIT_DEFS[UNIT_TYPE.FARMER].cost) && pop.current < pop.capacity) {
      startTraining(tc.id, UNIT_TYPE.FARMER)
    }
  }

  // 军事进攻：军营士兵主动攻击范围内敌方
  const soldiers = units.filter(u => !u.gatherer && u.state !== ENTITY_STATE.DEAD)
  // 集结进攻：士兵数量达到一定规模时，主动寻找敌方进攻
  if (soldiers.length >= 3) {
    const idleSoldiers = soldiers.filter(s =>
      s.state === ENTITY_STATE.IDLE || s.state === ENTITY_STATE.MOVING
    )
    if (idleSoldiers.length >= 2) {
      // 寻找敌方实体
      const enemyEntities = []
      for (const e of state.entities.values()) {
        if (e.team === TEAM.PLAYER && e.state !== ENTITY_STATE.DEAD) enemyEntities.push(e)
      }
      if (enemyEntities.length > 0) {
        // 优先攻击建筑，其次攻击单位
        const enemyBuildings = enemyEntities.filter(e => e.entityType === 'building')
        const target = enemyBuildings.length > 0 ? enemyBuildings[0] : enemyEntities[0]
        commandAttack(idleSoldiers.map(s => s.id), target.id)
      }
    }
  }

  // 资源补贴（AI不依赖补贴，但如果资源耗尽则补充）
  if (res.food < 50) addResource(team, RESOURCE_TYPE.FOOD, 30)
  if (res.wood < 50) addResource(team, RESOURCE_TYPE.WOOD, 30)
}

function assignGatherer(unit, state) {
  const tileX = Math.floor(unit.x / TILE_SIZE)
  const tileY = Math.floor(unit.y / TILE_SIZE)
  for (let r = 1; r < 20; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const nx = tileX + dx, ny = tileY + dy
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
        const idx = ny * COLS + nx
        if (state.resource[idx] && state.resourceAmount[idx] > 0) {
          commandGather([unit.id], nx, ny)
          return
        }
      }
    }
  }
}

function findBuildSpot(state, team, w, h) {
  const ownBuildings = []
  for (const b of state.buildings.values()) {
    if (b.team === team) ownBuildings.push(b)
  }
  if (ownBuildings.length === 0) return null

  const center = ownBuildings[0]
  const cx = center.tileX, cy = center.tileY

  for (let r = 1; r < 30; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const nx = cx + dx, ny = cy + dy
        if (nx < 1 || nx + w >= COLS - 1 || ny < 1 || ny + h >= ROWS - 1) continue

        let canBuild = true
        for (let by = 0; by < h && canBuild; by++) {
          for (let bx = 0; bx < w && canBuild; bx++) {
            const idx = (ny + by) * COLS + (nx + bx)
            if (state.terrain[idx] === 0 || state.terrain[idx] === 1) canBuild = false
            if (state.resource[idx]) canBuild = false
          }
        }

        for (const b of state.buildings.values()) {
          if (nx < b.tileX + b.size.w && nx + w > b.tileX &&
              ny < b.tileY + b.size.h && ny + h > b.tileY) {
            canBuild = false; break
          }
        }

        if (canBuild) return { x: nx, y: ny }
      }
    }
  }
  return null
}
