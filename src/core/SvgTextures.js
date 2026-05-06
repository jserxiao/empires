/**
 * SVG 纹理提取器
 *
 * 将 medievalRTS_vector.svg 和 scifiRTS_vector.svg 中的各图层提取为 PixiJS Texture。
 * 策略：将 SVG 渲染到离屏 Canvas，然后按图层的边界框裁切出各个纹理。
 */

import { Texture } from 'pixi.js'

// SVG 文件配置
const SVG_SOURCES = [
  {
    path: '/Vector/medievalRTS_vector.svg',
    width: 1800,
    height: 700,
  },
  {
    path: '/Vector/scifiRTS_vector.svg',
    width: 1800,
    height: 700,
  },
]

// 渲染倍率（提高清晰度）
const RENDER_SCALE = 2

// =========================================================================
// 玩家颜色配置系统
// =========================================================================

/**
 * SVG 中需要替换的源颜色分类
 * 每个颜色组包含 SVG 原始图片中的颜色，需要根据玩家配色替换为目标颜色
 */
const SOURCE_COLORS = {
  // 绿色系 — 用于屋顶、植被装饰区域
  green: [
    '#115F32', '#167E42', '#178044', '#188546', '#198748',
    '#198A49', '#1B914D', '#1B9850', '#1C9F55', '#20B45F',
    '#219853', '#24A159', '#27AE60', '#29B865', '#689545',
    '#75A84E', '#7EB454', '#8BC65D', '#93D7B0',
  ],
  // 橙棕色系 — 用于城墙、建筑装饰区域
  orange: [
    '#E97D55', '#D2704C', '#A6583C', '#BB8044',
    '#E27952', '#8A4931', '#AD763E', '#CB8B4A',
  ],
}

/**
 * 玩家配色方案
 * 每个玩家的颜色必须与 SOURCE_COLORS 中对应分类的数组长度一致，一一对应
 * 新增玩家只需在此添加一个配色方案即可
 */
export const PLAYER_COLORS = {
  red: {
    name: '红色',
    green: [
      '#5F1611', '#7E1D16', '#801E17', '#851F18', '#872019',
      '#8A2019', '#91221B', '#98231B', '#9F251C', '#B42920',
      '#982821', '#A12C24', '#AE3027', '#B83229', '#95454A',
      '#A84E54', '#B4545A', '#C65D64', '#D79793',
    ],
    orange: [
      '#E95D55', '#D2534C', '#A6423C', '#BB5044',
      '#E25A52', '#8A3631', '#AD493E', '#CB574A',
    ],
  },
  blue: {
    name: '蓝色',
    green: [
      '#11265F', '#16327E', '#173380', '#183585', '#193787',
      '#19378A', '#1B3B91', '#1B3D98', '#1C3F9F', '#2048B4',
      '#214198', '#2446A1', '#274BAE', '#2950B8', '#456595',
      '#4E72A8', '#547AB4', '#5D87C6', '#93A5D7',
    ],
    orange: [
      '#5588E9', '#4C7AD2', '#3C60A6', '#4469BB',
      '#5283E2', '#31508A', '#3E60AD', '#4A72CB',
    ],
  },
}

/**
 * 颜色组定义：哪些源颜色分类需要被替换
 * 'building' = green + orange (建筑全部替换)
 */
const COLOR_GROUPS = {
  building: ['green', 'orange'],   // 全部替换（城镇中心、军营、城墙等）
  roof_only: ['green'],            // 仅替换屋顶绿色（民房等小型建筑）
}

/**
 * 根据颜色组名和玩家配色，生成 { '#源色': '#目标色' } 映射表
 * @param {string} colorGroup - 颜色组名，如 'building'
 * @param {object} playerColor - 玩家配色方案，如 PLAYER_COLORS.red
 * @returns {object} 颜色替换映射
 */
function buildColorReplaceMap(colorGroup, playerColor) {
  const categories = COLOR_GROUPS[colorGroup]
  if (!categories) return null
  const map = {}
  for (const cat of categories) {
    const sources = SOURCE_COLORS[cat]
    const targets = playerColor[cat]
    if (!sources || !targets) continue
    const len = Math.min(sources.length, targets.length)
    for (let i = 0; i < len; i++) {
      map[sources[i]] = targets[i]
    }
  }
  return Object.keys(map).length > 0 ? map : null
}

/**
 * SVG 图层定义
 * 每个图层包含其在 SVG 坐标系中的边界框 (x, y, w, h)
 *
 * 基于用户提供的网格映射（第几行第几列 → 精确坐标）
 * 通过 _build_map.cjs 自动生成
 */

// 游戏资源映射表：资源名 → { source, bbox }
// source: 0=medievalRTS_vector.svg, 1=scifiRTS_vector.svg
// bbox: [x, y, w, h] 为 SVG 坐标系中的边界框
const SVG_SPRITE_DEFS = {
  // ===== 地形瓦片 (Tile) ===== - medievalRTS_vector.svg (source: 0)
  '深水':          { source: 0, bbox: [32,  224, 64, 64] },  // Layer0_55  第3行第1列
  '浅水':          { source: 0, bbox: [320, 224, 64, 64] },  // Layer0_53  第3行第4列
  '土地':          { source: 0, bbox: [32,  128, 64, 64] },  // Layer0_7   第2行第1列
  '空地':          { source: 0, bbox: [224, 32,  64, 64] },  // Layer0_11  第1行第3列
  '草地':          { source: 0, bbox: [32,  32,  64, 64] },  // Layer0_9   第1行第1列
  '三棵树草地':     { source: 0, bbox: [224, 416, 64, 64] },  // Layer0_0   第5行第3列
  'tile_58':       { source: 0, bbox: [128, 32,  64, 64] },  // Layer0_10  第1行第2列

  // ===== 道路瓦片 ===== - medievalRTS_vector.svg (source: 0)
  '左右单路':      { source: 0, bbox: [512, 32,  64, 64] },  // Layer0_38  第1行第6列
  '上下单路':      { source: 0, bbox: [416, 32,  64, 64] },  // Layer0_24  第1行第5列
  '十字路':        { source: 0, bbox: [608, 32,  64, 64] },  // Layer0_25  第1行第7列
  '无上丁字路':    { source: 0, bbox: [704, 32,  64, 64] },  // Layer0_26  第1行第8列
  '无下丁字路':    { source: 0, bbox: [800, 32,  64, 64] },  // Layer0_27  第1行第9列
  '无左丁字路':    { source: 0, bbox: [800, 128, 64, 64] },  // Layer0_29  第2行第9列
  '无右丁字路':    { source: 0, bbox: [704, 128, 64, 64] },  // Layer0_28  第2行第8列
  '左上角弯路':    { source: 0, bbox: [416, 128, 64, 64] },  // Layer0_30  第2行第5列
  '右上角弯路':    { source: 0, bbox: [512, 128, 64, 64] },  // Layer0_31  第2行第6列
  '左下角弯路':    { source: 0, bbox: [416, 224, 64, 64] },  // Layer0_32  第3行第5列
  '右下角弯路':    { source: 0, bbox: [512, 224, 64, 64] },  // Layer0_33  第3行第6列

  // ===== 环境/资源 ===== - medievalRTS_vector.svg (source: 0)
  'pine_tree':     { source: 0, bbox: [722, 328, 27,  48] }, // Layer0_45  第4行第8列
  'round_tree':    { source: 0, bbox: [535, 330, 19,  46] }, // Layer0_44  第4行第6列
  'gold_mine':     { source: 0, bbox: [813, 528, 38,  35] }, // Layer0_82  第7行第9列
  'big_gold_mine': { source: 0, bbox: [909, 528, 38,  35] }, // Layer0_83  第7行第10列
  'stone_1':       { source: 0, bbox: [528, 434, 32,  28] }, // Layer0_73  第6行第6列
  'stone_2':       { source: 0, bbox: [621, 432, 38,  32] }, // Layer0_75  第6行第7列
  'stone_3':       { source: 0, bbox: [717, 431, 38,  35] }, // Layer0_76  第6行第8列
  'dirt_1':        { source: 0, bbox: [528, 531, 32,  28] }, // Layer0_78  第7行第6列
  'dirt_2':        { source: 0, bbox: [621, 529, 38,  32] }, // Layer0_79  第7行第7列
  'dirt_3':        { source: 0, bbox: [717, 528, 38,  35] }, // Layer0_80  第7行第8列

  // ===== 建筑 ===== - medievalRTS_vector.svg (source: 0)
  '城镇中心上':     { source: 0, bbox: [1570, 58,  60, 38], colorGroup: 'building' }, // Layer0_121 第1行第17列
  '城镇中心下':     { source: 0, bbox: [1570, 128, 60, 38], colorGroup: 'building' }, // Layer0_120 第2行第17列

  // ===== 单位 ===== - medievalRTS_vector.svg (source: 0)
  '男农夫':         { source: 0, bbox: [1112, 436, 16, 24] }, // Layer0_95  row6 col13
  '女农夫':         { source: 0, bbox: [1208, 436, 16, 24] }, // Layer0_96  row6 col14

  // ===== 新建筑 ===== - medievalRTS_vector.svg (source: 0)
  'civilian_house': { source: 0, bbox: [522, 610, 44, 60], colorGroup: 'roof_only' },  // Layer0_16  row7 col6
  'halberdier':     { source: 0, bbox: [1302, 434, 20, 26] }, // Layer0_98  row6 col15
  'iron_guard':     { source: 0, bbox: [1399, 435, 18, 25] }, // Layer0_93  row6 col16

  // ===== 新建筑 ===== - scifiRTS_vector.svg (source: 1)
  'city_wall':      { source: 1, bbox: [236, 614, 40, 52], colorGroup: 'building' },  // Layer0_144 row7 col3
  'military_camp':  { source: 1, bbox: [1376, 229, 64, 54], colorGroup: 'building' }, // Layer0_55  row3 col15

  // ===== 回退映射（用户未提供，复用已有资源）=====
  'berry':         { source: 0, bbox: [1014, 531, 20, 24] }, // Layer0_97  row7 col11 - 浆果丛
  'house':         { source: 0, bbox: [522, 610, 44, 60], colorGroup: 'roof_only' },  // 复用 civilian_house
  'farm':          { source: 0, bbox: [1570, 128, 60, 38], colorGroup: 'building' }, // 复用 城镇中心下
  'lumber_camp':   { source: 0, bbox: [1570, 58,  60, 38], colorGroup: 'building' }, // 复用 城镇中心上
  'mining_camp':   { source: 0, bbox: [1570, 128, 60, 38], colorGroup: 'building' }, // 复用 城镇中心下
  'barracks':      { source: 0, bbox: [1570, 58,  60, 38], colorGroup: 'building' }, // 复用 城镇中心上
  'archery':       { source: 0, bbox: [1570, 128, 60, 38], colorGroup: 'building' }, // 复用 城镇中心下
  'stable':        { source: 0, bbox: [1570, 58,  60, 38], colorGroup: 'building' }, // 复用 城镇中心上
  'tower':         { source: 0, bbox: [1570, 128, 60, 38], colorGroup: 'building' }, // 复用 城镇中心下
  'swordsman':     { source: 0, bbox: [1208, 436, 16, 24] }, // 复用 男农夫
  'archer':        { source: 0, bbox: [1112, 436, 16, 24] }, // 复用 女农夫
  'knight':        { source: 0, bbox: [1208, 436, 16, 24] }, // 复用 男农夫
}

// 兼容旧格式：SVG_SPRITE_MAP 导出为简单的 [x, y, w, h] 格式（仅 medieval 源）
export const SVG_SPRITE_MAP = {}
for (const [name, def] of Object.entries(SVG_SPRITE_DEFS)) {
  SVG_SPRITE_MAP[name] = def.bbox
}

// 旧PNG路径 → 新SVG资源名的映射
export const PNG_TO_SVG_MAP = {
  // 地形
  '/PNG/Default size/Tile/深水.png':        '深水',
  '/PNG/Default size/Tile/浅水.png':        '浅水',
  '/PNG/Default size/Tile/土地.png':        '土地',
  '/PNG/Default size/Tile/空地.png':        '空地',
  '/PNG/Default size/Tile/草地.png':        '草地',
  '/PNG/Default size/Tile/三棵树草地.png':   '三棵树草地',
  '/PNG/Default size/Tile/medievalTile_58.png': 'tile_58',

  // 道路
  '/PNG/Default size/Tile/左右单路.png':     '左右单路',
  '/PNG/Default size/Tile/上下单路.png':     '上下单路',
  '/PNG/Default size/Tile/十字路.png':       '十字路',
  '/PNG/Default size/Tile/无上丁字路.png':   '无上丁字路',
  '/PNG/Default size/Tile/无下丁字路.png':   '无下丁字路',
  '/PNG/Default size/Tile/无左丁字路.png':   '无左丁字路',
  '/PNG/Default size/Tile/无右丁字路.png':   '无右丁字路',
  '/PNG/Default size/Tile/左上角弯路.png':   '左上角弯路',
  '/PNG/Default size/Tile/右上角弯路.png':   '右上角弯路',
  '/PNG/Default size/Tile/左下角弯路.png':   '左下角弯路',
  '/PNG/Default size/Tile/右下角弯路.png':   '右下角弯路',

  // 环境/资源
  '/PNG/Default size/Environment/尖木树.png':    'pine_tree',
  '/PNG/Default size/Environment/圆木树.png':    'round_tree',
  '/PNG/Default size/Environment/金矿.png':      'gold_mine',
  '/PNG/Default size/Environment/大金矿.png':    'big_gold_mine',
  '/PNG/Default size/Environment/一个石块.png':  'stone_1',
  '/PNG/Default size/Environment/两个石块.png':  'stone_2',
  '/PNG/Default size/Environment/三个石块.png':  'stone_3',
  '/PNG/Default size/Environment/土块.png':      'dirt_1',
  '/PNG/Default size/Environment/两个土块.png':  'dirt_2',
  '/PNG/Default size/Environment/三个土块.png':  'dirt_3',

  // 建筑
  '/PNG/Default size/Structure/城镇中心上.png':   '城镇中心上',
  '/PNG/Default size/Structure/城镇中心下.png':   '城镇中心下',
  '/PNG/Default size/Structure/medievalStructure_03.png': 'house',
  '/PNG/Default size/Structure/medievalStructure_04.png': 'farm',
  '/PNG/Default size/Structure/medievalStructure_05.png': 'lumber_camp',
  '/PNG/Default size/Structure/medievalStructure_08.png': 'mining_camp',
  '/PNG/Default size/Structure/medievalStructure_09.png': 'barracks',
  '/PNG/Default size/Structure/medievalStructure_10.png': 'archery',
  '/PNG/Default size/Structure/medievalStructure_11.png': 'stable',
  '/PNG/Default size/Structure/medievalStructure_13.png': 'tower',
  '/PNG/Default size/Structure/civilian_house.png': 'civilian_house',
  '/PNG/Default size/Structure/city_wall.png': 'city_wall',
  '/PNG/Default size/Structure/military_camp.png': 'military_camp',

  // 单位
  '/PNG/Default size/Unit/男农夫.png':           '男农夫',
  '/PNG/Default size/Unit/女农夫.png':           '女农夫',
  '/PNG/Default size/Unit/medievalUnit_01.png':  'swordsman',
  '/PNG/Default size/Unit/medievalUnit_03.png':  'archer',
  '/PNG/Default size/Unit/medievalUnit_07.png':  'knight',
  '/PNG/Default size/Unit/halberdier.png':       'halberdier',
  '/PNG/Default size/Unit/iron_guard.png':       'iron_guard',

  // 环境回退
  '/PNG/Default size/Environment/浆果.png':      'berry',
}

/**
 * 加载单个 SVG 并渲染到离屏 Canvas
 * @param {object} svgSource - SVG 源配置 { path, width, height }
 * @returns {Promise<HTMLCanvasElement>}
 */
async function loadSVGToCanvas(svgSource) {
  const response = await fetch(svgSource.path)
  const svgText = await response.text()

  const blob = new Blob([svgText], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)

  const img = new Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = url
  })

  const canvas = document.createElement('canvas')
  canvas.width = svgSource.width * RENDER_SCALE
  canvas.height = svgSource.height * RENDER_SCALE
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(url)

  return canvas
}

/**
 * 将 CSS 颜色字符串解析为 [r, g, b]
 */
function parseHexColor(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)]
}

/**
 * 从 SVG Canvas 裁切纹理
 * @param {HTMLCanvasElement} canvas - 渲染好的 SVG Canvas
 * @param {number} x - 裁切区域 x
 * @param {number} y - 裁切区域 y
 * @param {number} w - 裁切区域宽
 * @param {number} h - 裁切区域高
 * @param {Object} [colorReplace] - 颜色替换映射 { '#旧色': '#新色' }
 * @returns {Texture}
 */
function cropTexture(canvas, x, y, w, h, colorReplace) {
  const cropCanvas = document.createElement('canvas')
  cropCanvas.width = w * RENDER_SCALE
  cropCanvas.height = h * RENDER_SCALE
  const cropCtx = cropCanvas.getContext('2d')
  cropCtx.drawImage(
    canvas,
    x * RENDER_SCALE, y * RENDER_SCALE, w * RENDER_SCALE, h * RENDER_SCALE,
    0, 0, cropCanvas.width, cropCanvas.height
  )

  // 像素级颜色替换
  if (colorReplace) {
    const replaceMap = []
    for (const [fromHex, toHex] of Object.entries(colorReplace)) {
      replaceMap.push({ from: parseHexColor(fromHex), to: parseHexColor(toHex) })
    }
    const imageData = cropCtx.getImageData(0, 0, cropCanvas.width, cropCanvas.height)
    const data = imageData.data
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      for (const { from, to } of replaceMap) {
        if (Math.abs(r - from[0]) <= 10 && Math.abs(g - from[1]) <= 10 && Math.abs(b - from[2]) <= 10) {
          data[i] = to[0]
          data[i + 1] = to[1]
          data[i + 2] = to[2]
          break
        }
      }
    }
    cropCtx.putImageData(imageData, 0, 0)
  }

  try {
    return Texture.from(cropCanvas)
  } catch (e) {
    console.warn(`Failed to create texture from crop`, e)
    return Texture.EMPTY
  }
}

/**
 * 从 SVG 加载所有纹理（支持多个 SVG 源）
 * 为每个玩家配色方案分别加载一套纹理，使用 colorKey 前缀区分
 * @param {function} onProgress - 进度回调 (0~1)
 * @param {string[]} [colorKeys] - 要加载的玩家配色键名列表，默认 ['red', 'blue']
 * @returns {Object} 纹理映射表 { svgName: Texture, 'blue:svgName': Texture }
 */
export async function loadTexturesFromSVG(onProgress, colorKeys = ['red', 'blue']) {
  // 1. 加载所有 SVG 到 Canvas（只加载一次，多个配色共用同一份 Canvas 源）
  const canvases = []
  for (let i = 0; i < SVG_SOURCES.length; i++) {
    canvases.push(await loadSVGToCanvas(SVG_SOURCES[i]))
  }

  // 2. 按边界框裁切各个纹理（为每个配色方案分别裁切）
  const textures = {}
  const entries = Object.entries(SVG_SPRITE_DEFS)
  const totalTasks = entries.length * colorKeys.length
  let loaded = 0

  for (const colorKey of colorKeys) {
    const playerColor = PLAYER_COLORS[colorKey]
    if (!playerColor) continue

    for (const [name, def] of entries) {
      const canvas = canvases[def.source]
      const [x, y, w, h] = def.bbox

      // 根据 colorGroup 动态生成颜色替换映射
      let colorReplace = null
      if (def.colorGroup) {
        colorReplace = buildColorReplaceMap(def.colorGroup, playerColor)
      }

      // 纹理key：第一个配色（默认）不加前缀，其他加 "colorKey:" 前缀
      const texKey = colorKey === colorKeys[0] ? name : `${colorKey}:${name}`

      try {
        textures[texKey] = cropTexture(canvas, x, y, w, h, colorReplace)
      } catch (e) {
        console.warn(`Failed to create texture: ${texKey}`, e)
        textures[texKey] = Texture.EMPTY
      }

      loaded++
      if (onProgress) onProgress(loaded / totalTasks)
    }
  }

  return textures
}
