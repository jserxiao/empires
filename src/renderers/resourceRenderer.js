import { MAP_CONFIG } from '../mapConstants.js'

const { TILE_SIZE } = MAP_CONFIG

/**
 * 渲染单个资源（单图或多图组合）
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} resource - 资源数据 { name, image? } 或 { name, images: [] }
 * @param {number} px - 瓦片左上角 x
 * @param {number} py - 瓦片左上角 y
 * @param {Object} images - 已加载的图片字典
 */
export function renderResource(ctx, resource, px, py, images) {
  if (resource.images && resource.images.length > 0) {
    renderMultiImageResource(ctx, resource.images, px, py, images)
  } else if (resource.image && images[resource.image]) {
    renderSingleImageResource(ctx, resource.image, px, py, images)
  }
}

/**
 * 渲染单图资源（居中缩放）
 */
function renderSingleImageResource(ctx, imagePath, px, py, images) {
  const img = images[imagePath]
  if (!img) return
  const resSize = TILE_SIZE * 0.55
  const offset = (TILE_SIZE - resSize) / 2
  ctx.drawImage(img, px + offset, py + offset, resSize, resSize)
}

/**
 * 渲染多图组合资源
 * - 2 张图：一大一小叠加
 * - 4 张图：2×2 网格，主图略大
 * - 其他数量：自动均匀分布
 */
function renderMultiImageResource(ctx, imagePaths, px, py, images) {
  const count = imagePaths.length
  const padding = TILE_SIZE * 0.04
  const areaSize = TILE_SIZE - padding * 2

  if (count === 2) {
    renderPair(ctx, imagePaths, px, py, images, padding, areaSize)
  } else if (count === 4) {
    renderGrid2x2(ctx, imagePaths, px, py, images, padding, areaSize)
  } else {
    renderAutoGrid(ctx, imagePaths, px, py, images, padding, areaSize)
  }
}

/** 2 张图叠加布局 */
function renderPair(ctx, imagePaths, px, py, images, padding, areaSize) {
  const mainSize = areaSize * 0.6
  const subSize = mainSize * 0.65

  const mainImg = images[imagePaths[0]]
  const subImg = images[imagePaths[1]]

  if (mainImg) {
    ctx.drawImage(mainImg, px + padding, py + padding + 4, mainSize, mainSize)
  }
  if (subImg) {
    ctx.drawImage(subImg, px + padding + mainSize * 0.4, py + padding, subSize, subSize)
  }
}

/** 4 张图 2×2 网格布局（主图略大，增加层次感） */
function renderGrid2x2(ctx, imagePaths, px, py, images, padding, areaSize) {
  const cellSize = areaSize / 2
  const gap = padding * 0.5
  const cellDraw = cellSize - gap

  for (let i = 0; i < 4; i++) {
    const img = images[imagePaths[i]]
    if (!img) continue
    const col = i % 2
    const row = Math.floor(i / 2)
    const scale = (i === 0) ? 1.0 : (i === 1 ? 0.9 : 0.8)
    const drawSize = cellDraw * scale
    const ox = px + padding + col * cellSize + (cellDraw - drawSize) / 2
    const oy = py + padding + row * cellSize + (cellDraw - drawSize) / 2
    ctx.drawImage(img, ox, oy, drawSize, drawSize)
  }
}

/** 通用 N 张图均匀网格 */
function renderAutoGrid(ctx, imagePaths, px, py, images, padding, areaSize) {
  const count = imagePaths.length
  const gridCols = Math.ceil(Math.sqrt(count))
  const itemSize = areaSize / gridCols

  for (let i = 0; i < count; i++) {
    const img = images[imagePaths[i]]
    if (!img) continue
    const col = i % gridCols
    const row = Math.floor(i / gridCols)
    ctx.drawImage(img, px + padding + col * itemSize, py + padding + row * itemSize, itemSize, itemSize)
  }
}
