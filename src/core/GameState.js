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
  RESOURCE_TYPE, RESOURCE_DEFS, UNIT_DEFS, BUILDING_DEFS, UNIT_TYPE, BUILDING_TYPE,
} from './constants.js'
import { initFog, resetFog } from '../systems/FogOfWar.js'

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
[TEAM.PLAYER]:  { food: 9999, wood: 9999, gold: 9999, stone: 9999 },
  [TEAM.ENEMY]:   { food: 9999, wood: 9999, gold: 9999, stone: 9999 },
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

// 选中单位（己方）
selectedIds: [],

// 选中资源瓦片 { tileX, tileY, key, amount, maxAmount } 或 null
selectedResource: null,

// 选中敌方实体 ID 或 null（仅查看信息，不可操作）
selectedEnemy: null,

  // 视口
  viewport: { x: 0, y: 0 },

  // 地图是否就绪
  mapReady: false,
  mapSeed: 0,
  towns: [],
}

// ===== SoA 索引辅助 =====
function tileIdx(x, y) { return y * COLS + x }

// ===== 空间索引（网格分区）=====
const SPATIAL_CELL_SIZE = 4  // 每个空间格子占 4×4 瓦片
const SPATIAL_COLS = Math.ceil(COLS / SPATIAL_CELL_SIZE)
const SPATIAL_ROWS = Math.ceil(ROWS / SPATIAL_CELL_SIZE)

/** @type {Map<number, Set<number>>} 空间格子 → 实体ID集合 */
let spatialGrid = new Map()

/** 计算实体所在的格子 key */
function spatialKey(col, row) {
  const sc = Math.floor(col / SPATIAL_CELL_SIZE)
  const sr = Math.floor(row / SPATIAL_CELL_SIZE)
  return sr * SPATIAL_COLS + sc
}

/** 将实体添加到空间索引 */
function spatialAdd(entity) {
  if (entity.entityType === 'building') {
    // 建筑可能跨多个格子
    const startCol = entity.tileX
    const endCol = entity.tileX + entity.size.w - 1
    const startRow = entity.tileY
    const endRow = entity.tileY + entity.size.h - 1
    for (let r = startRow; r <= endRow; r += SPATIAL_CELL_SIZE) {
      for (let c = startCol; c <= endCol; c += SPATIAL_CELL_SIZE) {
        const key = spatialKey(c, r)
        let cell = spatialGrid.get(key)
        if (!cell) { cell = new Set(); spatialGrid.set(key, cell) }
        cell.add(entity.id)
    }
  }
  } else {
    // 单位只占一个格子
    const col = Math.floor(entity.x / TILE_SIZE)
    const row = Math.floor(entity.y / TILE_SIZE)
    const key = spatialKey(col, row)
    let cell = spatialGrid.get(key)
    if (!cell) { cell = new Set(); spatialGrid.set(key, cell) }
    cell.add(entity.id)
  }
}

/** 从空间索引移除实体 */
function spatialRemove(entity) {
  if (entity.entityType === 'building') {
    const startCol = entity.tileX
    const endCol = entity.tileX + entity.size.w - 1
    const startRow = entity.tileY
    const endRow = entity.tileY + entity.size.h - 1
    for (let r = startRow; r <= endRow; r += SPATIAL_CELL_SIZE) {
      for (let c = startCol; c <= endCol; c += SPATIAL_CELL_SIZE) {
        const key = spatialKey(c, r)
        const cell = spatialGrid.get(key)
        if (cell) cell.delete(entity.id)
    }
  }
  } else {
    const col = Math.floor(entity.x / TILE_SIZE)
    const row = Math.floor(entity.y / TILE_SIZE)
    const key = spatialKey(col, row)
    const cell = spatialGrid.get(key)
    if (cell) cell.delete(entity.id)
  }
}

/** 更新单位的空间索引（移动后调用） */
export function spatialUpdateUnit(entity, oldX, oldY) {
  const oldCol = Math.floor(oldX / TILE_SIZE)
  const oldRow = Math.floor(oldY / TILE_SIZE)
  const newCol = Math.floor(entity.x / TILE_SIZE)
  const newRow = Math.floor(entity.y / TILE_SIZE)
  if (oldCol === newCol && oldRow === newRow) return
  const oldKey = spatialKey(oldCol, oldRow)
  const oldCell = spatialGrid.get(oldKey)
  if (oldCell) oldCell.delete(entity.id)
  const newKey = spatialKey(newCol, newRow)
  let newCell = spatialGrid.get(newKey)
  if (!newCell) { newCell = new Set(); spatialGrid.set(newKey, newCell) }
  newCell.add(entity.id)
}

/**
 * 查询指定范围内的实体（使用空间索引加速）
 * @param {number} cx - 中心世界坐标 x
 * @param {number} cy - 中心世界坐标 y
 * @param {number} radius - 搜索半径（世界坐标）
 * @returns {Array} 范围内的实体数组
 */
export function getEntitiesInRange(cx, cy, radius) {
  const results = []
  const r2 = radius * radius
  // 计算需要检查的空间格子范围
  const minCol = Math.max(0, Math.floor((cx - radius) / TILE_SIZE))
  const maxCol = Math.min(COLS - 1, Math.ceil((cx + radius) / TILE_SIZE))
  const minRow = Math.max(0, Math.floor((cy - radius) / TILE_SIZE))
  const maxRow = Math.min(ROWS - 1, Math.ceil((cy + radius) / TILE_SIZE))
  const minSC = Math.floor(minCol / SPATIAL_CELL_SIZE)
  const maxSC = Math.floor(maxCol / SPATIAL_CELL_SIZE)
  const minSR = Math.floor(minRow / SPATIAL_CELL_SIZE)
  const maxSR = Math.floor(maxRow / SPATIAL_CELL_SIZE)

  const checked = new Set()
  for (let sr = minSR; sr <= maxSR; sr++) {
    for (let sc = minSC; sc <= maxSC; sc++) {
      const key = sr * SPATIAL_COLS + sc
      const cell = spatialGrid.get(key)
      if (!cell) continue
      for (const id of cell) {
        if (checked.has(id)) continue
        checked.add(id)
        const entity = state.entities.get(id)
        if (!entity) continue
        const ex = entity.entityType === 'building'
          ? (entity.tileX + entity.size.w / 2) * TILE_SIZE
          : entity.x
        const ey = entity.entityType === 'building'
          ? (entity.tileY + entity.size.h / 2) * TILE_SIZE
          : entity.y
        const dx = ex - cx
        const dy = ey - cy
        if (dx * dx + dy * dy <= r2) {
          results.push(entity)
        }
      }
    }
  }
  return results
}

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

  // 初始化黑雾系统
  initFog()

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
        building.hp = building.maxHp  // 地图初始化的建筑为满血
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
    baseMoveSpeed: def.moveSpeed,         // 原始移速（UI显示用）
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
    aggroRange: def.range > 1 ? 12 : 10,

    // 采集
    gatherTargetIdx: -1,   // tileIdx
    gatherCooldown: 0,
    carrying: null,        // { type, amount }
    carryAmount: 2,        // 每次采集动作获取的资源量
    maxCarry: 20,          // 最大负重
    gatherResourceType: null, // 正在采集的资源类型（food/wood/gold/stone）

    // 建造
    buildTargetId: null,

    // 动画
    animState: 'idle',
    animDir: 2,  // 0=上 1=右 2=下 3=左
    animFrame: 0,
    animTimer: 0,
  }

  state.entities.set(id, entity)
  spatialAdd(entity)
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
    hp: 1,
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
  spatialAdd(entity)
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
  spatialRemove(entity)
  state.entities.delete(id)
  if (entity.entityType === 'building') {
    state.buildings.delete(id)
  }
  // 从选中列表移除
  state.selectedIds = state.selectedIds.filter(sid => sid !== id)
  if (state.selectedEnemy === id) state.selectedEnemy = null
  scheduleNotify()
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
state.selectedResource = null
state.selectedEnemy = null
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
state.selectedResource = null
state.selectedEnemy = null
scheduleNotify()
}

export function setSelectedResource(tileX, tileY) {
  if (tileX < 0 || tileX >= COLS || tileY < 0 || tileY >= ROWS) {
    state.selectedResource = null
    scheduleNotify()
    return
  }
  const idx = tileY * COLS + tileX
  const key = state.resource[idx]
  if (!key || state.resourceAmount[idx] <= 0) {
    state.selectedResource = null
    scheduleNotify()
    return
  }
  const def = RESOURCE_DEFS[key]
  state.selectedResource = {
    tileX,
    tileY,
    key,
    amount: state.resourceAmount[idx],
    maxAmount: def?.amount || 0,
  }
state.selectedIds = []
state.selectedEnemy = null
scheduleNotify()
}

// ===== 选中敌方实体（仅查看，不可操作） =====
export function setSelectedEnemy(entityId) {
state.selectedIds = []
state.selectedResource = null
state.selectedEnemy = entityId
scheduleNotify()
}

export function getSelectedEnemy() {
return state.selectedEnemy ? state.entities.get(state.selectedEnemy) : null
}

export function clearSelectedResourceIfDepleted() {
  const sr = state.selectedResource
  if (!sr) return
  const idx = sr.tileY * COLS + sr.tileX
  if (!state.resource[idx] || state.resourceAmount[idx] <= 0) {
    state.selectedResource = null
    scheduleNotify()
  }
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

export function isTileWalkable(x, y, excludeBuildingId) {
  return createWalkableCheck(state, excludeBuildingId)(x, y)
}

/**
 * 创建通行检查函数 - 供寻路系统使用
 * 所有建筑（含建造中）和资源堆都是障碍物
 * @param {object} state - 游戏状态
 * @param {number} [excludeBuildingId] - 排除的建筑ID（如建造目标，允许走近它）
 * @param {number} [excludeResourceIdx] - 排除的资源索引（如采集目标，允许走近它）
 * @returns {function(number, number): boolean}
 */
export function createWalkableCheck(state, excludeBuildingId, excludeResourceIdx) {
  return (x, y) => {
    // 检查地形（深水/浅水不可通行）
    const idx = tileIdx(x, y)
    const terrain = state.terrain[idx]
    if (terrain === TERRAIN.DEEP_WATER || terrain === TERRAIN.SHALLOW_WATER) return false
    // 检查建筑障碍
    for (const b of state.buildings.values()) {
      if (b.id === excludeBuildingId) continue
      if (x >= b.tileX && x < b.tileX + b.size.w &&
          y >= b.tileY && y < b.tileY + b.size.h) {
        return false
      }
    }
    // 检查资源障碍（排除目标资源，如采集时允许走到资源旁）
    if (idx !== excludeResourceIdx && state.resource[idx]) return false
    return true
  }
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
    building.hp = building.maxHp  // 建造完成恢复满血
    recalcPopulation()
  }
  scheduleNotify()
  return building.isBuilt
}

// ===== 取消建造（退回部分资源） =====
export function cancelBuild(buildingId) {
  const building = state.buildings.get(buildingId)
  if (!building || building.isBuilt) return false

  const def = BUILDING_DEFS[building.type]
  if (!def) return false

  // 退回 60% 资源
  const refundRate = 0.6
  for (const [type, amount] of Object.entries(def.cost)) {
    addResource(building.team, type, Math.floor(amount * refundRate))
  }

  // 释放正在建造此建筑的建造者
  for (const entity of state.entities.values()) {
    if (entity.entityType === 'unit' && entity.buildTargetId === buildingId) {
      entity.state = ENTITY_STATE.IDLE
      entity.animState = 'idle'
      entity.buildTargetId = null
    }
  }

  // 从选中列表移除
  state.selectedIds = state.selectedIds.filter(sid => sid !== buildingId)

  removeEntity(buildingId)
  return true
}

// ===== 拆除建筑（已完成的建筑） =====
export function demolishBuilding(buildingId) {
  const building = state.buildings.get(buildingId)
  if (!building || !building.isBuilt) return false

  const def = BUILDING_DEFS[building.type]
  if (!def) return false

  // 退回 30% 资源
  const refundRate = 0.3
  for (const [type, amount] of Object.entries(def.cost)) {
    addResource(building.team, type, Math.floor(amount * refundRate))
  }

  // 取消此建筑上的训练队列
  state.trainingQueues.delete(buildingId)

  // 从选中列表移除
  state.selectedIds = state.selectedIds.filter(sid => sid !== buildingId)

  removeEntity(buildingId)
  recalcPopulation()
  return true
}

// ===== 通知/订阅 =====
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getSnapshot() {
  // 更新选中资源的实时数量
  const sr = state.selectedResource
  let liveSelectedResource = null
  if (sr) {
    const idx = sr.tileY * COLS + sr.tileX
    if (state.resource[idx] && state.resourceAmount[idx] > 0) {
      liveSelectedResource = { ...sr, amount: state.resourceAmount[idx] }
    }
  }

  return {
    mapReady: state.mapReady,
    viewport: { ...state.viewport },
    resources: { ...state.resources[TEAM.PLAYER] },
    population: { ...state.population[TEAM.PLAYER] },
    selectedIds: [...state.selectedIds],
    selectedEntities: getSelectedEntities(),
    selectedResource: liveSelectedResource,
    selectedEnemy: state.selectedEnemy ? state.entities.get(state.selectedEnemy) : null,
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
  state.selectedResource = null
  state.mapReady = false
state.resources[TEAM.PLAYER] = { food: 9999, wood: 9999, gold: 9999, stone: 9999 }
state.resources[TEAM.ENEMY] = { food: 9999, wood: 9999, gold: 9999, stone: 9999 }
  state.population[TEAM.PLAYER] = { current: 0, capacity: 0 }
  state.population[TEAM.ENEMY] = { current: 0, capacity: 0 }
  _nextId = 1
  spatialGrid.clear()
  resetFog()
  scheduleNotify()
}
