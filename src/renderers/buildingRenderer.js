import { MAP_CONFIG } from '../mapConstants.js'

const { TILE_SIZE } = MAP_CONFIG

// 血条尺寸
const HP_BAR_WIDTH = 36
const HP_BAR_HEIGHT = 4
const HP_BAR_OFFSET_Y = 6  // 血条距单位顶部的距离

/**
 * 绘制血条
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - 单位中心 x
 * @param {number} cy - 单位顶部 y
 * @param {number} hp - 当前血量
 * @param {number} maxHp - 最大血量
 * @param {boolean} selected - 是否选中
 */
export function drawHpBar(ctx, cx, cy, hp, maxHp, selected) {
  const barX = cx - HP_BAR_WIDTH / 2
  const barY = cy - HP_BAR_OFFSET_Y

  // 背景（黑色底）
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fillRect(barX - 1, barY - 1, HP_BAR_WIDTH + 2, HP_BAR_HEIGHT + 2)

  // 血量比例
  const ratio = Math.max(0, Math.min(1, hp / maxHp))

  // 血条颜色：绿→黄→红
  let barColor
  if (ratio > 0.6) {
    barColor = '#4caf50'
  } else if (ratio > 0.3) {
    barColor = '#ff9800'
  } else {
    barColor = '#f44336'
  }

  ctx.fillStyle = barColor
  ctx.fillRect(barX, barY, HP_BAR_WIDTH * ratio, HP_BAR_HEIGHT)

  // 选中时加白色边框
  if (selected) {
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.strokeRect(barX - 1, barY - 1, HP_BAR_WIDTH + 2, HP_BAR_HEIGHT + 2)
  }
}

/**
 * 渲染建筑
 */
export function renderStructure(ctx, tile, px, py, images) {
  if (!tile.structure) return

  const img = images[tile.structure.image]
  if (!img) return

  ctx.drawImage(img, px, py, TILE_SIZE, TILE_SIZE)
}

/**
 * 渲染格子上的单位（静止）
 * 支持 tile.units 数组，同格多单位叠加
 * 选中高亮改为头顶血条
 */
export function renderUnit(ctx, tile, px, py, images, selectedUnits = []) {
  if (!tile.units || tile.units.length === 0) return

  // 构建选中单位 id 集合
  const selectedIds = new Set()
  for (const sel of selectedUnits) {
    if (sel.unit && sel.unit.id) selectedIds.add(sel.unit.id)
  }

  const unitCount = tile.units.length
  for (let i = 0; i < unitCount; i++) {
    const unit = tile.units[i]
    const img = images[unit.image]
    if (!img) continue

    const isSelected = unit.id && selectedIds.has(unit.id)

    // 所有单位都重合渲染在同一位置，不做错开
    const unitSize = TILE_SIZE * 0.8
    const offset = (TILE_SIZE - unitSize) / 2
    const drawX = px + offset
    const drawY = py + offset
    ctx.drawImage(img, drawX, drawY, unitSize, unitSize)

    if (isSelected) {
      const hp = unit.hp ?? 100
      const maxHp = unit.maxHp ?? 100
      const cx = px + TILE_SIZE / 2
      const topY = drawY
      drawHpBar(ctx, cx, topY, hp, maxHp, true)
    }
  }
}

/**
 * 渲染移动中的单位（像素级平滑位置）
 */
export function renderMovingUnit(ctx, mover, viewportX, viewportY, images, isSelected) {
  const img = images[mover.unit.image]
  if (!img) return

  const unitSize = TILE_SIZE * 0.8
  const offset = (TILE_SIZE - unitSize) / 2

  // 世界坐标转画布坐标
  const drawX = mover.pixelX - viewportX + offset
  const drawY = mover.pixelY - viewportY + offset

  ctx.drawImage(img, drawX, drawY, unitSize, unitSize)

  // 血条（仅选中时显示）
  if (isSelected) {
    const hp = mover.unit.hp ?? 100
    const maxHp = mover.unit.maxHp ?? 100
    const cx = mover.pixelX - viewportX + TILE_SIZE / 2
    const topY = drawY

    drawHpBar(ctx, cx, topY, hp, maxHp, true)
  }
}
