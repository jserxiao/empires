// 地图常量 - 主线程和 Worker 共享

// ========== 地图尺寸 ==========
export const MAP_CONFIG = {
  COLS: 500,
  ROWS: 500,
  TILE_SIZE: 64,
  MINIMAP_SIZE: 200,
}

// ========== 地形 ==========
export const TERRAIN = {
  DEEP_WATER: 'deep_water',
  SAND: 'sand',
  GRASS: 'grass',
  FOREST: 'forest',
  MOUNTAIN: 'mountain',
  EMPTY: 'empty',
}

export const TERRAIN_COLORS = {
  [TERRAIN.DEEP_WATER]: '#1a5276',
  [TERRAIN.SAND]: '#d4ac6e',
  [TERRAIN.EMPTY]: '#c8d6a0',
  [TERRAIN.GRASS]: '#52be80',
  [TERRAIN.FOREST]: '#27ae60',
  [TERRAIN.MOUNTAIN]: '#7f8c8d',
}

export const TERRAIN_NAMES = {
  [TERRAIN.DEEP_WATER]: '深水',
  [TERRAIN.SAND]: '沙地',
  [TERRAIN.EMPTY]: '空地',
  [TERRAIN.GRASS]: '草地',
  [TERRAIN.FOREST]: '森林',
  [TERRAIN.MOUNTAIN]: '山地',
}

export const TILE_IMAGES = {
  [TERRAIN.DEEP_WATER]: '/PNG/Default size/Tile/深水.png',
  [TERRAIN.SAND]: '/PNG/Default size/Tile/土地.png',
  [TERRAIN.GRASS]: '/PNG/Default size/Tile/草地.png',
  [TERRAIN.FOREST]: '/PNG/Default size/Tile/三棵树草地.png',
  [TERRAIN.MOUNTAIN]: '/PNG/Default size/Tile/medievalTile_01.png',
  [TERRAIN.EMPTY]: '/PNG/Default size/Tile/空地.png',
}

// ========== 道路 ==========
export const ROAD = {
  NONE: 'none',
  HORIZONTAL: 'horizontal',
  VERTICAL: 'vertical',
  CROSS: 'cross',
  T_TOP: 't_top',
  T_BOTTOM: 't_bottom',
  T_LEFT: 't_left',
  T_RIGHT: 't_right',
  CORNER_TL: 'corner_tl',
  CORNER_TR: 'corner_tr',
  CORNER_BL: 'corner_bl',
  CORNER_BR: 'corner_br',
}

export const ROAD_IMAGES = {
  [ROAD.HORIZONTAL]: '/PNG/Default size/Tile/左右单路.png',
  [ROAD.VERTICAL]: '/PNG/Default size/Tile/上下单路.png',
  [ROAD.CROSS]: '/PNG/Default size/Tile/十字路.png',
  [ROAD.T_TOP]: '/PNG/Default size/Tile/无上丁字路.png',
  [ROAD.T_BOTTOM]: '/PNG/Default size/Tile/无下丁字路.png',
  [ROAD.T_LEFT]: '/PNG/Default size/Tile/无左丁字路.png',
  [ROAD.T_RIGHT]: '/PNG/Default size/Tile/无右丁字路.png',
  [ROAD.CORNER_TL]: '/PNG/Default size/Tile/左上角弯路.png',
  [ROAD.CORNER_TR]: '/PNG/Default size/Tile/右上角弯路.png',
  [ROAD.CORNER_BL]: '/PNG/Default size/Tile/左下角弯路.png',
  [ROAD.CORNER_BR]: '/PNG/Default size/Tile/右下角弯路.png',
}

export const ROAD_COLOR = '#b0976a'

// ========== 资源 ==========
export const RESOURCE = {
  PINE_TREE: { name: '尖木树', image: '/PNG/Default size/Environment/尖木树.png' },
  ROUND_TREE: { name: '圆木树', image: '/PNG/Default size/Environment/圆木树.png' },
  BERRY: { name: '浆果', image: '/PNG/Default size/Environment/浆果.png' },
  GOLD_MINE: { name: '金矿', image: '/PNG/Default size/Environment/金矿.png' },
  BIG_GOLD_MINE: { name: '大金矿', image: '/PNG/Default size/Environment/大金矿.png' },
  GOLD_PILE: { name: '金矿堆', images: [
    '/PNG/Default size/Environment/金矿.png',
    '/PNG/Default size/Environment/大金矿.png',
  ]},
  GOLD_CLUSTER: { name: '金矿群', images: [
    '/PNG/Default size/Environment/大金矿.png',
    '/PNG/Default size/Environment/金矿.png',
    '/PNG/Default size/Environment/金矿.png',
    '/PNG/Default size/Environment/金矿.png',
  ]},
  STONE_1: { name: '一个石块', image: '/PNG/Default size/Environment/一个石块.png' },
  STONE_2: { name: '两个石块', image: '/PNG/Default size/Environment/两个石块.png' },
  STONE_3: { name: '三个石块', image: '/PNG/Default size/Environment/三个石块.png' },
  STONE_CLUSTER: { name: '石矿群', images: [
    '/PNG/Default size/Environment/三个石块.png',
    '/PNG/Default size/Environment/两个石块.png',
    '/PNG/Default size/Environment/一个石块.png',
    '/PNG/Default size/Environment/一个石块.png',
  ]},
  DIRT_1: { name: '土块', image: '/PNG/Default size/Environment/土块.png' },
  DIRT_2: { name: '两个土块', image: '/PNG/Default size/Environment/两个土块.png' },
  DIRT_3: { name: '三个土块', image: '/PNG/Default size/Environment/三个土块.png' },
}

// ========== 建筑 ==========
export const STRUCTURE = {
  TOWN_CENTER_TOP: { name: '城镇中心上', image: '/PNG/Default size/Structure/城镇中心上.png' },
  TOWN_CENTER_BOTTOM: { name: '城镇中心下', image: '/PNG/Default size/Structure/城镇中心下.png' },
}

// ========== 单位 ==========
export const UNIT = {
  MALE_FARMER: { name: '男农夫', image: '/PNG/Default size/Unit/男农夫.png', maxHp: 100, hp: 100 },
  FEMALE_FARMER: { name: '女农夫', image: '/PNG/Default size/Unit/女农夫.png', maxHp: 80, hp: 80 },
}

// ========== 所有需要预加载的图片路径 ==========
export const ALL_IMAGE_PATHS = [
  ...Object.values(TILE_IMAGES),
  ...Object.values(ROAD_IMAGES),
  ...Object.values(RESOURCE)
    .flatMap(r => r.images ? r.images : r.image ? [r.image] : []),
  ...Object.values(STRUCTURE).map(s => s.image),
  ...Object.values(UNIT).map(u => u.image),
]
