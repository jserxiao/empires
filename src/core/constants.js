/**
 * 游戏常量定义 - 全局共享
 */

// ========== 地图配置 ==========
export const MAP_CONFIG = {
  COLS: 500,
  ROWS: 500,
  TILE_SIZE: 64,
  MINIMAP_SIZE: 200,
}

// ========== 地形枚举 ==========
export const TERRAIN = {
  DEEP_WATER: 0,
  SHALLOW_WATER: 1,
  SAND: 2,
  EMPTY: 3,
  GRASS: 4,
  FOREST: 5,
  MOUNTAIN: 6,
}

export const TERRAIN_COUNT = 7

export const TERRAIN_NAMES = {
  [TERRAIN.DEEP_WATER]: '深水',
  [TERRAIN.SHALLOW_WATER]: '浅水',
  [TERRAIN.SAND]: '沙地',
  [TERRAIN.EMPTY]: '空地',
  [TERRAIN.GRASS]: '草地',
  [TERRAIN.FOREST]: '森林',
  [TERRAIN.MOUNTAIN]: '山地',
}

export const TERRAIN_COLORS = {
  [TERRAIN.DEEP_WATER]: '#1a5276',
  [TERRAIN.SHALLOW_WATER]: '#2980b9',
  [TERRAIN.SAND]: '#d4ac6e',
  [TERRAIN.EMPTY]: '#c8d6a0',
  [TERRAIN.GRASS]: '#52be80',
  [TERRAIN.FOREST]: '#27ae60',
  [TERRAIN.MOUNTAIN]: '#7f8c8d',
}

// ========== 道路枚举 ==========
export const ROAD = {
  NONE: 0,
  HORIZONTAL: 1,
  VERTICAL: 2,
  CROSS: 3,
  T_TOP: 4,
  T_BOTTOM: 5,
  T_LEFT: 6,
  T_RIGHT: 7,
  CORNER_TL: 8,
  CORNER_TR: 9,
  CORNER_BL: 10,
  CORNER_BR: 11,
}

// ========== 资源类型 ==========
export const RESOURCE_TYPE = {
  FOOD: 'food',
  WOOD: 'wood',
  GOLD: 'gold',
  STONE: 'stone',
}

// ========== 实体状态 ==========
export const ENTITY_STATE = {
  IDLE: 'idle',
  MOVING: 'moving',
  ATTACKING: 'attacking',
  GATHERING: 'gathering',
  BUILDING: 'building',
  RETURNING: 'returning',
  DEAD: 'dead',
}

// ========== 单位类型 ==========
export const UNIT_TYPE = {
  MALE_FARMER: 'male_farmer',
  FEMALE_FARMER: 'female_farmer',
  SWORDSMAN: 'swordsman',
  ARCHER: 'archer',
  KNIGHT: 'knight',
}

// ========== 单位显示尺寸 (相对 TILE_SIZE 的比例) ==========
export const UNIT_DISPLAY_SIZE = {
  male_farmer:   { w: 0.25, h: 0.4 },
  female_farmer: { w: 0.25, h: 0.4 },
  swordsman:     { w: 0.8,  h: 0.8 },
  archer:        { w: 0.8,  h: 0.8 },
  knight:        { w: 0.8,  h: 0.8 },
}

// ========== 建筑类型 ==========
export const BUILDING_TYPE = {
  TOWN_CENTER: 'town_center',
  HOUSE: 'house',
  FARM: 'farm',
  LUMBER_CAMP: 'lumber_camp',
  MINING_CAMP: 'mining_camp',
  BARRACKS: 'barracks',
  ARCHERY_RANGE: 'archery_range',
  STABLE: 'stable',
  TOWER: 'tower',
  WALL: 'wall',
}

// ========== 团队 ==========
export const TEAM = {
  PLAYER: 0,
  ENEMY: 1,
  NEUTRAL: 2,
}

// ========== 资源定义 ==========
export const RESOURCE_DEFS = {
  pine_tree:     { name: '尖木树',  image: '/PNG/Default size/Environment/尖木树.png',   type: RESOURCE_TYPE.WOOD,  amount: 100, gatherRate: 0.5 },
  round_tree:    { name: '圆木树',  image: '/PNG/Default size/Environment/圆木树.png',   type: RESOURCE_TYPE.WOOD,  amount: 100, gatherRate: 0.5 },
  berry:         { name: '浆果',    image: '/PNG/Default size/Environment/浆果.png',     type: RESOURCE_TYPE.FOOD,  amount: 125, gatherRate: 0.35 },
  gold_mine:     { name: '金矿',    image: '/PNG/Default size/Environment/金矿.png',     type: RESOURCE_TYPE.GOLD,  amount: 800, gatherRate: 0.3 },
  big_gold_mine: { name: '大金矿',  image: '/PNG/Default size/Environment/大金矿.png',   type: RESOURCE_TYPE.GOLD,  amount: 2000, gatherRate: 0.3 },
  gold_pile:     { name: '金矿堆',  images: ['/PNG/Default size/Environment/金矿.png', '/PNG/Default size/Environment/大金矿.png'], type: RESOURCE_TYPE.GOLD,  amount: 1500, gatherRate: 0.3 },
  gold_cluster:  { name: '金矿群',  images: ['/PNG/Default size/Environment/大金矿.png', '/PNG/Default size/Environment/金矿.png', '/PNG/Default size/Environment/金矿.png', '/PNG/Default size/Environment/金矿.png'], type: RESOURCE_TYPE.GOLD, amount: 3000, gatherRate: 0.3 },
  stone_1:       { name: '一个石块', image: '/PNG/Default size/Environment/一个石块.png', type: RESOURCE_TYPE.STONE, amount: 150, gatherRate: 0.35 },
  stone_2:       { name: '两个石块', image: '/PNG/Default size/Environment/两个石块.png', type: RESOURCE_TYPE.STONE, amount: 300, gatherRate: 0.35 },
  stone_3:       { name: '三个石块', image: '/PNG/Default size/Environment/三个石块.png', type: RESOURCE_TYPE.STONE, amount: 400, gatherRate: 0.35 },
  stone_cluster: { name: '石矿群',  images: ['/PNG/Default size/Environment/三个石块.png', '/PNG/Default size/Environment/两个石块.png', '/PNG/Default size/Environment/一个石块.png', '/PNG/Default size/Environment/一个石块.png'], type: RESOURCE_TYPE.STONE, amount: 2000, gatherRate: 0.35 },
  dirt_1:        { name: '土块',    image: '/PNG/Default size/Environment/土块.png',     type: RESOURCE_TYPE.STONE, amount: 50,  gatherRate: 0.4 },
  dirt_2:        { name: '两个土块', image: '/PNG/Default size/Environment/两个土块.png', type: RESOURCE_TYPE.STONE, amount: 100, gatherRate: 0.4 },
  dirt_3:        { name: '三个土块', image: '/PNG/Default size/Environment/三个土块.png', type: RESOURCE_TYPE.STONE, amount: 150, gatherRate: 0.4 },
}

// ========== 单位定义 ==========
export const UNIT_DEFS = {
  [UNIT_TYPE.MALE_FARMER]: {
    name: '男农夫',
    image: '/PNG/Default size/Unit/男农夫.png',
    maxHp: 40,
    attack: 3,
    armor: 0,
    range: 1,
    moveSpeed: 1.2,
    attackSpeed: 1.5,
    cost: { food: 50, wood: 0, gold: 0, stone: 0 },
    trainTime: 15,
    gatherer: true,
    population: 1,
  },
  [UNIT_TYPE.FEMALE_FARMER]: {
    name: '女农夫',
    image: '/PNG/Default size/Unit/女农夫.png',
    maxHp: 30,
    attack: 2,
    armor: 0,
    range: 1,
    moveSpeed: 1.2,
    attackSpeed: 1.2,
    cost: { food: 50, wood: 0, gold: 0, stone: 0 },
    trainTime: 15,
    gatherer: true,
    population: 1,
  },
  [UNIT_TYPE.SWORDSMAN]: {
    name: '剑士',
    image: '/PNG/Default size/Unit/medievalUnit_01.png',
    maxHp: 60,
    attack: 8,
    armor: 2,
    range: 1,
    moveSpeed: 1.0,
    attackSpeed: 1.0,
    cost: { food: 60, wood: 20, gold: 0, stone: 0 },
    trainTime: 20,
    gatherer: false,
    population: 1,
  },
  [UNIT_TYPE.ARCHER]: {
    name: '弓箭手',
    image: '/PNG/Default size/Unit/medievalUnit_03.png',
    maxHp: 30,
    attack: 6,
    armor: 0,
    range: 8,
    moveSpeed: 1.1,
    attackSpeed: 1.2,
    cost: { food: 30, wood: 40, gold: 0, stone: 0 },
    trainTime: 22,
    gatherer: false,
    population: 1,
  },
  [UNIT_TYPE.KNIGHT]: {
    name: '骑士',
    image: '/PNG/Default size/Unit/medievalUnit_07.png',
    maxHp: 100,
    attack: 12,
    armor: 4,
    range: 1,
    moveSpeed: 1.5,
    attackSpeed: 0.8,
    cost: { food: 60, wood: 0, gold: 60, stone: 0 },
    trainTime: 30,
    gatherer: false,
    population: 2,
  },
}

// ========== 建筑定义 ==========
export const BUILDING_DEFS = {
  [BUILDING_TYPE.TOWN_CENTER]: {
    name: '城镇中心',
    images: ['/PNG/Default size/Structure/城镇中心上.png', '/PNG/Default size/Structure/城镇中心下.png'],
    size: { w: 2, h: 2 },
    maxHp: 600,
    cost: { food: 0, wood: 200, gold: 0, stone: 0 },
    buildTime: 60,
    dropSite: true,
    populationProvide: 5,
    trainableUnits: [UNIT_TYPE.MALE_FARMER, UNIT_TYPE.FEMALE_FARMER],
  },
  [BUILDING_TYPE.HOUSE]: {
    name: '房屋',
    image: '/PNG/Default size/Structure/medievalStructure_03.png',
    size: { w: 2, h: 2 },
    maxHp: 100,
    cost: { food: 0, wood: 30, gold: 0, stone: 0 },
    buildTime: 15,
    populationProvide: 5,
  },
  [BUILDING_TYPE.FARM]: {
    name: '农场',
    image: '/PNG/Default size/Structure/medievalStructure_04.png',
    size: { w: 2, h: 2 },
    maxHp: 50,
    cost: { food: 0, wood: 60, gold: 0, stone: 0 },
    buildTime: 20,
    produces: RESOURCE_TYPE.FOOD,
    farmAmount: 250,
  },
  [BUILDING_TYPE.LUMBER_CAMP]: {
    name: '伐木场',
    image: '/PNG/Default size/Structure/medievalStructure_05.png',
    size: { w: 2, h: 2 },
    maxHp: 100,
    cost: { food: 0, wood: 100, gold: 0, stone: 0 },
    buildTime: 20,
    dropSite: true,
    dropTypes: [RESOURCE_TYPE.WOOD],
  },
  [BUILDING_TYPE.MINING_CAMP]: {
    name: '采矿场',
    image: '/PNG/Default size/Structure/medievalStructure_08.png',
    size: { w: 2, h: 2 },
    maxHp: 100,
    cost: { food: 0, wood: 100, gold: 0, stone: 0 },
    buildTime: 20,
    dropSite: true,
    dropTypes: [RESOURCE_TYPE.GOLD, RESOURCE_TYPE.STONE],
  },
  [BUILDING_TYPE.BARRACKS]: {
    name: '兵营',
    image: '/PNG/Default size/Structure/medievalStructure_09.png',
    size: { w: 2, h: 2 },
    maxHp: 200,
    cost: { food: 0, wood: 175, gold: 0, stone: 0 },
    buildTime: 30,
    trainableUnits: [UNIT_TYPE.SWORDSMAN],
  },
  [BUILDING_TYPE.ARCHERY_RANGE]: {
    name: '射箭场',
    image: '/PNG/Default size/Structure/medievalStructure_10.png',
    size: { w: 2, h: 2 },
    maxHp: 180,
    cost: { food: 0, wood: 175, gold: 0, stone: 0 },
    buildTime: 30,
    trainableUnits: [UNIT_TYPE.ARCHER],
  },
  [BUILDING_TYPE.STABLE]: {
    name: '马厩',
    image: '/PNG/Default size/Structure/medievalStructure_11.png',
    size: { w: 2, h: 2 },
    maxHp: 200,
    cost: { food: 0, wood: 150, gold: 50, stone: 0 },
    buildTime: 35,
    trainableUnits: [UNIT_TYPE.KNIGHT],
  },
  [BUILDING_TYPE.TOWER]: {
    name: '箭塔',
    image: '/PNG/Default size/Structure/medievalStructure_13.png',
    size: { w: 1, h: 1 },
    maxHp: 150,
    cost: { food: 0, wood: 50, gold: 0, stone: 100 },
    buildTime: 40,
    attack: 6,
    range: 8,
    attackSpeed: 1.0,
  },
}

// ========== 瓦片图片映射 ==========
export const TILE_IMAGES = {
  [TERRAIN.DEEP_WATER]: '/PNG/Default size/Tile/深水.png',
  [TERRAIN.SHALLOW_WATER]: '/PNG/Default size/Tile/浅水.png',
  [TERRAIN.SAND]: '/PNG/Default size/Tile/土地.png',
  [TERRAIN.EMPTY]: '/PNG/Default size/Tile/空地.png',
  [TERRAIN.GRASS]: '/PNG/Default size/Tile/草地.png',
  [TERRAIN.FOREST]: '/PNG/Default size/Tile/三棵树草地.png',
  [TERRAIN.MOUNTAIN]: '/PNG/Default size/Tile/medievalTile_58.png',
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

// ========== 黑雾系统配置 ==========
export const FOG_CONFIG = {
  enabled: true,              // 是否启用黑雾（可通过 setFogEnabled 切换）
  unitVisionRange: 6,         // 单位视野（瓦片数）
  buildingVisionRange: 8,     // 建筑视野（瓦片数）
  fogAlpha: 0.92,             // 未探索区域黑雾透明度
  exploredAlpha: 0.45,        // 已探索但不在视野内的灰雾透明度
}

// ========== 所有需要预加载的图片路径 ==========
export function getAllImagePaths() {
  const paths = new Set()
  for (const p of Object.values(TILE_IMAGES)) paths.add(p)
  for (const p of Object.values(ROAD_IMAGES)) paths.add(p)
  for (const def of Object.values(RESOURCE_DEFS)) {
    if (def.image) paths.add(def.image)
    if (def.images) for (const p of def.images) paths.add(p)
  }
  for (const def of Object.values(BUILDING_DEFS)) {
    if (def.image) paths.add(def.image)
    if (def.images) for (const p of def.images) paths.add(p)
  }
  for (const def of Object.values(UNIT_DEFS)) {
    if (def.image) paths.add(def.image)
  }
  return Array.from(paths)
}
