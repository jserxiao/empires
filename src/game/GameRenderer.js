/**
 * 游戏渲染器 - PixiJS 版
 *
 * 设计要点：
 * 1. 使用 PixiJS Sprite/Container 代替 Canvas 2D 绘制
 * 2. 地形层用离屏 RenderTexture 缓存静态瓦片
 * 3. 动态实体（建筑/单位）每帧根据游戏状态更新
 * 4. 弹道和特效渲染在 effectLayer
 * 5. 选框在 uiLayer（屏幕坐标）
 */

import { getState, getMapData } from '../core/GameState.js'
import {
  MAP_CONFIG, TERRAIN, TERRAIN_COLORS, ROAD, ROAD_IMAGES,
  TILE_IMAGES, RESOURCE_DEFS, ENTITY_STATE, UNIT_DISPLAY_SIZE,
  FOG_CONFIG, TEAM,
} from '../core/constants.js'
import { getTexture, getLayers, renderFrame, getPixiApp } from '../core/PixiApp.js'
import { getFogData, getTileVisibility } from '../systems/FogOfWar.js'
import {
  Container, Sprite, Graphics, RenderTexture, Texture,
} from 'pixi.js'

const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG

// ===== 静态缓存 =====
let staticCacheTexture = null
let cachedViewportX = -Infinity
let cachedViewportY = -Infinity
const CACHE_PADDING = 2

// ===== 实体精灵缓存 =====
// entityId → { container, sprites, hpBar, ... }
const entitySprites = new Map()

// ===== 选框 =====
let selectionBoxGraphics = null

// ===== 弹道精灵 =====
const projectileSprites = []

/**
 * 初始化渲染器的 UI 元素
 */
export function initRenderer() {
  const { uiLayer } = getLayers()
  if (!uiLayer) {
    console.warn('initRenderer: uiLayer is null, PixiJS not ready')
    return
  }
  selectionBoxGraphics = new Graphics()
  uiLayer.addChild(selectionBoxGraphics)
}

/**
 * 主渲染函数 - 每帧由 GameLoop 调用
 */
export function renderGame(alpha, projectiles) {
  const state = getState()
  if (!state.mapReady) return

  const vp = state.viewport
  const app = getPixiApp()
  const { worldContainer, tileLayer, entityLayer, effectLayer } = getLayers()

  // 1. 更新世界容器位置（视口偏移）
  worldContainer.position.set(-vp.x, -vp.y)

  // 2. 渲染静态地形层
  renderStaticLayer(vp)

  // 3. 收集动态实体并按 y 排序
  const renderables = collectRenderables(state, vp, app.screen.width, app.screen.height)
  renderables.sort((a, b) => a.y - b.y)

  // 4. 同步实体精灵
  const selectedIds = new Set(state.selectedIds)
  const activeEntityIds = new Set()

  for (const item of renderables) {
    const isSelected = selectedIds.has(item.entity.id)
    item.entity._selected = isSelected
    activeEntityIds.add(item.entity.id)
    updateEntitySprite(item, isSelected, vp)
  }

  // 移除不再可见/已死亡的实体精灵
  for (const [id, data] of entitySprites) {
    if (!activeEntityIds.has(id)) {
      data.container.destroy({ children: true })
      entitySprites.delete(id)
    }
  }

  // 5. 黑雾
  renderFogLayer(vp)

  // 6. 弹道
  renderProjectiles(projectiles)

  // 7. 手动渲染
  renderFrame()
}

// ===== 静态地形层 =====
function renderStaticLayer(vp) {
  const app = getPixiApp()
  const { tileLayer } = getLayers()
  const vw = app.screen.width
  const vh = app.screen.height

  const startCol = Math.max(0, Math.floor(vp.x / TILE_SIZE))
  const endCol = Math.min(COLS, Math.ceil((vp.x + vw) / TILE_SIZE))
  const startRow = Math.max(0, Math.floor(vp.y / TILE_SIZE))
  const endRow = Math.min(ROWS, Math.ceil((vp.y + vh) / TILE_SIZE))

  const needRedraw = !staticCacheTexture ||
    Math.abs(vp.x - cachedViewportX) > TILE_SIZE * CACHE_PADDING ||
    Math.abs(vp.y - cachedViewportY) > TILE_SIZE * CACHE_PADDING

  if (needRedraw) {
    const csCol = Math.max(0, startCol - CACHE_PADDING)
    const ceCol = Math.min(COLS, endCol + CACHE_PADDING)
    const csRow = Math.max(0, startRow - CACHE_PADDING)
    const ceRow = Math.min(ROWS, endRow + CACHE_PADDING)
    const cw = (ceCol - csCol) * TILE_SIZE
    const ch = (ceRow - csRow) * TILE_SIZE

    // 创建/重建 RenderTexture
    if (!staticCacheTexture || staticCacheTexture.width !== cw || staticCacheTexture.height !== ch) {
      if (staticCacheTexture) staticCacheTexture.destroy(true)
      staticCacheTexture = RenderTexture.create({ width: cw, height: ch })
    }

    // 用 Graphics 绘制所有瓦片到一个临时容器，再渲染到 RenderTexture
    const tempContainer = new Container()
    const mapData = getMapData()

    for (let row = csRow; row < ceRow; row++) {
      for (let col = csCol; col < ceCol; col++) {
        renderStaticTileToContainer(tempContainer, mapData, col, row,
          (col - csCol) * TILE_SIZE, (row - csRow) * TILE_SIZE, TILE_SIZE)
      }
    }

    // 渲染到 RenderTexture
    app.renderer.render({ container: tempContainer, target: staticCacheTexture })
    tempContainer.destroy({ children: true })

    // 更新缓存瓦片位置
    cachedViewportX = vp.x
    cachedViewportY = vp.y

    // 更新 tileLayer 上的精灵
    if (tileLayer.children.length === 0) {
      const cacheSprite = new Sprite(staticCacheTexture)
      cacheSprite.label = 'staticCache'
      tileLayer.addChild(cacheSprite)
    } else {
      tileLayer.children[0].texture = staticCacheTexture
    }

    const cacheSprite = tileLayer.children[0]
    cacheSprite.position.set(csCol * TILE_SIZE, csRow * TILE_SIZE)
  }
}

// ===== 黑雾层 =====
let fogGraphics = null

function renderFogLayer(vp) {
  if (!FOG_CONFIG.enabled) {
    // 黑雾关闭时清空雾层
    if (fogGraphics) {
      fogGraphics.clear()
      fogGraphics.visible = false
    }
    return
  }

  const { fogExplored, fogVisible } = getFogData()
  if (!fogExplored || !fogVisible) return

  const { fogLayer } = getLayers()

  // 确保 Graphics 对象存在
  if (!fogGraphics) {
    fogGraphics = new Graphics()
    fogGraphics.label = 'fog'
    fogLayer.addChild(fogGraphics)
  }

  fogGraphics.clear()
  fogGraphics.visible = true

  const startCol = Math.max(0, Math.floor(vp.x / TILE_SIZE))
  const endCol = Math.min(COLS, Math.ceil((vp.x + window.innerWidth) / TILE_SIZE))
  const startRow = Math.max(0, Math.floor(vp.y / TILE_SIZE))
  const endRow = Math.min(ROWS, Math.ceil((vp.y + window.innerHeight) / TILE_SIZE))

  const fogAlpha = FOG_CONFIG.fogAlpha
  const exploredAlpha = FOG_CONFIG.exploredAlpha

  // 批量绘制：先画所有未探索的，再画所有已探索灰雾的
  // 这样可以减少 fill 状态切换
  for (let row = startRow; row < endRow; row++) {
    for (let col = startCol; col < endCol; col++) {
      const idx = row * COLS + col
      if (fogVisible[idx]) continue // 当前可见 - 不画黑雾

      const px = col * TILE_SIZE
      const py = row * TILE_SIZE

      if (fogExplored[idx]) {
        fogGraphics.rect(px, py, TILE_SIZE, TILE_SIZE)
        fogGraphics.fill({ color: 0x000000, alpha: exploredAlpha })
      } else {
        fogGraphics.rect(px, py, TILE_SIZE, TILE_SIZE)
        fogGraphics.fill({ color: 0x000000, alpha: fogAlpha })
      }
    }
  }
}

function renderStaticTileToContainer(container, mapData, col, row, px, py, size) {
  const idx = row * COLS + col
  const terrain = mapData.terrain[idx]
  const road = mapData.road[idx]

  // 地形
  const tileTex = getTexture(TILE_IMAGES[terrain])
  if (tileTex !== Texture.EMPTY) {
    const sprite = new Sprite(tileTex)
    sprite.position.set(px, py)
    sprite.width = size
    sprite.height = size
    container.addChild(sprite)
  } else {
    // 用 Graphics 画色块
    const colorHex = TERRAIN_COLORS[terrain] || '#333333'
    const g = new Graphics()
    g.rect(px, py, size, size)
    g.fill(colorHex)
    container.addChild(g)
  }

  // 道路
  if (road !== ROAD.NONE) {
    const roadTex = getTexture(ROAD_IMAGES[road])
    if (roadTex !== Texture.EMPTY) {
      const roadSprite = new Sprite(roadTex)
      roadSprite.position.set(px, py)
      roadSprite.width = size
      roadSprite.height = size
      if (terrain === TERRAIN.GRASS || terrain === TERRAIN.EMPTY) {
        roadSprite.alpha = 0.85
      }
      container.addChild(roadSprite)
    }
  }

  // 资源
  const resourceKey = mapData.resource[idx]
  if (resourceKey) {
    const def = RESOURCE_DEFS[resourceKey]
    if (def) {
      const isTree = resourceKey === 'pine_tree'
      // 森林地形已有树底图，树资源渲染更小；草地树稍小；其他资源保持原比例
      let resScale = 0.55
      if (isTree && terrain === TERRAIN.FOREST) resScale = 0.30
      else if (isTree && terrain === TERRAIN.GRASS) resScale = 0.38
      if (def.images && def.images.length > 0) {
        renderMultiResToContainer(container, def.images, px, py, size, isTree, terrain)
      } else if (def.image) {
        const img = getTexture(def.image)
        if (img !== Texture.EMPTY) {
          const s = size * resScale, o = (size - s) / 2
          const sprite = new Sprite(img)
          sprite.position.set(px + o, py + o)
          sprite.width = s
          sprite.height = s
          container.addChild(sprite)
        }
      }
    }
  }
}

function renderMultiResToContainer(container, paths, px, py, size, isTree, terrain) {
  // 树资源在森林地形缩小，草地地形稍缩小
  const baseScale = isTree && terrain === TERRAIN.FOREST ? 0.55
    : isTree && terrain === TERRAIN.GRASS ? 0.7
    : 1.0
  const pad = size * 0.04, area = (size - pad * 2) * baseScale
  const areaOffset = (size - pad * 2 - area) / 2
  const count = paths.length
  if (count === 4) {
    const cell = area / 2, gap = pad * 0.5
    for (let i = 0; i < 4; i++) {
      const tex = getTexture(paths[i])
      if (tex === Texture.EMPTY) continue
      const c = i % 2, r = Math.floor(i / 2)
      const sc = i === 0 ? 1 : i === 1 ? 0.9 : 0.8
      const ds = (cell - gap) * sc
      const sprite = new Sprite(tex)
      sprite.position.set(px + pad + areaOffset + c * cell + (cell - gap - ds) / 2, py + pad + areaOffset + r * cell + (cell - gap - ds) / 2)
      sprite.width = ds
      sprite.height = ds
      container.addChild(sprite)
    }
  } else if (count === 2) {
    const ms = area * 0.6, ss = ms * 0.65
    const mt = getTexture(paths[0]), st = getTexture(paths[1])
    if (mt !== Texture.EMPTY) {
      const sprite = new Sprite(mt)
      sprite.position.set(px + pad + areaOffset, py + pad + areaOffset + 4)
      sprite.width = ms
      sprite.height = ms
      container.addChild(sprite)
    }
    if (st !== Texture.EMPTY) {
      const sprite = new Sprite(st)
      sprite.position.set(px + pad + areaOffset + ms * 0.4, py + pad + areaOffset)
      sprite.width = ss
      sprite.height = ss
      container.addChild(sprite)
    }
  } else {
    const gc = Math.ceil(Math.sqrt(count)), is = area / gc
    for (let i = 0; i < count; i++) {
      const tex = getTexture(paths[i])
      if (tex === Texture.EMPTY) continue
      const sprite = new Sprite(tex)
      sprite.position.set(px + pad + areaOffset + (i % gc) * is, py + pad + areaOffset + Math.floor(i / gc) * is)
      sprite.width = is
      sprite.height = is
      container.addChild(sprite)
    }
  }
}

// ===== 动态实体 =====
function collectRenderables(state, vp, vw, vh) {
  const res = []
  const m = TILE_SIZE * 2
  for (const e of state.entities.values()) {
    if (e.state === ENTITY_STATE.DEAD) continue
    const sx = e.x - vp.x, sy = e.y - vp.y
    if (sx < -m || sx > vw + m || sy < -m || sy > vh + m) continue

    // 黑雾：非玩家实体必须在可见区域内才渲染
    if (FOG_CONFIG.enabled && e.team !== TEAM.PLAYER) {
      const tileX = e.entityType === 'building' ? e.tileX + e.size.w / 2 : Math.floor(e.x / TILE_SIZE)
      const tileY = e.entityType === 'building' ? e.tileY + e.size.h / 2 : Math.floor(e.y / TILE_SIZE)
      const vis = getTileVisibility(tileX, tileY)
      if (vis < 2) continue // 不在当前视野内，不渲染敌方实体
    }

    res.push({ y: e.y, kind: e.entityType, entity: e })
  }
  return res
}

function updateEntitySprite(item, isSelected, vp) {
  const { entityLayer } = getLayers()
  const entity = item.entity

  let data = entitySprites.get(entity.id)
  if (!data) {
    // 创建新精灵容器
    data = createEntitySprite(entity)
    entitySprites.set(entity.id, data)
    entityLayer.addChild(data.container)
  }

  // 更新位置
  if (entity.entityType === 'building') {
    const bx = entity.tileX * TILE_SIZE
    const by = entity.tileY * TILE_SIZE
    data.container.position.set(bx, by)
    updateBuildingSprite(data, entity, isSelected)
  } else {
    const us = TILE_SIZE * 0.8
    data.container.position.set(entity.x - us / 2, entity.y - us / 2)
    updateUnitSprite(data, entity, isSelected, vp)
  }

  // 排序：设置 zIndex 为 y 坐标实现深度排序
  data.container.zIndex = item.y
}

function createEntitySprite(entity) {
  const container = new Container()
  container.sortableChildren = true

  if (entity.entityType === 'building') {
    return { container, type: 'building', sprites: [], hpBar: null, buildBar: null, carryIndicator: null }
  } else {
    return { container, type: 'unit', sprite: null, hpBar: null, carryIndicator: null }
  }
}

function updateBuildingSprite(data, b, isSelected) {
  const w = b.size.w * TILE_SIZE, h = b.size.h * TILE_SIZE

  // 确保精灵存在
  if (data.sprites.length === 0) {
    if (b.images && b.images.length >= 2) {
      const topSprite = new Sprite(getTexture(b.images[0]))
      const botSprite = new Sprite(getTexture(b.images[1]))
      topSprite.label = 'top'
      botSprite.label = 'bottom'
      data.container.addChild(topSprite)
      data.container.addChild(botSprite)
      data.sprites.push(topSprite, botSprite)
    } else if (b.image) {
      const sprite = new Sprite(getTexture(b.image))
      sprite.label = 'main'
      data.container.addChild(sprite)
      data.sprites.push(sprite)
    }
  }

  // 更新双图建筑布局
  if (b.images && b.images.length >= 2 && data.sprites.length >= 2) {
    const imgW = TILE_SIZE, imgH = TILE_SIZE
    const ox = (w - imgW) / 2
    data.sprites[0].position.set(ox, 0)
    data.sprites[0].width = imgW
    data.sprites[0].height = imgH
    data.sprites[1].position.set(ox, imgH)
    data.sprites[1].width = imgW
    data.sprites[1].height = imgH
  } else if (data.sprites.length === 1) {
    data.sprites[0].position.set(0, 0)
    data.sprites[0].width = w
    data.sprites[0].height = h
  }

  // 建造进度条
  if (!b.isBuilt) {
    if (!data.buildBar) {
      const g = new Graphics()
      g.label = 'buildBar'
      data.container.addChild(g)
      data.buildBar = g
    }
    const bw = w * 0.8, bh = 6, bxx = (w - bw) / 2, byy = -10
    data.buildBar.clear()
    data.buildBar.rect(bxx - 1, byy - 1, bw + 2, bh + 2).fill({ color: 0x000000, alpha: 0.6 })
    data.buildBar.rect(bxx, byy, bw * b.buildProgress / 100, bh).fill({ color: 0xff9800 })
    data.buildBar.visible = true
  } else if (data.buildBar) {
    data.buildBar.visible = false
  }

  // HP 条
  if (b.hp < b.maxHp || isSelected) {
    drawEntityHpBar(data, w / 2, 0, b.hp, b.maxHp, w)
  } else if (data.hpBar) {
    data.hpBar.visible = false
  }
}

function updateUnitSprite(data, u, isSelected, vp) {
  // 从配置表获取单位显示尺寸，未配置则使用默认值
  const size = UNIT_DISPLAY_SIZE[u.type] || { w: 0.8, h: 0.8 }
  const uw = TILE_SIZE * size.w
  const uh = TILE_SIZE * size.h

  // 主精灵
  if (!data.sprite) {
    const tex = getTexture(u.image)
    const sprite = new Sprite(tex)
    sprite.width = uw
    sprite.height = uh
    // 在容器内居中显示
    sprite.x = (TILE_SIZE * 0.8 - uw) / 2
    sprite.y = (TILE_SIZE * 0.8 - uh) / 2
    data.container.addChild(sprite)
    data.sprite = sprite
  }

  // HP 条 - 以精灵在容器内的实际位置为基准
  const spriteOffsetX = data.sprite.x
  const spriteOffsetY = data.sprite.y
  if (isSelected) {
    drawEntityHpBar(data, spriteOffsetX + uw / 2, spriteOffsetY, u.hp, u.maxHp, uw)
  } else if (data.hpBar) {
    data.hpBar.visible = false
  }

  // 携带资源指示器
  if (u.carrying) {
    if (!data.carryIndicator) {
      const g = new Graphics()
      g.label = 'carry'
      data.container.addChild(g)
      data.carryIndicator = g
    }
    const colors = { food: 0xe74c3c, wood: 0x8d6e63, gold: 0xffd700, stone: 0x9e9e9e }
    data.carryIndicator.clear()
    data.carryIndicator.rect(spriteOffsetX + uw / 2 - 4, spriteOffsetY - 10, 8, 8)
    data.carryIndicator.fill({ color: colors[u.carrying.type] || 0xffffff })
    data.carryIndicator.visible = true
  } else if (data.carryIndicator) {
    data.carryIndicator.visible = false
  }
}

function drawEntityHpBar(data, cx, topY, hp, maxHp, width) {
  if (!data.hpBar) {
    const g = new Graphics()
    g.label = 'hpBar'
    data.container.addChild(g)
    data.hpBar = g
  }
  const bw = Math.min(width || 36, 36), bh = 4
  const bx = cx - bw / 2, by = topY - 8
  const r = Math.max(0, Math.min(1, hp / maxHp))
  const fillColor = r > 0.6 ? 0x4caf50 : r > 0.3 ? 0xff9800 : 0xf44336

  data.hpBar.clear()
  data.hpBar.rect(bx - 1, by - 1, bw + 2, bh + 2).fill({ color: 0x000000, alpha: 0.6 })
  data.hpBar.rect(bx, by, bw * r, bh).fill({ color: fillColor })
  data.hpBar.visible = true
}

// ===== 弹道 =====
function renderProjectiles(projectiles) {
  const { effectLayer } = getLayers()

  // 清理多余的精灵
  while (projectileSprites.length > projectiles.length) {
    const s = projectileSprites.pop()
    s.destroy()
  }

  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i]
    const x = p.startX + (p.targetX - p.startX) * p.progress
    const y = p.startY + (p.targetY - p.startY) * p.progress

    if (i < projectileSprites.length) {
      // 更新已有精灵
      const g = projectileSprites[i]
      g.clear()
      g.circle(x, y, 3).fill({ color: 0xffeb3b })
    } else {
      // 创建新精灵
      const g = new Graphics()
      g.circle(x, y, 3).fill({ color: 0xffeb3b })
      effectLayer.addChild(g)
      projectileSprites.push(g)
    }
  }
}

// ===== 选框 =====
export function renderSelectionBox(box) {
  if (!selectionBoxGraphics) return
  selectionBoxGraphics.clear()

  if (!box) return

  const x = Math.min(box.startX, box.endX), y = Math.min(box.startY, box.endY)
  const w = Math.abs(box.endX - box.startX), h = Math.abs(box.endY - box.startY)
  if (w < 2 && h < 2) return

  selectionBoxGraphics.rect(x, y, w, h).fill({ color: 0x64b4ff, alpha: 0.12 })
  selectionBoxGraphics.rect(x, y, w, h).stroke({ color: 0x64b4ff, alpha: 0.8, width: 1.5 })
}

/**
 * 使静态缓存失效（建筑建造等场景调用）
 */
export function invalidateStaticCache() {
  if (staticCacheTexture) {
    staticCacheTexture.destroy(true)
    staticCacheTexture = null
  }
  cachedViewportX = -Infinity
  cachedViewportY = -Infinity

  // 清空 tileLayer
  const { tileLayer } = getLayers()
  tileLayer.removeChildren()

  // 重置黑雾 Graphics
  fogGraphics = null
  const { fogLayer } = getLayers()
  if (fogLayer) fogLayer.removeChildren()
}

/**
 * 清理所有实体精灵
 */
export function clearEntitySprites() {
  for (const [, data] of entitySprites) {
    data.container.destroy({ children: true })
  }
  entitySprites.clear()

  // 清理弹道精灵
  for (const s of projectileSprites) {
    s.destroy()
  }
  projectileSprites.length = 0

  // 重置黑雾 Graphics
  fogGraphics = null
}
