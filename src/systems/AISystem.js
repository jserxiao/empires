/**
 * AI 系统 - 蓝色AI玩家策略
 *
 * 策略概述：
 * - 农民自动采集资源，不主动攻击，被攻击会逃跑（由CombatSystem处理）
 * - 优先指派农民建造未完成的建筑
 * - 只有所有待建造建筑都完成后才创建新建筑
 * - 建造待建造的建筑必须通过 commandBuild 指派农民
 * - 建造民房增加人口，建造军营训练士兵
 * - 军营士兵积攒到一定数量后主动进攻敌方
 */

import {
  getState, createUnit, startBuilding, startTraining,
  canAfford, addResource, recalcPopulation,
} from '../core/GameState.js'
import { commandMove, commandAttack, commandGather, commandBuild } from './MovementSystem.js'
import {
  MAP_CONFIG, TEAM, ENTITY_STATE, UNIT_TYPE, BUILDING_TYPE,
  RESOURCE_TYPE, BUILDING_DEFS, UNIT_DEFS,
} from '../core/constants.js'

const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG
const AI_DECISION_INTERVAL = 3
let aiTimer = 0

// 每个待建造建筑最多分配的建造者数量
const MAX_BUILDERS_PER_BUILDING = 2

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
  const unfinishedBuildings = []  // 未完成的建筑
  for (const b of state.buildings.values()) {
    if (b.team !== team) continue
    buildings.push(b)
    if (!b.isBuilt) unfinishedBuildings.push(b)
  }

  const pop = state.population[team]
  const res = state.resources[team]

  // ===== 优先处理：指派农民去建造未完成的建筑 =====
  assignBuildersToUnfinished(unfinishedBuildings, units, state)

  // ===== 只有所有建筑都完工后，才考虑建造新建筑 =====
  if (unfinishedBuildings.length === 0) {
    // 建造民房增加人口
    if (pop.current + 2 > pop.capacity && canAfford(team, BUILDING_DEFS[BUILDING_TYPE.CIVILIAN_HOUSE].cost)) {
      const pos = findBuildSpot(state, team, 1, 1)
      if (pos) {
        const building = startBuilding(BUILDING_TYPE.CIVILIAN_HOUSE, pos.x, pos.y, team)
        if (building) {
          // 立即指派农民去建造
          assignBuildersToBuilding(building, units, state)
        }
      }
    }

    // 建造军营
    const hasMilitaryCamp = buildings.some(b => b.type === BUILDING_TYPE.MILITARY_CAMP && b.isBuilt)
    if (!hasMilitaryCamp && canAfford(team, BUILDING_DEFS[BUILDING_TYPE.MILITARY_CAMP].cost)) {
      const pos = findBuildSpot(state, team, 2, 1)
      if (pos) {
        const building = startBuilding(BUILDING_TYPE.MILITARY_CAMP, pos.x, pos.y, team)
        if (building) {
          // 立即指派农民去建造
          assignBuildersToBuilding(building, units, state)
        }
      }
    }
  }

  // 军营训练士兵（交替训练执戟卫士和铁甲卫士）
  const hasMilitaryCamp = buildings.some(b => b.type === BUILDING_TYPE.MILITARY_CAMP && b.isBuilt)
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

  // 空闲农夫去采集（在建造指派之后，确保建造优先）
  for (const unit of idleUnits) {
    if (unit.gatherer && unit.state === ENTITY_STATE.IDLE) assignGatherer(unit, state)
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

/**
 * 为所有未完成的建筑指派建造者
 * 从正在采集或空闲的农民中抽调，每个建筑最多 MAX_BUILDERS_PER_BUILDING 个建造者
 */
function assignBuildersToUnfinished(unfinishedBuildings, units, state) {
  if (unfinishedBuildings.length === 0) return

  for (const building of unfinishedBuildings) {
    // 统计当前正在建造此建筑的农民数量
    const currentBuilders = units.filter(u =>
      u.gatherer && u.buildTargetId === building.id && u.state !== ENTITY_STATE.DEAD
    )

    if (currentBuilders.length >= MAX_BUILDERS_PER_BUILDING) continue

    const needed = MAX_BUILDERS_PER_BUILDING - currentBuilders.length
    assignBuildersToBuilding(building, units, state, needed)
  }
}

/**
 * 为指定建筑指派建造者
 * 优先选择空闲农民，其次从正在采集的农民中抽调
 * @param {object} building - 目标建筑
 * @param {Array} units - 所有己方单位
 * @param {object} state - 游戏状态
 * @param {number} [maxCount] - 最多指派几个农民，默认 MAX_BUILDERS_PER_BUILDING
 */
function assignBuildersToBuilding(building, units, state, maxCount = MAX_BUILDERS_PER_BUILDING) {
  // 优先空闲农民
  const idleFarmers = units.filter(u =>
    u.gatherer && u.state === ENTITY_STATE.IDLE && u.buildTargetId !== building.id
  )

  // 正在采集的农民（可以抽调）
  const gatheringFarmers = units.filter(u =>
    u.gatherer &&
    (u.state === ENTITY_STATE.GATHERING || u.state === ENTITY_STATE.MOVING) &&
    u.gatherTargetIdx >= 0 &&
    u.buildTargetId !== building.id
  )

  // 已在建造此建筑的农民不算
  const alreadyBuilding = units.filter(u =>
    u.gatherer && u.buildTargetId === building.id
  ).length

  const totalNeeded = Math.min(maxCount, MAX_BUILDERS_PER_BUILDING) - alreadyBuilding
  if (totalNeeded <= 0) return

  // 先用空闲农民，不够再从采集中抽调
  const candidates = [...idleFarmers, ...gatheringFarmers]
  const toAssign = candidates.slice(0, totalNeeded)

  if (toAssign.length > 0) {
    commandBuild(toAssign.map(u => u.id), building.id)
  }
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

  // 建筑之间的最小间距（格数）
  const SPACING = 1

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

        // 检查与已有建筑的间距，留出 SPACING 格的空间
        for (const b of state.buildings.values()) {
          if (nx < b.tileX + b.size.w + SPACING && nx + w + SPACING > b.tileX &&
              ny < b.tileY + b.size.h + SPACING && ny + h + SPACING > b.tileY) {
            canBuild = false; break
          }
        }

        if (canBuild) return { x: nx, y: ny }
      }
    }
  }
  return null
}
