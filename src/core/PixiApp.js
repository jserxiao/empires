/**
 * PixiApp - PixiJS 应用初始化与资源加载
 *
 * 职责：
 * 1. 创建并管理 PixiJS Application 实例
 * 2. 从 SVG spritesheet 加载所有游戏纹理
 * 3. 暴露 Application / Container / Texture 供其他模块使用
 */

import { Application, Container, Texture } from 'pixi.js'
import { loadTexturesFromSVG, PLAYER_COLORS } from './SvgTextures.js'
let app = null
let initialized = false
let textures = {}

// 层容器引用（由 GameRenderer 使用）
let worldContainer = null // 世界根容器，跟随视口移动
let tileLayer = null      // 地形/道路/资源静态层
let fogLayer = null       // 黑雾覆盖层
let entityLayer = null    // 建筑/单位动态层
let effectLayer = null    // 弹道/特效层
let uiLayer = null        // 选框/UI层（屏幕坐标）

/**
 * 检查 PixiJS 是否已初始化并可用
 */
export function isPixiReady() {
  return app !== null && initialized
}

/**
 * 初始化 PixiJS Application
 * @param {HTMLElement} container - 挂载容器 DOM 元素
 * @returns {Promise<Application>}
 */
export async function initPixiApp(container) {
  if (app) {
    destroyPixiApp()
  }

  app = new Application()
  initialized = false

  await app.init({
    resizeTo: container,
    antialias: false,
    resolution: 1,
    autoDensity: true,
  })

  initialized = true
  app.ticker.stop()
  container.appendChild(app.canvas)

  // 创建层结构
  worldContainer = new Container({ label: 'world' })
  tileLayer = new Container({ label: 'tiles' })
  fogLayer = new Container({ label: 'fog' })
  entityLayer = new Container({ label: 'entities' })
  entityLayer.sortableChildren = true
  effectLayer = new Container({ label: 'effects' })
  uiLayer = new Container({ label: 'ui' })

  worldContainer.addChild(tileLayer)
  worldContainer.addChild(fogLayer)
  worldContainer.addChild(entityLayer)
  worldContainer.addChild(effectLayer)
  app.stage.addChild(worldContainer)
  app.stage.addChild(uiLayer)

  return app
}

/**
 * 加载所有游戏纹理（从 SVG spritesheet 提取）
 * 同时加载红色（玩家）和蓝色（AI）两套配色纹理
 * @param {function} onProgress - 进度回调 (0~1)
 */
export async function loadTextures(onProgress) {
  // 从 SVG 加载纹理（返回 { svgName: Texture, 'blue:svgName': Texture } 映射）
  const colorKeys = Object.keys(PLAYER_COLORS)
  const svgTextures = await loadTexturesFromSVG(onProgress, colorKeys)

  // 将 SVG 纹理名 → Texture 的映射直接注册
  for (const [svgName, tex] of Object.entries(svgTextures)) {
    textures[svgName] = tex
  }
}

/**
 * 获取纹理
 * @param {string} key - 图片路径或 SVG 资源名
 * @returns {Texture}
 */
export function getTexture(key) {
  return textures[key] || Texture.EMPTY
}

/**
 * 根据队伍获取对应配色的纹理
 * @param {string} key - SVG 资源名
 * @param {string} colorKey - 玩家配色键名（'red', 'blue' 等）
 * @returns {Texture}
 */
export function getTextureForTeam(key, colorKey) {
  if (!colorKey || colorKey === 'red') {
    // 默认配色，直接用原始key
    return textures[key] || Texture.EMPTY
  }
  // 查找带颜色前缀的纹理（如 'blue:城镇中心上'）
  const teamTex = textures[`${colorKey}:${key}`]
  if (teamTex) return teamTex
  // 回退到原始key
  return textures[key] || Texture.EMPTY
}

/**
 * 获取所有纹理映射
 */
export function getTextures() {
  return textures
}

/**
 * 获取 PixiJS Application 实例
 */
export function getPixiApp() {
  return app
}

/**
 * 获取层容器
 */
export function getLayers() {
  return { worldContainer, tileLayer, fogLayer, entityLayer, effectLayer, uiLayer }
}

/**
 * 手动渲染一帧
 */
export function renderFrame() {
  if (app && initialized) app.render()
}

/**
 * 销毁 PixiJS Application
 */
export function destroyPixiApp() {
  if (!app) return

  if (initialized) {
    try {
      app.destroy(true, { children: true, texture: true })
    } catch (e) {
      console.warn('PixiJS destroy error:', e)
    }
  } else {
    try {
      const canvas = app.canvas
      if (canvas && canvas.parentNode) {
        canvas.parentNode.removeChild(canvas)
      }
    } catch (e) {
      // 忽略
    }
  }

  app = null
  initialized = false
  textures = {}
  worldContainer = null
  tileLayer = null
  fogLayer = null
  entityLayer = null
  effectLayer = null
  uiLayer = null
}
