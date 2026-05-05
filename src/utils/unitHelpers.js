/**
 * 单位辅助函数 - 单位 ID 生成、格子单位管理
 */

// ===== 单位唯一 ID 生成器 =====
let _unitIdCounter = 0

function nextUnitId() {
  return ++_unitIdCounter
}

/** 确保单位有 id，没有则分配一个 */
export function ensureUnitId(unit) {
  if (!unit.id) unit.id = nextUnitId()
  return unit
}

/** 向格子的 units 数组中添加一个单位（自动确保 id） */
export function addUnitToTile(tile, unit) {
  ensureUnitId(unit)
  if (!tile.units) tile.units = []
  tile.units.push(unit)
}

/** 从格子的 units 数组中移除一个单位（按 id 匹配） */
export function removeUnitFromTile(tile, unit) {
  if (!tile.units || !unit.id) return
  const idx = tile.units.findIndex(u => u.id === unit.id)
  if (idx !== -1) tile.units.splice(idx, 1)
}

/** 判断格子中是否有单位 */
export function hasUnit(tile) {
  return tile && tile.units && tile.units.length > 0
}

/** 判断格子中是否包含指定单位（按 id 匹配） */
export function tileContainsUnit(tile, unit) {
  if (!tile || !tile.units || !unit.id) return false
  return tile.units.some(u => u.id === unit.id)
}
