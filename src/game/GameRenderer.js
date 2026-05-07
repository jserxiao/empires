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
  FOG_CONFIG, TEAM, BUILDING_DEFS,
} from '../core/constants.js'
import { getTexture, getTextureForTeam, getLayers, renderFrame, getPixiApp } from '../core/PixiApp.js'
import { getFogData, getTileVisibility, getFogMode, isFogEnabled, getEnemyMemory, getEnemyMemoryVersion, FOG_MODE } from '../systems/FogOfWar.js'
import { getBuildMode } from './InputHandler.js'
import {
  Container, Sprite, Graphics, RenderTexture, Texture,
} from 'pixi.js'
import { TEAM_COLOR_MAP } from '../core/constants.js'

const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG

// ===== 静态缓存 =====
let staticCacheTexture = null
let cachedViewportX = -Infinity
let cachedViewportY = -Infinity
const CACHE_PADDING = 4    // 缓存区域比视口多出的边距（瓦片数）
// 缓存区域范围记录（用于增量更新）
let cacheStartCol = 0, cacheEndCol = 0, cacheStartRow = 0, cacheEndRow = 0

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
  const selectedEnemyId = state.selectedEnemy
  const activeEntityIds = new Set()

  for (const item of renderables) {
    const isSelected = selectedIds.has(item.entity.id) || item.entity.id === selectedEnemyId
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

  // 5. 选中资源高亮
  renderSelectedResource(state, vp)

  // 6. 黑雾
  renderFogLayer(vp)

  // 7. 弹道
  renderProjectiles(projectiles)

  // 8. 建造预览
  renderBuildPreview()

  // 9. 手动渲染
  renderFrame()
}

// ===== 静态地形层 =====
function renderStaticLayer(vp) {
  const app = getPixiApp()
  const { tileLayer } = getLayers()
  const vw = app.screen.width
  const vh = app.screen.height

  const viewStartCol = Math.max(0, Math.floor(vp.x / TILE_SIZE))
  const viewEndCol = Math.min(COLS, Math.ceil((vp.x + vw) / TILE_SIZE))
  const viewStartRow = Math.max(0, Math.floor(vp.y / TILE_SIZE))
  const viewEndRow = Math.min(ROWS, Math.ceil((vp.y + vh) / TILE_SIZE))

  // 判断是否需要重建缓存（视口移动超出当前缓存范围）
  const needRebuild = !staticCacheTexture ||
    viewStartCol < cacheStartCol ||
    viewEndCol > cacheEndCol ||
    viewStartRow < cacheStartRow ||
    viewEndRow > cacheEndRow

  if (needRebuild) {
    // 新缓存范围：在视口基础上向四周扩展 CACHE_PADDING，但不超过地图边界
    const newStartCol = Math.max(0, viewStartCol - CACHE_PADDING)
    const newEndCol = Math.min(COLS, viewEndCol + CACHE_PADDING)
    const newStartRow = Math.max(0, viewStartRow - CACHE_PADDING)
    const newEndRow = Math.min(ROWS, viewEndRow + CACHE_PADDING)
    const cw = (newEndCol - newStartCol) * TILE_SIZE
    const ch = (newEndRow - newStartRow) * TILE_SIZE

    // 创建/重建 RenderTexture
    if (!staticCacheTexture || staticCacheTexture.width !== cw || staticCacheTexture.height !== ch) {
      if (staticCacheTexture) staticCacheTexture.destroy(true)
      staticCacheTexture = RenderTexture.create({ width: cw, height: ch })
    }

    // 绘制所有瓦片到临时容器，再渲染到 RenderTexture
    const tempContainer = new Container()
    const mapData = getMapData()

    for (let row = newStartRow; row < newEndRow; row++) {
      for (let col = newStartCol; col < newEndCol; col++) {
        renderStaticTileToContainer(tempContainer, mapData, col, row,
          (col - newStartCol) * TILE_SIZE, (row - newStartRow) * TILE_SIZE, TILE_SIZE)
      }
    }

    app.renderer.render({ container: tempContainer, target: staticCacheTexture })
    tempContainer.destroy({ children: true })

    // 更新缓存范围记录
    cacheStartCol = newStartCol
    cacheEndCol = newEndCol
    cacheStartRow = newStartRow
    cacheEndRow = newEndRow
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
    cacheSprite.position.set(cacheStartCol * TILE_SIZE, cacheStartRow * TILE_SIZE)
  }
}

// ===== 选中资源高亮 =====
let selectedResourceGraphics = null

function renderSelectedResource(state, vp) {
  const { entityLayer } = getLayers()
  const sr = state.selectedResource

  if (!sr) {
    if (selectedResourceGraphics) {
      selectedResourceGraphics.visible = false
    }
    return
  }

  if (!selectedResourceGraphics) {
    selectedResourceGraphics = new Graphics()
    selectedResourceGraphics.label = 'selectedResource'
    entityLayer.addChild(selectedResourceGraphics)
  }

  selectedResourceGraphics.clear()
  selectedResourceGraphics.visible = true

  const px = sr.tileX * TILE_SIZE
  const py = sr.tileY * TILE_SIZE

  // 选中框 - 金色闪烁边框
  const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 300)
  selectedResourceGraphics.rect(px, py, TILE_SIZE, TILE_SIZE)
  selectedResourceGraphics.stroke({ color: 0xffd700, alpha: pulse, width: 2 })
}

// ===== 黑雾层 =====
let fogGraphics = null
let lastFogVersion = -1

// ===== 迷雾模式圆点层 =====
let fogDotGraphics = null
let lastDotVersion = -1

function renderFogLayer(vp) {
  const mode = getFogMode()

  if (mode === FOG_MODE.FULL_VISIBLE) {
    // 全明模式：无迷雾覆盖，只绘制缩略圆点
    if (fogGraphics) {
      fogGraphics.clear()
      fogGraphics.visible = false
    }
    renderFogDots(vp, mode)
    return
  }

  // 半明/黑雾模式
  const { fogExplored, fogVisible, version } = getFogData()
  if (!fogExplored || !fogVisible) return

  const { fogLayer } = getLayers()

  // 确保 Graphics 对象存在
  if (!fogGraphics) {
    fogGraphics = new Graphics()
    fogGraphics.label = 'fog'
    fogLayer.addChild(fogGraphics)
  }

  // 脏检查：version 没变且视口没变则跳过重绘
  if (version === lastFogVersion) {
    // 仍然需要绘制圆点
    renderFogDots(vp, mode)
    return
  }
  lastFogVersion = version

  fogGraphics.clear()
  fogGraphics.visible = true

  const startCol = Math.max(0, Math.floor(vp.x / TILE_SIZE))
  const endCol = Math.min(COLS, Math.ceil((vp.x + window.innerWidth) / TILE_SIZE))
  const startRow = Math.max(0, Math.floor(vp.y / TILE_SIZE))
  const endRow = Math.min(ROWS, Math.ceil((vp.y + window.innerHeight) / TILE_SIZE))

  const fogAlpha = FOG_CONFIG.fogAlpha
  const exploredAlpha = FOG_CONFIG.exploredAlpha

  if (mode === FOG_MODE.BLACK_FOG) {
    // 黑雾模式：分两批绘制
    // 第一批：已探索但不在视野内（灰雾 - 较浅，显示地形轮廓）
    fogGraphics.beginPath()
    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const idx = row * COLS + col
        if (fogVisible[idx]) continue       // 当前可见 - 不画
        if (!fogExplored[idx]) continue     // 未探索 - 留到第二批
        const px = col * TILE_SIZE
        const py = row * TILE_SIZE
        fogGraphics.rect(px, py, TILE_SIZE, TILE_SIZE)
      }
    }
    fogGraphics.fill({ color: 0x000000, alpha: exploredAlpha })

    // 第二批：未探索（黑雾 - 全黑）
    fogGraphics.beginPath()
    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const idx = row * COLS + col
        if (fogVisible[idx]) continue       // 当前可见 - 不画
        if (fogExplored[idx]) continue      // 已探索 - 已在第一批画了
        const px = col * TILE_SIZE
        const py = row * TILE_SIZE
        fogGraphics.rect(px, py, TILE_SIZE, TILE_SIZE)
      }
    }
    fogGraphics.fill({ color: 0x000000, alpha: fogAlpha })
  } else {
    // 半明模式：只有已探索/未探索的概念，没有全黑
    // 所有不在当前视野内的区域统一覆盖半透明灰雾
    fogGraphics.beginPath()
    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const idx = row * COLS + col
        if (fogVisible[idx]) continue       // 当前可见 - 不画
        const px = col * TILE_SIZE
        const py = row * TILE_SIZE
        fogGraphics.rect(px, py, TILE_SIZE, TILE_SIZE)
      }
    }
    fogGraphics.fill({ color: 0x000000, alpha: exploredAlpha })
  }

  // 绘制敌方记忆缩略圆点
  renderFogDots(vp, mode)
}

/**
 * 绘制敌方记忆缩略圆点
 * 全明模式：所有单位/建筑都显示圆点
 * 半明/黑雾模式：只显示不在当前视野内的记忆位置
 */
function renderFogDots(vp, mode) {
  const { fogLayer } = getLayers()
  const memVersion = getEnemyMemoryVersion()

  // 懒创建 Graphics
  if (!fogDotGraphics) {
    fogDotGraphics = new Graphics()
    fogDotGraphics.label = 'fogDots'
    fogDotGraphics.zIndex = 1000 // 确保在迷雾覆盖上方
    fogLayer.addChild(fogDotGraphics)
  }

  // 全明模式下不需要缓存版本检查，每帧都重绘（因为单位移动）
  // 半明/黑雾模式下，记忆位置不常变化，可以缓存
  if (mode !== FOG_MODE.FULL_VISIBLE && memVersion === lastDotVersion) return
  lastDotVersion = memVersion

  fogDotGraphics.clear()
  fogDotGraphics.visible = true

  const state = getState()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const m = TILE_SIZE * 4 // 扩展渲染范围

  if (mode === FOG_MODE.FULL_VISIBLE) {
    // 全明模式：所有单位显示为缩略圆点
    for (const entity of state.entities.values()) {
      if (entity.state === ENTITY_STATE.DEAD) continue
      const ex = entity.entityType === 'building'
        ? (entity.tileX + entity.size.w / 2) * TILE_SIZE
        : entity.x
      const ey = entity.entityType === 'building'
        ? (entity.tileY + entity.size.h / 2) * TILE_SIZE
        : entity.y

      // 视口裁剪
      if (ex < vp.x - m || ex > vp.x + vw + m || ey < vp.y - m || ey > vp.y + vh + m) continue

      const isBuilding = entity.entityType === 'building'
      const radius = isBuilding ? 6 : 3
      // 我方红色，敌方蓝色
      const dotColor = entity.team === TEAM.PLAYER ? 0xCC3333 : 0x5588E9

      fogDotGraphics.circle(ex, ey, radius)
      fogDotGraphics.fill({ color: dotColor, alpha: 0.8 })
    }
  } else {
    // 半明/黑雾模式：绘制记忆中的敌方缩略圆点
    const memory = getEnemyMemory()
    for (const mem of memory) {
      // 检查是否在当前视野内 - 视野内的实体由正常渲染系统绘制
      const tileX = Math.floor(mem.x / TILE_SIZE)
      const tileY = Math.floor(mem.y / TILE_SIZE)
      const vis = getTileVisibility(tileX, tileY)
      if (vis >= 2) continue // 在当前视野内，跳过（正常渲染会处理）

      // 视口裁剪
      if (mem.x < vp.x - m || mem.x > vp.x + vw + m || mem.y < vp.y - m || mem.y > vp.y + vh + m) continue

      const isBuilding = mem.entityType === 'building'
      const radius = isBuilding ? 5 : 2.5
      // 敌方记忆使用蓝色，稍暗淡
      const dotColor = 0x5588E9
      const alpha = vis === 1 ? 0.6 : 0.4 // 已探索区稍亮，未探索区更暗

      fogDotGraphics.circle(mem.x, mem.y, radius)
      fogDotGraphics.fill({ color: dotColor, alpha })
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
      const isTree = resourceKey === 'pine_tree' || resourceKey === 'round_tree'
      // 森林地形已有树底图，树资源渲染较小；草地树正常大小；其他资源保持原比例
      let resScale = 0.55
      if (isTree && terrain === TERRAIN.FOREST) resScale = 0.42
      else if (isTree && terrain === TERRAIN.GRASS) resScale = 0.55
      if (def.images && def.images.length > 0) {
        renderMultiResToContainer(container, def.images, px, py, size, isTree, terrain)
      } else if (def.image) {
        const img = getTexture(def.image)
        if (img !== Texture.EMPTY) {
          // 树木保持原始宽高比，避免宽度被拉伸
          if (isTree) {
            const maxH = size * resScale
            const origW = img.width, origH = img.height
            const scale = maxH / Math.max(origH, 1)
            const drawW = origW * scale
            const drawH = maxH
            const ox = (size - drawW) / 2
            const oy = size - drawH // 底部对齐
            const sprite = new Sprite(img)
            sprite.position.set(px + ox, py + oy)
            sprite.width = drawW
            sprite.height = drawH
            container.addChild(sprite)
          } else {
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
}

function renderMultiResToContainer(container, paths, px, py, size, isTree, terrain) {
  // 树资源在森林地形已有树底图，整体区域稍缩小；草地地形正常大小
  const baseScale = isTree && terrain === TERRAIN.FOREST ? 0.75
    : isTree && terrain === TERRAIN.GRASS ? 1.0
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

    // 迷雾模式下：非玩家实体必须在可见区域内才渲染
    // 全明模式下：正常渲染（敌方缩略圆点由迷雾层处理）
    if (isFogEnabled() && e.team !== TEAM.PLAYER) {
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
  // 单位在同 y 坐标时始终排在建筑上方，避免血条被建筑精灵覆盖
  data.container.zIndex = item.y + (entity.entityType === 'unit' ? 100000 : 0)
}

function createEntitySprite(entity) {
  const container = new Container()
  container.sortableChildren = true

  if (entity.entityType === 'building') {
    return { container, type: 'building', sprites: [], hpBar: null, buildBar: null }
  } else {
    return { container, type: 'unit', sprite: null, hpBar: null }
  }
}

function updateBuildingSprite(data, b, isSelected) {
  const w = b.size.w * TILE_SIZE, h = b.size.h * TILE_SIZE
  const colorKey = TEAM_COLOR_MAP[b.team] || 'red'

  // 确保精灵存在
  if (data.sprites.length === 0) {
    if (b.images && b.images.length >= 2) {
      const topSprite = new Sprite(getTextureForTeam(b.images[0], colorKey))
      const botSprite = new Sprite(getTextureForTeam(b.images[1], colorKey))
      topSprite.label = 'top'
      botSprite.label = 'bottom'
      data.container.addChild(topSprite)
      data.container.addChild(botSprite)
      data.sprites.push(topSprite, botSprite)
    } else if (b.image) {
      const sprite = new Sprite(getTextureForTeam(b.image, colorKey))
      sprite.label = 'main'
      data.container.addChild(sprite)
      data.sprites.push(sprite)
    }
  }

  // 更新双图建筑布局
  if (b.images && b.images.length >= 2 && data.sprites.length >= 2) {
    // 城镇中心：双图各占半格高度，整体占满宽度
    const isTownCenter = b.type === 'town_center'
    const imgW = isTownCenter ? w : TILE_SIZE
    const imgH = isTownCenter ? h / 2 : TILE_SIZE
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

  // 建造中的建筑：合并显示建造进度+血量（单条）
  // 已完成的建筑：仅显示血条
  if (!b.isBuilt) {
    // 合并条：底色为建造进度(橙色)，叠加当前HP比例(绿色)
    // 如果满血则只显示建造进度，受伤时HP部分变绿(或红)提示
    if (!data.buildBar) {
      const g = new Graphics()
      g.label = 'buildBar'
      g.zIndex = 999  // 确保在建筑精灵上方
      data.container.addChild(g)
      data.buildBar = g
    }
    const bw = Math.min(w * 0.8, 36), bh = 4
    const bxx = w / 2 - bw / 2, byy = -10
    const progressRatio = Math.max(0, Math.min(1, b.buildProgress / 100))
    const hpRatio = Math.max(0, Math.min(1, b.hp / b.maxHp))
    const hpColor = hpRatio > 0.6 ? 0x4caf50 : hpRatio > 0.3 ? 0xff9800 : 0xf44336
    data.buildBar.clear()
    // 黑色背景
    data.buildBar.rect(bxx - 1, byy - 1, bw + 2, bh + 2).fill({ color: 0x000000, alpha: 0.6 })
    // 建造进度（橙色底）
    data.buildBar.rect(bxx, byy, bw * progressRatio, bh).fill({ color: 0xff9800 })
    // HP叠加（绿色/橙色/红色），宽度不超过建造进度
    if (hpRatio < 1) {
      const hpWidth = bw * progressRatio * hpRatio
      data.buildBar.rect(bxx, byy, hpWidth, bh).fill({ color: hpColor })
    }
    data.buildBar.visible = true
    // 建造中不单独显示HP条
    if (data.hpBar) data.hpBar.visible = false
  } else {
    // 已完成建筑：隐藏建造条，按需显示HP条
    if (data.buildBar) data.buildBar.visible = false
    if (b.hp < b.maxHp || isSelected) {
      drawEntityHpBar(data, w / 2, 0, b.hp, b.maxHp, w)
    } else if (data.hpBar) {
      data.hpBar.visible = false
    }
  }
}

function updateUnitSprite(data, u, isSelected, vp) {
  // 从配置表获取单位显示尺寸，未配置则使用默认值
  const size = UNIT_DISPLAY_SIZE[u.type] || { w: 0.8, h: 0.8 }
  const uw = TILE_SIZE * size.w
  const uh = TILE_SIZE * size.h

  // 主精灵
  if (!data.sprite) {
    const colorKey = u.team != null ? TEAM_COLOR_MAP[u.team] : null
    const tex = getTextureForTeam(u.image, colorKey)
    const sprite = new Sprite(tex)
    sprite.width = uw
    sprite.height = uh
    // 在容器内居中显示
    sprite.x = (TILE_SIZE * 0.8 - uw) / 2
    sprite.y = (TILE_SIZE * 0.8 - uh) / 2
    data.container.addChild(sprite)
    data.sprite = sprite
  }

  // 战船：根据移动方向旋转精灵（SVG纹理是竖直的）
  if (u.type === 'warship' && data.sprite) {
    // animDir: 0=上 1=右 2=下 3=左
    const dirRotations = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
    data.sprite.rotation = dirRotations[u.animDir] || 0
    // 旋转后重新居中
    data.sprite.x = (TILE_SIZE * 0.8) / 2
    data.sprite.y = (TILE_SIZE * 0.8) / 2
    data.sprite.anchor.set(0.5, 0.5)
  } else if (data.sprite && data.sprite.anchor.x !== 0) {
    // 非战船确保 anchor 是默认值
    data.sprite.anchor.set(0, 0)
  }

  // HP 条 - 以精灵在容器内的实际位置为基准
  // 选中时或非满血时显示血条，避免频繁显隐导致闪烁
  const spriteOffsetX = data.sprite.x
  const spriteOffsetY = data.sprite.y
  const showHpBar = isSelected || u.hp < u.maxHp
  if (showHpBar) {
    drawEntityHpBar(data, spriteOffsetX + uw / 2, spriteOffsetY, u.hp, u.maxHp, uw)
  } else if (data.hpBar) {
    data.hpBar.visible = false
  }
}

function drawEntityHpBar(data, cx, topY, hp, maxHp, width) {
  if (!data.hpBar) {
    const g = new Graphics()
    g.label = 'hpBar'
    g.zIndex = 999  // 确保血条在容器内接近最上层
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

// ===== 建造预览 =====
let buildPreviewContainer = null
let bpOutline = null
let bpSprites = []

function renderBuildPreview() {
  const bm = getBuildMode()
  const { entityLayer } = getLayers()

  if (!bm) {
    if (buildPreviewContainer) {
      buildPreviewContainer.visible = false
    }
    return
  }

  const def = BUILDING_DEFS[bm.buildingType]
  if (!def) return

  // 确保 Container 和轮廓 Graphics 存在
  if (!buildPreviewContainer) {
    buildPreviewContainer = new Container()
    buildPreviewContainer.label = 'buildPreview'
    entityLayer.addChild(buildPreviewContainer)

    bpOutline = new Graphics()
    bpOutline.label = 'outline'
    buildPreviewContainer.addChild(bpOutline)
  }

  // 根据建筑定义创建/更新建筑精灵
  const images = def.images
  const needRebuild = bpSprites.length === 0 || bpSprites[0]._bType !== bm.buildingType
  if (needRebuild) {
    // 清理旧精灵
    for (const s of bpSprites) s.destroy({ children: true, texture: false })
    bpSprites = []

    if (images && images.length >= 2) {
      const topSprite = new Sprite(getTexture(images[0]))
      topSprite.label = 'bpTop'
      topSprite._bType = bm.buildingType
      topSprite.alpha = 0.5
      buildPreviewContainer.addChild(topSprite)
      bpSprites.push(topSprite)

      const botSprite = new Sprite(getTexture(images[1]))
      botSprite.label = 'bpBot'
      botSprite._bType = bm.buildingType
      botSprite.alpha = 0.5
      buildPreviewContainer.addChild(botSprite)
      bpSprites.push(botSprite)
    } else if (def.image) {
      const sprite = new Sprite(getTexture(def.image))
      sprite.label = 'bpMain'
      sprite._bType = bm.buildingType
      sprite.alpha = 0.5
      buildPreviewContainer.addChild(sprite)
      bpSprites.push(sprite)
    }
  }

  buildPreviewContainer.visible = true

  const col = bm.previewCol
  const row = bm.previewRow
  const isValid = bm.isValid
  const bw = def.size.w * TILE_SIZE
  const bh = def.size.h * TILE_SIZE
  const px = col * TILE_SIZE
  const py = row * TILE_SIZE

  // 更新轮廓
  bpOutline.clear()
  if (isValid) {
    bpOutline.rect(px, py, bw, bh)
    bpOutline.fill({ color: 0x00ff00, alpha: 0.2 })
    bpOutline.rect(px, py, bw, bh)
    bpOutline.stroke({ color: 0x00ff00, alpha: 0.8, width: 2 })
  } else {
    bpOutline.rect(px, py, bw, bh)
    bpOutline.fill({ color: 0xff0000, alpha: 0.2 })
    bpOutline.rect(px, py, bw, bh)
    bpOutline.stroke({ color: 0xff0000, alpha: 0.8, width: 2 })
  }

  // 更新建筑精灵位置
  if (images && images.length >= 2 && bpSprites.length >= 2) {
    const imgW = TILE_SIZE, imgH = TILE_SIZE
    const ox = (bw - imgW) / 2
    bpSprites[0].position.set(px + ox, py)
    bpSprites[0].width = imgW
    bpSprites[0].height = imgH
    bpSprites[1].position.set(px + ox, py + imgH)
    bpSprites[1].width = imgW
    bpSprites[1].height = imgH
  } else if (bpSprites.length === 1) {
    bpSprites[0].position.set(px, py)
    bpSprites[0].width = bw
    bpSprites[0].height = bh
  }

  // 设置深度排序
  buildPreviewContainer.zIndex = py + bh
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
  cacheStartCol = 0
  cacheEndCol = 0
  cacheStartRow = 0
  cacheEndRow = 0
  const { tileLayer } = getLayers()
  tileLayer.removeChildren()

  // 重置迷雾圆点 Graphics
  fogDotGraphics = null
  lastDotVersion = -1
  fogGraphics = null
  lastFogVersion = -1
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

  // 重置迷雾圆点 Graphics
  fogDotGraphics = null
  lastDotVersion = -1

  // 重置黑雾 Graphics
  fogGraphics = null
  lastFogVersion = -1

  // 重置选中资源高亮
  selectedResourceGraphics = null

  // 重置建造预览
  buildPreviewContainer = null
  bpOutline = null
  bpSprites = []
}
