import {
  getState, setSelected, clearSelection, getEntity,
  startBuilding, removeFromSelection, canAfford as stateCanAfford,
  setSelectedResource, setSelectedEnemy,
} from '../core/GameState.js'
import { commandMove, commandAttack, commandGather, commandBuild } from '../systems/MovementSystem.js'
import { getMousePosition } from '../core/GameLoop.js'
import {
  MAP_CONFIG, TEAM, ENTITY_STATE,
  RESOURCE_DEFS, BUILDING_DEFS,
} from '../core/constants.js'
import { invalidateStaticCache } from '../game/GameRenderer.js'

const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG
let isDragging = false
let dragStart = null
const BOX_THRESHOLD = 5
let buildMode = null

// ===== 鼠标光标状态 =====
let currentCursor = 'default'

/**
 * 根据鼠标位置和选中单位更新光标样式
 * 选中了单位时：右键点击目标区域变为手型
 */
export function updateCursor(clientX, clientY) {
  const state = getState()
  if (!state.mapReady || buildMode) {
    if (buildMode) { setCursor('crosshair') } else { setCursor('default') }
    return
  }

  // 没有选中单位 → 默认光标
  const selectedUnits = state.selectedIds.filter(id => {
    const ent = getEntity(id)
    return ent && ent.entityType === 'unit' && ent.team === TEAM.PLAYER && ent.state !== ENTITY_STATE.DEAD
  })
  if (selectedUnits.length === 0) {
    setCursor('default')
    return
  }

  const vp = state.viewport
  const worldX = clientX + vp.x
  const worldY = clientY + vp.y
  const tileCol = Math.floor(worldX / TILE_SIZE)
  const tileRow = Math.floor(worldY / TILE_SIZE)

  // 检查是否悬停在敌方/中立实体上 → 攻击光标（手型）
  for (const entity of state.entities.values()) {
    if (entity.state === ENTITY_STATE.DEAD || entity.team === TEAM.PLAYER) continue
    if (isEntityHit(entity, worldX, worldY)) {
      setCursor('pointer')
      return
    }
  }

  // 检查是否悬停在己方未完成建筑上 → 建造光标（手型）
  for (const entity of state.entities.values()) {
    if (entity.entityType !== 'building' || entity.state === ENTITY_STATE.DEAD) continue
    if (entity.team !== TEAM.PLAYER) continue
    if (!isEntityHit(entity, worldX, worldY)) continue
    if (!entity.isBuilt) {
      const hasGatherers = selectedUnits.some(id => getEntity(id)?.gatherer)
      if (hasGatherers) {
        setCursor('pointer')
        return
      }
    }
    break
  }

  // 检查是否悬停在资源上 → 采集光标（手型）
  if (tileCol >= 0 && tileCol < COLS && tileRow >= 0 && tileRow < ROWS) {
    const idx = tileRow * COLS + tileCol
    if (state.resource[idx] && state.resourceAmount[idx] > 0) {
      const hasGatherers = selectedUnits.some(id => getEntity(id)?.gatherer)
      if (hasGatherers) {
        setCursor('pointer')
        return
      }
    }
  }

  // 选中了单位，悬停在空地 → 移动光标（手型）
  setCursor('pointer')
}

function setCursor(type) {
  if (currentCursor !== type) {
    currentCursor = type
    document.body.style.cursor = type
  }
}

export function handleMouseMove(e) {
  if (dragStart && !isDragging) {
    const dx = e.clientX - dragStart.clientX
    const dy = e.clientY - dragStart.clientY
    if (Math.sqrt(dx * dx + dy * dy) >= BOX_THRESHOLD) isDragging = true
  }
  if (buildMode) {
    const state = getState()
    const col = Math.floor((e.clientX + state.viewport.x) / TILE_SIZE)
    const row = Math.floor((e.clientY + state.viewport.y) / TILE_SIZE)
    buildMode.previewCol = col
    buildMode.previewRow = row
    buildMode.isValid = checkBuildLocation(col, row, buildMode.buildingType)
  }
  // 更新鼠标光标
  if (!isDragging) {
    updateCursor(e.clientX, e.clientY)
  } else {
    setCursor('crosshair')
  }
  return isDragging && dragStart ? {
    selectionBox: { startX: dragStart.clientX, startY: dragStart.clientY, endX: e.clientX, endY: e.clientY }
  } : null
}

export function handleMouseDown(e) {
  if (buildMode && e.button === 0) {
    if (buildMode.isValid) {
      const state = getState()
      const building = startBuilding(buildMode.buildingType, buildMode.previewCol, buildMode.previewRow, TEAM.PLAYER)
      if (building) {
        invalidateStaticCache()
        const builders = state.selectedIds.map(id => getEntity(id)).filter(Boolean).filter(ent => ent.gatherer)
        if (builders.length > 0) commandBuild(builders.map(u => u.id), building.id)
      }
      buildMode = null
    }
    return { handled: true }
  }
  if (e.button === 2 || (e.button === 0 && e.ctrlKey)) return handleRightClick(e)
  if (e.button === 0) { dragStart = { clientX: e.clientX, clientY: e.clientY }; isDragging = false }
  return { handled: false }
}

export function handleMouseUp(e) {
  if (e.button !== 0 || !dragStart) return { handled: false }
  const state = getState()
  if (isDragging) {
    const vp = state.viewport
    const sc = Math.floor((dragStart.clientX + vp.x) / TILE_SIZE)
    const sr = Math.floor((dragStart.clientY + vp.y) / TILE_SIZE)
    const ec = Math.floor((e.clientX + vp.x) / TILE_SIZE)
    const er = Math.floor((e.clientY + vp.y) / TILE_SIZE)
    const sel = []
    for (const entity of state.entities.values()) {
      if (entity.entityType !== 'unit' || entity.state === ENTITY_STATE.DEAD || entity.team !== TEAM.PLAYER) continue
      const c = Math.floor(entity.x / TILE_SIZE), r = Math.floor(entity.y / TILE_SIZE)
      if (c >= Math.min(sc, ec) && c <= Math.max(sc, ec) && r >= Math.min(sr, er) && r <= Math.max(sr, er)) sel.push(entity.id)
    }
    setSelected(sel)
  } else {
    const vp = state.viewport
    handleLeftClick(Math.floor((e.clientX + vp.x) / TILE_SIZE), Math.floor((e.clientY + vp.y) / TILE_SIZE))
  }
  isDragging = false; dragStart = null
  return { handled: true }
}

function handleRightClick(e) {
  // 如果在建造模式，右键取消建造
  if (buildMode) {
    buildMode = null
    return { handled: true, command: 'cancelBuild' }
  }
  const state = getState()
  const vp = state.viewport
  const tileCol = Math.floor((e.clientX + vp.x) / TILE_SIZE)
  const tileRow = Math.floor((e.clientY + vp.y) / TILE_SIZE)
  const worldX = e.clientX + vp.x, worldY = e.clientY + vp.y
  const ids = state.selectedIds.filter(id => {
    const ent = getEntity(id)
    return ent && ent.entityType === 'unit' && ent.team === TEAM.PLAYER && ent.state !== ENTITY_STATE.DEAD
  })
  if (ids.length === 0) {
    // 没有己方单位选中，清除敌方选中状态
    if (state.selectedEnemy) clearSelection()
    return { handled: true }
  }

  // 检查是否右键点击了己方未完成建筑 → 派农民去建造
  for (const entity of state.entities.values()) {
    if (entity.entityType !== 'building' || entity.state === ENTITY_STATE.DEAD) continue
    if (entity.team !== TEAM.PLAYER) continue
    if (!isEntityHit(entity, worldX, worldY)) continue
    if (!entity.isBuilt) {
      // 右键未完成建筑 → 农民过来建造
      const gids = ids.filter(id => getEntity(id)?.gatherer)
      if (gids.length > 0) {
        commandBuild(gids, entity.id)
        return { handled: true, command: 'build' }
      }
    }
    // 己方已完成建筑不做特殊处理（继续下面的逻辑）
    break
  }

  // 检查敌方/中立实体 → 攻击
  for (const entity of state.entities.values()) {
    if (entity.state === ENTITY_STATE.DEAD || entity.team === TEAM.PLAYER) continue
    if (!isEntityHit(entity, worldX, worldY)) continue
    commandAttack(ids, entity.id); return { handled: true, command: 'attack' }
  }

  // 检查资源 → 采集
  if (tileCol >= 0 && tileCol < COLS && tileRow >= 0 && tileRow < ROWS) {
    const idx = tileRow * COLS + tileCol
    if (state.resource[idx] && state.resourceAmount[idx] > 0) {
      const gids = ids.filter(id => getEntity(id)?.gatherer)
      if (gids.length > 0) { commandGather(gids, tileCol, tileRow); return { handled: true, command: 'gather' } }
    }
  }
  commandMove(ids, tileCol, tileRow)
  return { handled: true, command: 'move' }
}

/**
 * 判断世界坐标是否在实体可点击范围内
 */
function isEntityHit(entity, worldX, worldY) {
  if (entity.entityType === 'building') {
    // 建筑用矩形碰撞（基于 tileX/tileY/size）
    const bx = entity.tileX * TILE_SIZE
    const by = entity.tileY * TILE_SIZE
    const bw = entity.size.w * TILE_SIZE
    const bh = entity.size.h * TILE_SIZE
    // 加一点边距方便点击
    const pad = TILE_SIZE * 0.3
    return worldX >= bx - pad && worldX <= bx + bw + pad &&
           worldY >= by - pad && worldY <= by + bh + pad
  } else {
    // 单位用圆形碰撞
    const dx = entity.x - worldX, dy = entity.y - worldY
    return Math.sqrt(dx * dx + dy * dy) < TILE_SIZE * 0.6
  }
}

function handleLeftClick(tileCol, tileRow) {
  const state = getState()
  const worldX = tileCol * TILE_SIZE + TILE_SIZE / 2, worldY = tileRow * TILE_SIZE + TILE_SIZE / 2

  // 先检查己方实体
  const clicked = []
  for (const entity of state.entities.values()) {
    if (entity.state === ENTITY_STATE.DEAD || entity.team !== TEAM.PLAYER) continue
    if (isEntityHit(entity, worldX, worldY)) clicked.push(entity)
  }
  if (clicked.length > 0) {
    const units = clicked.filter(e => e.entityType === 'unit')
    if (units.length > 0) {
      if (state.selectedIds.includes(units[0].id)) removeFromSelection(units[0].id)
      else setSelected([units[0].id])
    } else setSelected([clicked[0].id])
    buildMode = null
    return
  }

  // 检查敌方/中立实体 → 选中查看信息（不可操作）
  for (const entity of state.entities.values()) {
    if (entity.state === ENTITY_STATE.DEAD || entity.team === TEAM.PLAYER) continue
    if (isEntityHit(entity, worldX, worldY)) {
      setSelectedEnemy(entity.id)
      buildMode = null
      return
    }
  }

  // 没有点击到实体，检查是否点击了资源
  if (tileCol >= 0 && tileCol < COLS && tileRow >= 0 && tileRow < ROWS) {
    const idx = tileRow * COLS + tileCol
    if (state.resource[idx] && state.resourceAmount[idx] > 0) {
      setSelectedResource(tileCol, tileRow)
    } else {
      clearSelection()
    }
  } else {
    clearSelection()
  }
  buildMode = null
}

export function enterBuildMode(buildingType) {
  const state = getState()
  // 用当前鼠标位置初始化预览位置
  const mp = getMousePosition()
  const col = Math.floor((mp.x + state.viewport.x) / TILE_SIZE)
  const row = Math.floor((mp.y + state.viewport.y) / TILE_SIZE)
  buildMode = { buildingType, previewCol: col, previewRow: row, isValid: checkBuildLocation(col, row, buildingType) }
}
export function cancelBuildMode() { buildMode = null }
export function getBuildMode() { return buildMode }

function checkBuildLocation(col, row, buildingType) {
  const def = BUILDING_DEFS[buildingType]; if (!def) return false
  const state = getState()
  for (let dy = 0; dy < def.size.h; dy++) for (let dx = 0; dx < def.size.w; dx++) {
    const cx = col + dx, cy = row + dy
    if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return false
    const idx = cy * COLS + cx
    if (state.terrain[idx] === 0 || state.terrain[idx] === 1 || state.resource[idx]) return false
  }
  for (const b of state.buildings.values()) {
    if (col < b.tileX + b.size.w && col + def.size.w > b.tileX && row < b.tileY + b.size.h && row + def.size.h > b.tileY) return false
  }
  // 检查范围内是否有单位
  for (const e of state.entities.values()) {
    if (e.entityType !== 'unit' || e.state === ENTITY_STATE.DEAD) continue
    const uc = Math.floor(e.x / TILE_SIZE), ur = Math.floor(e.y / TILE_SIZE)
    if (uc >= col && uc < col + def.size.w && ur >= row && ur < row + def.size.h) return false
  }
  return stateCanAfford(TEAM.PLAYER, def.cost)
}

export function getTileInfo(clientX, clientY) {
  const state = getState(); if (!state.mapReady) return null
  const vp = state.viewport
  const col = Math.floor((clientX + vp.x) / TILE_SIZE), row = Math.floor((clientY + vp.y) / TILE_SIZE)
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null
  const idx = row * COLS + col
  const tn = ['深水', '浅水', '沙地', '空地', '草地', '森林', '山地'][state.terrain[idx]] || '未知'
  let ri = null
  if (state.resource[idx]) { const d = RESOURCE_DEFS[state.resource[idx]]; ri = d ? d.name + ' (' + Math.floor(state.resourceAmount[idx]) + ')' : null }
  const un = []
  for (const e of state.entities.values()) {
    if (e.entityType === 'unit' && e.state !== ENTITY_STATE.DEAD && Math.floor(e.x / TILE_SIZE) === col && Math.floor(e.y / TILE_SIZE) === row) un.push(e.name)
  }
  return { terrain: tn, resource: ri, units: un.length > 0 ? un.join(', ') : null }
}
