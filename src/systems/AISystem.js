/**
 * AI 系统 - 简单的敌方 AI
 */

import {
  getState, createUnit, startBuilding, startTraining,
  canAfford, addResource, recalcPopulation,
} from '../core/GameState.js'
import { commandMove, commandAttack, commandGather } from './MovementSystem.js'
import {
  MAP_CONFIG, TEAM, ENTITY_STATE, UNIT_TYPE, BUILDING_TYPE,
  RESOURCE_TYPE, BUILDING_DEFS,
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

  // 建造房屋
  if (pop.current + 3 > pop.capacity && canAfford(team, BUILDING_DEFS[BUILDING_TYPE.HOUSE].cost)) {
    const pos = findBuildSpot(state, team, 2, 2)
    if (pos) startBuilding(BUILDING_TYPE.HOUSE, pos.x, pos.y, team)
  }

  // 建造兵营
  const hasBarracks = buildings.some(b => b.type === BUILDING_TYPE.BARRACKS && b.isBuilt)
  if (!hasBarracks && canAfford(team, BUILDING_DEFS[BUILDING_TYPE.BARRACKS].cost)) {
    const pos = findBuildSpot(state, team, 2, 2)
    if (pos) startBuilding(BUILDING_TYPE.BARRACKS, pos.x, pos.y, team)
  }

  // 训练士兵
  if (hasBarracks) {
    const barracks = buildings.find(b => b.type === BUILDING_TYPE.BARRACKS && b.isBuilt)
    if (barracks && canAfford(team, BUILDING_DEFS[BUILDING_TYPE.BARRACKS].cost) && pop.current < pop.capacity) {
      startTraining(barracks.id, UNIT_TYPE.SWORDSMAN)
    }
  }

  // 训练农夫
  const farmers = units.filter(u => u.gatherer)
  if (farmers.length < 5) {
    const tc = buildings.find(b => b.type === BUILDING_TYPE.TOWN_CENTER && b.isBuilt)
    if (tc && pop.current < pop.capacity) {
      startTraining(tc.id, UNIT_TYPE.MALE_FARMER)
    }
  }

  // 军事进攻
  const soldiers = units.filter(u => !u.gatherer && u.state !== ENTITY_STATE.DEAD)
  if (soldiers.length >= 5) {
    const playerEntities = []
    for (const e of state.entities.values()) {
      if (e.team === TEAM.PLAYER && e.state !== ENTITY_STATE.DEAD) playerEntities.push(e)
    }
    if (playerEntities.length > 0) {
      commandAttack(soldiers.map(s => s.id), playerEntities[0].id)
    }
  }

  // 资源补贴
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
