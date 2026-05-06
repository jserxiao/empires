/**
 * GameState - 游戏全局状态单例
 *
 * 设计原则：
 * 1. 所有实体统一存储在 entities Map 中，不存在"在 tile 上"还是"在移动中"的歧义
 * 2. 实体持有世界坐标（像素级），不再依赖 col/row
 * 3. 地图使用 SoA TypedArray，减少 GC 压力
 * 4. 通过 listeners 通知 React 层更新 HUD
 */

import {
  MAP_CONFIG, TERRAIN, ROAD, ENTITY_STATE, TEAM,
  RESOURCE_TYPE, UNIT_DEFS, BUILDING_DEFS, UNIT_TYPE, BUILDING_TYPE,
} from './constants.js'

const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG

// ===== 全局 ID 生成器 =====
let _nextId = 1
function nextId() { return _nextId++ }

// ===== 变更监听器 =====
const listeners = new Set()
let notifyScheduled = false

function scheduleNotify() {
  if (notifyScheduled) return
  notifyScheduled = true
  queueMicrotask(() => {
    notifyScheduled = false
    const snapshot = getSnapshot()
    for (const fn of listeners) {
      try { fn(snapshot) } catch (e) { console.error('GameState listener error:', e) }
    }
  })
}

// ===== 状态存储 =====
const state = {
  // 地图 SoA 数据
  terrain: null,       // Uint8Array[COLS * ROWS]
  elevation: null,     // Float32Array[COLS * ROWS]
  road: null,          // Uint8Array[COLS * ROWS]
  resource: null,      // Array[COLS * ROWS] - resource key string 或 null
  resourceAmount: null, // Float32Array[COLS * ROWS] - 资源剩余量

  // 实体
  entities: new Map(),  // id → entity

  // 建筑（特殊实体，单独索引方便查询）
  buildings: new Map(), // id → building entity

  // 玩家资源
  resources: {
    [TEAM.PLAYER]:  { food: 200, wood: 200, gold: 50, stone: 100 },
    [TEAM.ENEMY]:   { food: 200, wood: 200, gold: 50, stone: 100 },
    [TEAM.NEUTRAL]: { food: 0, wood: 0, gold: 0, stone: 0 },
  },

  // 人口
  population: {
    [TEAM.PLAYER]:  { current: 0, capacity: 0 },
    [TEAM.ENEMY]:   { current: 0, capacity: 0 },
    [TEAM.NEUTRAL]: { current: 0, capacity: 0 },
  },

  // 训练队列
  trainingQueues: new Map(), // buildingId → [{ unitType, progress, trainTime }]

  // 选中单位
  selectedIds: [],

  // 视口
  viewport: { x: 0, y: 0 },

  // 地图是否就绪
  mapReady: false,
  mapSeed: 0,
  towns: [],
}

// ===== SoA 索引辅助 =====
function tileIdx(x, y) { return y * COLS + x }

// ===== 地图初始化 =====
export function initMap(mapData, towns) {
  const total = COLS * ROWS
  state.terrain = new Uint8Array(total)
  state.elevation = new Float32Array(total)
  state.road = new Uint8Array(total)
  state.resource = new Array(total).fill(null)
  state.resourceAmount = new Float32Array(total)
  state.towns = towns

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const tile = mapData[y][x]
      const idx = tileIdx(x, y)
      state.terrain[idx] = tile.terrain
      state.elevation[idx] = tile.elevation
      state.road[idx] = tile.road
      if (tile.resource) {
        state.resource[idx] = tile.resource.key
        state.resourceAmount[idx] = tile.resource.amount
      }
    }
  }

  // 从地图数据重建建筑和单位实体
  rebuildEntities(mapData)

  // 居中视口
  state.viewport = {
    x: Math.floor((COLS * TILE_SIZE - window.innerWidth) / 2),
    y: Math.floor((ROWS * TILE_SIZE - window.innerHeight) / 2),
  }

  state.mapReady = true
  scheduleNotify()
}

// ===== 从 mapData 重建实体 =====
function rebuildEntities(mapData) {
  state.entities.clear()
  state.buildings.clear()
  _nextId = 1

  // 统计人口容量
  state.population[TEAM.PLAYER] = { current: 0, capacity: 0 }
  state.population[TEAM.ENEMY] = { current: 0, capacity: 0 }

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const tile = mapData[y][x]

      // 建筑
      if (tile.structure) {
        // 先检查是否已存在覆盖此位置的建筑（多格建筑跳过非左上角格子）
        let alreadyExists = false
        for (const b of state.buildings.values()) {
          if (x >= b.tileX && x < b.tileX + b.size.w && y >= b.tileY && y < b.tileY + b.size.h) {
            alreadyExists = true
            break
          }
        }
        if (alreadyExists) continue

        const building = createBuilding(tile.structure.type, x, y, tile.structure.team ?? TEAM.PLAYER)
        building.buildProgress = 100
        building.isBuilt = true
      }

      // 单位
      if (tile.units && tile.units.length > 0) {
        for (const u of tile.units) {
          createUnit(u.type || UNIT_TYPE.MALE_FARMER, x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, u.team ?? TEAM.PLAYER)
        }
      }
    }
  }

  // 计算人口
  recalcPopulation()
}

// ===== 实体创建 =====
export function createUnit(unitType, worldX, worldY, team = TEAM.PLAYER) {
  const def = UNIT_DEFS[unitType]
  if (!def) { console.warn('Unknown unit type:', unitType); return null }

  const id = nextId()
  const entity = {
    id,
    entityType: 'unit',
    type: unitType,
    team,
    name: def.name,
    image: def.image,
    x: worldX,
    y: worldY,
    hp: def.maxHp,
    maxHp: def.maxHp,
    attack: def.attack,
    armor: def.armor,
    range: def.range,
    moveSpeed: def.moveSpeed * TILE_SIZE, // 像素/秒
    attackSpeed: def.attackSpeed,
    state: ENTITY_STATE.IDLE,
    gatherer: def.gatherer,
    population: def.population,

    // 移动
    path: null,
    pathIndex: 0,
    progress: 0,

    // 攻击
    targetId: null,
    attackCooldown: 0,
    aggroRange: def.range > 1 ? 8 : 5,

    // 采集
    gatherTargetIdx: -1,   // tileIdx
    gatherCooldown: 0,
    carrying: null,        // { type, amount }
    carryAmount: 10,

    // 建造
    buildTargetId: null,

    // 动画
    animState: 'idle',
    animDir: 2,  // 0=上 1=右 2=下 3=左
    animFrame: 0,
    animTimer: 0,
  }

  state.entities.set(id, entity)
  scheduleNotify()
  return entity
}

export function createBuilding(buildingType, tileX, tileY, team = TEAM.PLAYER) {
  const def = BUILDING_DEFS[buildingType]
  if (!def) { console.warn('Unknown building type:', buildingType); return null }

  const id = nextId()
  const entity = {
    id,
    entityType: 'building',
    type: buildingType,
    team,
    name: def.name,
    image: def.image || null,
    images: def.images || null,
    tileX,
    tileY,
    size: { ...def.size },
    x: tileX * TILE_SIZE,
    y: tileY * TILE_SIZE,
    hp: def.maxHp,
    maxHp: def.maxHp,
    buildProgress: 0,
    isBuilt: false,
    buildTime: def.buildTime,

    // 属性
    dropSite: def.dropSite || false,
    dropTypes: def.dropTypes || null,
    populationProvide: def.populationProvide || 0,
    trainableUnits: def.trainableUnits || [],
    produces: def.produces || null,
    farmAmount: def.farmAmount || 0,
    farmCurrent: def.farmAmount || 0,

    // 攻击（箭塔等）
    attack: def.attack || 0,
    range: def.range || 0,
    attackSpeed: def.attackSpeed || 0,
    attackCooldown: 0,
    targetId: null,

    // 建造者列表
    builderIds: [],

    // 动画
    animState: 'idle',
  }

  state.entities.set(id, entity)
  state.buildings.set(id, entity)
  scheduleNotify()
  return entity
}

// ===== 实体操作 =====
export function getEntity(id) {
  return state.entities.get(id) ?? null
}

export function removeEntity(id) {
  const entity = state.entities.get(id)
  if (!entity) return
  state.entities.delete(id)
  if (entity.entityType === 'building') {
    state.buildings.delete(id)
  }
  // 从选中列表移除
  state.selectedIds = state.selectedIds.filter(sid => sid !== id)
  scheduleNotify()
}

export function getEntitiesInRange(cx, cy, radius) {
  const results = []
  const r2 = radius * radius
  for (const entity of state.entities.values()) {
    const dx = entity.x - cx
    const dy = entity.y - cy
    if (dx * dx + dy * dy <= r2) {
      results.push(entity)
    }
  }
  return results
}

export function getUnitsOfTeam(team) {
  const units = []
  for (const e of state.entities.values()) {
    if (e.entityType === 'unit' && e.team === team) {
      units.push(e)
    }
  }
  return units
}

export function getBuildingsOfTeam(team) {
  const buildings = []
  for (const b of state.buildings.values()) {
    if (b.team === team) buildings.push(b)
  }
  return buildings
}

// ===== 选中管理 =====
export function setSelected(ids) {
  state.selectedIds = ids
  scheduleNotify()
}

export function addToSelection(ids) {
  const set = new Set(state.selectedIds)
  for (const id of ids) set.add(id)
  state.selectedIds = Array.from(set)
  scheduleNotify()
}

export function removeFromSelection(id) {
  state.selectedIds = state.selectedIds.filter(sid => sid !== id)
  scheduleNotify()
}

export function clearSelection() {
  state.selectedIds = []
  scheduleNotify()
}

export function getSelectedEntities() {
  return state.selectedIds
    .map(id => state.entities.get(id))
    .filter(Boolean)
}

// ===== 资源管理 =====
export function getPlayerResource(team, type) {
  return state.resources[team]?.[type] ?? 0
}

export function addResource(team, type, amount) {
  if (state.resources[team]) {
    state.resources[team][type] += amount
    scheduleNotify()
  }
}

export function canAfford(team, cost) {
  const res = state.resources[team]
  if (!res) return false
  for (const [type, amount] of Object.entries(cost)) {
    if ((res[type] || 0) < amount) return false
  }
  return true
}

export function spendResource(team, cost) {
  if (!canAfford(team, cost)) return false
  const res = state.resources[team]
  for (const [type, amount] of Object.entries(cost)) {
    res[type] -= amount
  }
  scheduleNotify()
  return true
}

// ===== 人口管理 =====
export function recalcPopulation() {
  for (const team of [TEAM.PLAYER, TEAM.ENEMY]) {
    let current = 0
    let capacity = 0
    for (const e of state.entities.values()) {
      if (e.team !== team) continue
      if (e.entityType === 'unit' && e.state !== ENTITY_STATE.DEAD) {
        current += e.population || 1
      }
      if (e.entityType === 'building' && e.isBuilt) {
        capacity += e.populationProvide || 0
      }
    }
    state.population[team] = { current, capacity }
  }
  scheduleNotify()
}

export function getPopulation(team) {
  return state.population[team] || { current: 0, capacity: 0 }
}

// ===== 视口 =====
export function setViewport(vp) {
  const maxX = COLS * TILE_SIZE - window.innerWidth
  const maxY = ROWS * TILE_SIZE - window.innerHeight
  state.viewport = {
    x: Math.max(0, Math.min(maxX, vp.x)),
    y: Math.max(0, Math.min(maxY, vp.y)),
  }
  scheduleNotify()
}

export function moveViewport(dx, dy) {
  setViewport({ x: state.viewport.x + dx, y: state.viewport.y + dy })
}

export function getViewport() {
  return state.viewport
}

// ===== 地图查询 =====
export function getTerrain(x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return TERRAIN.DEEP_WATER
  return state.terrain[tileIdx(x, y)]
}

export function getRoad(x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return ROAD.NONE
  return state.road[tileIdx(x, y)]
}

export function getResource(x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return null
  const idx = tileIdx(x, y)
  const key = state.resource[idx]
  if (!key) return null
  return { key, amount: state.resourceAmount[idx] }
}

export function setResource(x, y, key, amount) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return
  const idx = tileIdx(x, y)
  state.resource[idx] = key
  state.resourceAmount[idx] = amount
}

export function consumeResource(x, y, amount) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return 0
  const idx = tileIdx(x, y)
  if (!state.resource[idx]) return 0
  const available = state.resourceAmount[idx]
  const taken = Math.min(amount, available)
  state.resourceAmount[idx] -= taken
  if (state.resourceAmount[idx] <= 0) {
    state.resource[idx] = null
    state.resourceAmount[idx] = 0
  }
  return taken
}

export function isTileWalkable(x, y) {
  const terrain = getTerrain(x, y)
  if (terrain === TERRAIN.DEEP_WATER || terrain === TERRAIN.SHALLOW_WATER) return false
  // 检查建筑占位
  for (const b of state.buildings.values()) {
    if (b.isBuilt && x >= b.tileX && x < b.tileX + b.size.w && y >= b.tileY && y < b.tileY + b.size.h) {
      return false
    }
  }
  return true
}

// ===== 训练队列 =====
export function startTraining(buildingId, unitType) {
  const building = state.buildings.get(buildingId)
  if (!building || !building.isBuilt) return false
  const def = UNIT_DEFS[unitType]
  if (!def) return false
  if (!canAfford(building.team, def.cost)) return false

  // 人口检查
  const pop = getPopulation(building.team)
  if (pop.current + def.population > pop.capacity) return false

  spendResource(building.team, def.cost)

  if (!state.trainingQueues.has(buildingId)) {
    state.trainingQueues.set(buildingId, [])
  }
  state.trainingQueues.get(buildingId).push({
    unitType,
    progress: 0,
    trainTime: def.trainTime,
    team: building.team,
  })
  scheduleNotify()
  return true
}

export function getTrainingQueue(buildingId) {
  return state.trainingQueues.get(buildingId) || []
}

// ===== 建造 =====
export function startBuilding(buildingType, tileX, tileY, team = TEAM.PLAYER) {
  const def = BUILDING_DEFS[buildingType]
  if (!def) return null
  if (!canAfford(team, def.cost)) return null

  // 检查地块可建造
  for (let dy = 0; dy < def.size.h; dy++) {
    for (let dx = 0; dx < def.size.w; dx++) {
      const cx = tileX + dx
      const cy = tileY + dy
      if (!isTileWalkable(cx, cy)) return null
    }
  }

  spendResource(team, def.cost)
  const building = createBuilding(buildingType, tileX, tileY, team)
  if (building) {
    // 标记地块为不可通行（建造中也是障碍）
    // (isTileWalkable 已经通过 buildings map 检查)
  }
  return building
}

// ===== 建造进度 =====
export function addBuildProgress(buildingId, amount) {
  const building = state.buildings.get(buildingId)
  if (!building || building.isBuilt) return false
  building.buildProgress = Math.min(100, building.buildProgress + amount)
  if (building.buildProgress >= 100) {
    building.isBuilt = true
    recalcPopulation()
  }
  scheduleNotify()
  return building.isBuilt
}

// ===== 通知/订阅 =====
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getSnapshot() {
  return {
    mapReady: state.mapReady,
    viewport: { ...state.viewport },
    resources: { ...state.resources[TEAM.PLAYER] },
    population: { ...state.population[TEAM.PLAYER] },
    selectedIds: [...state.selectedIds],
    selectedEntities: getSelectedEntities(),
    trainingQueues: new Map(state.trainingQueues),
  }
}

// ===== 直接访问（系统层用，避免频繁创建快照） =====
export function getState() { return state }
export function getMapData() {
  return {
    terrain: state.terrain,
    elevation: state.elevation,
    road: state.road,
    resource: state.resource,
    resourceAmount: state.resourceAmount,
  }
}

// ===== 重置 =====
export function resetGameState() {
  state.entities.clear()
  state.buildings.clear()
  state.trainingQueues.clear()
  state.selectedIds = []
  state.mapReady = false
  state.resources[TEAM.PLAYER] = { food: 200, wood: 200, gold: 50, stone: 100 }
  state.resources[TEAM.ENEMY] = { food: 200, wood: 200, gold: 50, stone: 100 }
  state.population[TEAM.PLAYER] = { current: 0, capacity: 0 }
  state.population[TEAM.ENEMY] = { current: 0, capacity: 0 }
  _nextId = 1
  scheduleNotify()
}
