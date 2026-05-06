/**
 * SVG 纹理提取器
 *
 * 将 medievalRTS_vector.svg 中的各图层提取为 PixiJS Texture。
 * 策略：将 SVG 渲染到离屏 Canvas，然后按图层的边界框裁切出各个纹理。
 */

import { Texture } from 'pixi.js'

// SVG 文件路径
const SVG_PATH = '/Vector/medievalRTS_vector.svg'

// SVG viewBox 尺寸
const SVG_WIDTH = 1800
const SVG_HEIGHT = 700

// 渲染倍率（提高清晰度）
const RENDER_SCALE = 2

/**
 * SVG 图层定义
 * 每个图层包含其在 SVG 坐标系中的边界框 (x, y, w, h)
 *
 * 基于用户提供的网格映射（第几行第几列 → 精确坐标）
 * 通过 _build_map.cjs 自动生成
 */

// 游戏资源映射表：资源名 → SVG 图层边界框
// 每个条目: [x, y, w, h] 为 SVG 坐标系中的边界框
export const SVG_SPRITE_MAP = {
  // ===== 地形瓦片 (Tile) =====
  '深水':          [32,  224, 64, 64],  // Layer0_55  第3行第1列
  '浅水':          [320, 224, 64, 64],  // Layer0_53  第3行第4列
  '土地':          [32,  128, 64, 64],  // Layer0_7   第2行第1列
  '空地':          [224, 32,  64, 64],  // Layer0_11  第1行第3列
  '草地':          [32,  32,  64, 64],  // Layer0_9   第1行第1列
  '三棵树草地':     [224, 416, 64, 64],  // Layer0_0   第5行第3列
  'tile_58':       [128, 32,  64, 64],  // Layer0_10  第1行第2列

  // ===== 道路瓦片 =====
  '左右单路':      [512, 32,  64, 64],  // Layer0_38  第1行第6列
  '上下单路':      [416, 32,  64, 64],  // Layer0_24  第1行第5列
  '十字路':        [608, 32,  64, 64],  // Layer0_25  第1行第7列
  '无上丁字路':    [704, 32,  64, 64],  // Layer0_26  第1行第8列
  '无下丁字路':    [800, 32,  64, 64],  // Layer0_27  第1行第9列
  '无左丁字路':    [800, 128, 64, 64],  // Layer0_29  第2行第9列
  '无右丁字路':    [704, 128, 64, 64],  // Layer0_28  第2行第8列
  '左上角弯路':    [416, 128, 64, 64],  // Layer0_30  第2行第5列
  '右上角弯路':    [512, 128, 64, 64],  // Layer0_31  第2行第6列
  '左下角弯路':    [416, 224, 64, 64],  // Layer0_32  第3行第5列
  '右下角弯路':    [512, 224, 64, 64],  // Layer0_33  第3行第6列

  // ===== 环境/资源 =====
  'pine_tree':     [722, 328, 27,  48], // Layer0_45  第4行第8列
  'round_tree':    [535, 330, 19,  46], // Layer0_44  第4行第6列
  'gold_mine':     [813, 528, 38,  35], // Layer0_82  第6行第9列
  'big_gold_mine': [909, 528, 38,  35], // Layer0_83  第6行第10列
  'stone_1':       [528, 434, 32,  28], // Layer0_73  第5行第6列
  'stone_2':       [621, 432, 38,  32], // Layer0_75  第5行第7列
  'stone_3':       [717, 431, 38,  35], // Layer0_76  第5行第8列
  'dirt_1':        [528, 531, 32,  28], // Layer0_78  第6行第6列
  'dirt_2':        [621, 529, 38,  32], // Layer0_79  第6行第7列
  'dirt_3':        [717, 528, 38,  35], // Layer0_80  第6行第8列

  // ===== 建筑 =====
  '城镇中心上':     [1570, 58,  60, 38], // Layer0_121 第1行第17列
  '城镇中心下':     [1570, 128, 60, 38], // Layer0_120 第2行第17列

  // ===== 单位 =====
  '男农夫':         [1112, 436, 16, 24], // Layer0_96  第5行第13列
  '女农夫':         [1208, 436, 16, 24], // Layer0_95  第5行第12列

  // ===== 回退映射（用户未提供，复用已有资源）=====
  'berry':         [813, 528, 38,  35], // 复用 gold_mine
  'house':         [1570, 58,  60, 38], // 复用 城镇中心上
  'farm':          [1570, 128, 60, 38], // 复用 城镇中心下
  'lumber_camp':   [1570, 58,  60, 38], // 复用 城镇中心上
  'mining_camp':   [1570, 128, 60, 38], // 复用 城镇中心下
  'barracks':      [1570, 58,  60, 38], // 复用 城镇中心上
  'archery':       [1570, 128, 60, 38], // 复用 城镇中心下
  'stable':        [1570, 58,  60, 38], // 复用 城镇中心上
  'tower':         [1570, 128, 60, 38], // 复用 城镇中心下
  'swordsman':     [1208, 436, 16, 24], // 复用 男农夫
  'archer':        [1112, 436, 16, 24], // 复用 女农夫
  'knight':        [1208, 436, 16, 24], // 复用 男农夫
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

  // 单位
  '/PNG/Default size/Unit/男农夫.png':           '男农夫',
  '/PNG/Default size/Unit/女农夫.png':           '女农夫',
  '/PNG/Default size/Unit/medievalUnit_01.png':  'swordsman',
  '/PNG/Default size/Unit/medievalUnit_03.png':  'archer',
  '/PNG/Default size/Unit/medievalUnit_07.png':  'knight',

  // 环境回退
  '/PNG/Default size/Environment/浆果.png':      'berry',
}

/**
 * 从 SVG 加载所有纹理
 * @param {function} onProgress - 进度回调
 * @returns {Object} 纹理映射表 { svgName: Texture }
 */
export async function loadTexturesFromSVG(onProgress) {
  // 1. 加载 SVG 文本
  const response = await fetch(SVG_PATH)
  const svgText = await response.text()

  // 2. 创建 Image 加载 SVG
  const blob = new Blob([svgText], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)

  const img = new Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = url
  })

  // 3. 渲染 SVG 到离屏 Canvas
  const canvas = document.createElement('canvas')
  canvas.width = SVG_WIDTH * RENDER_SCALE
  canvas.height = SVG_HEIGHT * RENDER_SCALE
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(url)

  // 4. 按边界框裁切各个纹理
  const textures = {}
  const entries = Object.entries(SVG_SPRITE_MAP)
  let loaded = 0

  for (const [name, [x, y, w, h]] of entries) {
    // 从大 canvas 裁切小区域
    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = w * RENDER_SCALE
    cropCanvas.height = h * RENDER_SCALE
    const cropCtx = cropCanvas.getContext('2d')
    cropCtx.drawImage(
      canvas,
      x * RENDER_SCALE, y * RENDER_SCALE, w * RENDER_SCALE, h * RENDER_SCALE,
      0, 0, cropCanvas.width, cropCanvas.height
    )

    try {
      textures[name] = Texture.from(cropCanvas)
    } catch (e) {
      console.warn(`Failed to create texture: ${name}`, e)
      textures[name] = Texture.EMPTY
    }

    loaded++
    if (onProgress) onProgress(loaded / entries.length)
  }

  return textures
}
