import { TERRAIN, ROAD, ROAD_IMAGES, TERRAIN_COLORS, MAP_CONFIG } from '../mapConstants.js'
import { renderResource } from './resourceRenderer.js'
import { renderStructure, renderUnit, renderMovingUnit, drawHpBar } from './buildingRenderer.js'

const { TILE_SIZE } = MAP_CONFIG

/**
 * 渲染单个瓦片（地形 + 道路 + 资源 + 建筑 + 单位）
 * 渲染顺序：地形 → 道路 → 资源 → 建筑 → 单位
 */
export function renderTile(ctx, tile, px, py, images, selectedUnits = [], drawSize = TILE_SIZE) {
  // 1. 地形基底
  const tileImg = images[tile.tileImage]
  if (tileImg) {
    ctx.drawImage(tileImg, px, py, drawSize, drawSize)
  } else {
    ctx.fillStyle = TERRAIN_COLORS[tile.terrain] || '#333'
    ctx.fillRect(px, py, drawSize, drawSize)
  }

  // 2. 道路
  if (tile.road !== ROAD.NONE) {
    const roadImg = images[ROAD_IMAGES[tile.road]]
    if (roadImg) {
      if (tile.terrain === TERRAIN.GRASS || tile.terrain === TERRAIN.EMPTY) {
        ctx.globalAlpha = 0.85
        ctx.drawImage(roadImg, px, py, drawSize, drawSize)
        ctx.globalAlpha = 1.0
      } else {
        ctx.drawImage(roadImg, px, py, drawSize, drawSize)
      }
    }
  }

  // 3. 资源
  if (tile.resource) {
    renderResource(ctx, tile.resource, px, py, images)
  }

  // 4. 建筑
  if (tile.structure) {
    renderStructure(ctx, tile, px, py, images)
  }

  // 5. 单位（支持同格多单位叠加）
  if (tile.units && tile.units.length > 0) {
    const unitCount = tile.units.length
    // 构建本格子中选中单位的 id 集合
    const selectedUnitIds = new Set()
    for (const sel of selectedUnits) {
      if (sel.unit && sel.unit.id) selectedUnitIds.add(sel.unit.id)
    }

    for (let i = 0; i < unitCount; i++) {
      const unit = tile.units[i]
      const img = images[unit.image]
      if (!img) continue

      const isSelected = unit.id && selectedUnitIds.has(unit.id)

      // 所有单位都重合渲染在同一位置
      const unitSize = drawSize * 0.8
      const offset = (drawSize - unitSize) / 2
      const drawX = px + offset
      const drawY = py + offset
      ctx.drawImage(img, drawX, drawY, unitSize, unitSize)

      // 选中时显示血条
      if (isSelected) {
        const hp = unit.hp ?? 100
        const maxHp = unit.maxHp ?? 100
        const cx = drawX + unitSize / 2
        const topY = drawY
        drawHpBar(ctx, cx, topY, hp, maxHp, true)
      }
    }
  }
}

/**
 * 渲染虚线选框
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} box - { startX, startY, endX, endY } 屏幕坐标
 */
function renderSelectionBox(ctx, box) {
  if (!box) return

  const x = Math.min(box.startX, box.endX)
  const y = Math.min(box.startY, box.endY)
  const w = Math.abs(box.endX - box.startX)
  const h = Math.abs(box.endY - box.startY)

  if (w < 2 && h < 2) return

  // 半透明填充
  ctx.fillStyle = 'rgba(100, 180, 255, 0.12)'
  ctx.fillRect(x, y, w, h)

  // 虚线边框
  ctx.save()
  ctx.setLineDash([6, 4])
  ctx.strokeStyle = 'rgba(100, 180, 255, 0.8)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(x, y, w, h)
  ctx.restore()
}

/**
 * 渲染视口范围内的所有瓦片 + 移动中的单位 + 虚线选框
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} map - 地图数据
 * @param {Object} viewport - { x, y } 视口偏移
 * @param {Object} images - 已加载的图片字典
 * @param {Array} movingUnits - 移动中的单位数组
 * @param {Array} selectedUnits - 选中的单位列表 [{ col, row, unit, movingUnit? }, ...]
 * @param {Object} selectionBox - 虚线选框 { startX, startY, endX, endY }
 */
export function renderViewport(ctx, map, viewport, images, movingUnits = [], selectedUnits = [], selectionBox = null) {
  const { COLS, ROWS } = MAP_CONFIG
  const vw = ctx.canvas.width
  const vh = ctx.canvas.height

  const startCol = Math.max(0, Math.floor(viewport.x / TILE_SIZE))
  const endCol = Math.min(COLS, Math.ceil((viewport.x + vw) / TILE_SIZE))
  const startRow = Math.max(0, Math.floor(viewport.y / TILE_SIZE))
  const endRow = Math.min(ROWS, Math.ceil((viewport.y + vh) / TILE_SIZE))
  const offsetX = -(viewport.x % TILE_SIZE)
  const offsetY = -(viewport.y % TILE_SIZE)

  ctx.clearRect(0, 0, vw, vh)

  // 渲染静态瓦片
  // 选中单位按格子分组，方便 renderTile 判断每个单位是否选中
  const selectedByTile = new Map()  // key: "col,row" → value: [sel, ...]
  for (const sel of selectedUnits) {
    const key = `${sel.col},${sel.row}`
    if (!selectedByTile.has(key)) selectedByTile.set(key, [])
    selectedByTile.get(key).push(sel)
  }

  const PAD = 1
  for (let row = startRow; row < endRow; row++) {
    for (let col = startCol; col < endCol; col++) {
      const tile = map[row][col]
      const px = (col - startCol) * TILE_SIZE + offsetX - PAD
      const py = (row - startRow) * TILE_SIZE + offsetY - PAD
      const drawSize = TILE_SIZE + PAD * 2

      const tileSelectedUnits = selectedByTile.get(`${col},${row}`) || []
      renderTile(ctx, tile, px, py, images, tileSelectedUnits, drawSize)
    }
  }

  // 渲染移动中的单位（在最上层）
  if (movingUnits.length > 0) {
    // 构建移动单位的选中 id 集合
    const movingSelectedIds = new Set()
    for (const sel of selectedUnits) {
      if (sel.movingUnit && sel.unit && sel.unit.id) {
        movingSelectedIds.add(sel.unit.id)
      }
    }

    for (const mover of movingUnits) {
      const isMovingSelected = mover.unit && mover.unit.id && movingSelectedIds.has(mover.unit.id)
      renderMovingUnit(ctx, mover, viewport.x, viewport.y, images, isMovingSelected)
    }
  }

  // 最后绘制虚线选框（最上层）
  if (selectionBox) {
    renderSelectionBox(ctx, selectionBox)
  }
}
