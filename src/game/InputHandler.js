import {
  getState, setSelected, clearSelection, getEntity,
  startBuilding, removeFromSelection, canAfford as stateCanAfford,
} from '../core/GameState.js'
import { commandMove, commandAttack, commandGather, commandBuild } from '../systems/MovementSystem.js'
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
  const state = getState()
  const vp = state.viewport
  const tileCol = Math.floor((e.clientX + vp.x) / TILE_SIZE)
  const tileRow = Math.floor((e.clientY + vp.y) / TILE_SIZE)
  const worldX = e.clientX + vp.x, worldY = e.clientY + vp.y
  const ids = state.selectedIds.filter(id => {
    const ent = getEntity(id)
    return ent && ent.entityType === 'unit' && ent.team === TEAM.PLAYER && ent.state !== ENTITY_STATE.DEAD
  })
  if (ids.length === 0) return { handled: true }
  for (const entity of state.entities.values()) {
    if (entity.state === ENTITY_STATE.DEAD || entity.team === TEAM.PLAYER) continue
    const dx = entity.x - worldX, dy = entity.y - worldY
    if (Math.sqrt(dx * dx + dy * dy) < (entity.entityType === 'building' ? TILE_SIZE * 1.5 : TILE_SIZE * 0.6)) {
      commandAttack(ids, entity.id); return { handled: true, command: 'attack' }
    }
  }
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

function handleLeftClick(tileCol, tileRow) {
  const state = getState()
  const worldX = tileCol * TILE_SIZE + TILE_SIZE / 2, worldY = tileRow * TILE_SIZE + TILE_SIZE / 2
  const clicked = []
  for (const entity of state.entities.values()) {
    if (entity.state === ENTITY_STATE.DEAD || entity.team !== TEAM.PLAYER) continue
    const dx = entity.x - worldX, dy = entity.y - worldY
    if (Math.sqrt(dx * dx + dy * dy) < (entity.entityType === 'building' ? TILE_SIZE * 1.5 : TILE_SIZE * 0.6)) clicked.push(entity)
  }
  if (clicked.length > 0) {
    const units = clicked.filter(e => e.entityType === 'unit')
    if (units.length > 0) {
      if (state.selectedIds.includes(units[0].id)) removeFromSelection(units[0].id)
      else setSelected([units[0].id])
    } else setSelected([clicked[0].id])
  } else clearSelection()
  buildMode = null
}

export function enterBuildMode(buildingType) { buildMode = { buildingType, previewCol: 0, previewRow: 0, isValid: false } }
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
