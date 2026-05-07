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
  FARMER: 'farmer',
  MALE_FARMER: 'male_farmer',
  FEMALE_FARMER: 'female_farmer',
  SWORDSMAN: 'swordsman',
  ARCHER: 'archer',
  KNIGHT: 'knight',
  HALBERDIER: 'halberdier',
  IRON_GUARD: 'iron_guard',
  WARSHIP: 'warship',
}

// ========== 单位显示尺寸 (相对 TILE_SIZE 的比例) ==========
export const UNIT_DISPLAY_SIZE = {
  farmer:        { w: 0.25, h: 0.4 },
  male_farmer:   { w: 0.25, h: 0.4 },
  female_farmer: { w: 0.25, h: 0.4 },
  swordsman:     { w: 0.8,  h: 0.8 },
  archer:        { w: 0.8,  h: 0.8 },
  knight:        { w: 0.8,  h: 0.8 },
  halberdier:    { w: 0.25, h: 0.4 },
  iron_guard:    { w: 0.25, h: 0.4 },
  warship:       { w: 0.6,  h: 1 },
}

// ========== 建筑类型 ==========
export const BUILDING_TYPE = {
  TOWN_CENTER: 'town_center',
  HOUSE: 'house',
  CIVILIAN_HOUSE: 'civilian_house',
  FARM: 'farm',
  LUMBER_CAMP: 'lumber_camp',
  MINING_CAMP: 'mining_camp',
  BARRACKS: 'barracks',
  MILITARY_CAMP: 'military_camp',
  ARCHERY_RANGE: 'archery_range',
  STABLE: 'stable',
  TOWER: 'tower',
  WALL: 'wall',
  CITY_WALL: 'city_wall',
  SHIPYARD: 'shipyard',
}

// ========== 团队 ==========
export const TEAM = {
  PLAYER: 0,
  ENEMY: 1,
  NEUTRAL: 2,
}

/** 队伍 → 玩家配色键名映射 */
export const TEAM_COLOR_MAP = {
  [TEAM.PLAYER]: 'red',
  [TEAM.ENEMY]: 'blue',
  [TEAM.NEUTRAL]: null,
}

// ========== 资源定义 ==========
export const RESOURCE_DEFS = {
  pine_tree:     { name: '尖木树',  image: 'pine_tree',   type: RESOURCE_TYPE.WOOD,  amount: 100, gatherRate: 0.5 },
  round_tree:    { name: '圆木树',  image: 'round_tree',   type: RESOURCE_TYPE.WOOD,  amount: 100, gatherRate: 0.5 },
  berry:         { name: '浆果',    images: ['berry', 'berry', 'berry', 'berry'], type: RESOURCE_TYPE.FOOD,  amount: 125, gatherRate: 0.35 },
  gold_mine:     { name: '金矿',    image: 'gold_mine',     type: RESOURCE_TYPE.GOLD,  amount: 800, gatherRate: 0.3 },
  big_gold_mine: { name: '大金矿',  image: 'big_gold_mine',   type: RESOURCE_TYPE.GOLD,  amount: 2000, gatherRate: 0.3 },
  gold_pile:     { name: '金矿堆',  images: ['gold_mine', 'big_gold_mine'], type: RESOURCE_TYPE.GOLD,  amount: 1500, gatherRate: 0.3 },
  gold_cluster:  { name: '金矿群',  images: ['big_gold_mine', 'gold_mine', 'gold_mine', 'gold_mine'], type: RESOURCE_TYPE.GOLD, amount: 3000, gatherRate: 0.3 },
  stone_1:       { name: '一个石块', image: 'stone_1', type: RESOURCE_TYPE.STONE, amount: 150, gatherRate: 0.35 },
  stone_2:       { name: '两个石块', image: 'stone_2', type: RESOURCE_TYPE.STONE, amount: 300, gatherRate: 0.35 },
  stone_3:       { name: '三个石块', image: 'stone_3', type: RESOURCE_TYPE.STONE, amount: 400, gatherRate: 0.35 },
  stone_cluster: { name: '石矿群',  images: ['stone_3', 'stone_2', 'stone_1', 'stone_1'], type: RESOURCE_TYPE.STONE, amount: 2000, gatherRate: 0.35 },
  dirt_1:        { name: '土块',    image: 'dirt_1',     type: RESOURCE_TYPE.STONE, amount: 50,  gatherRate: 0.4 },
  dirt_2:        { name: '两个土块', image: 'dirt_2', type: RESOURCE_TYPE.STONE, amount: 100, gatherRate: 0.4 },
  dirt_3:        { name: '三个土块', image: 'dirt_3', type: RESOURCE_TYPE.STONE, amount: 150, gatherRate: 0.4 },
}

// ========== 单位定义 ==========
export const UNIT_DEFS = {
  [UNIT_TYPE.FARMER]: {
    name: '农夫',
    // 统一农夫定义，实际创建时随机男女
    image: '男农夫',
    maxHp: 35,
    attack: 3,
    armor: 0,
    range: 1,
    moveSpeed: 0.6,
    attackSpeed: 1.3,
    cost: { food: 50, wood: 0, gold: 0, stone: 0 },
    trainTime: 15,
    gatherer: true,
    population: 1,
    // 训练完成时随机选一个实际单位类型
    randomTrainResult: [UNIT_TYPE.MALE_FARMER, UNIT_TYPE.FEMALE_FARMER],
  },
  [UNIT_TYPE.MALE_FARMER]: {
    name: '男农夫',
    image: '女农夫',  // SVG男女标签反了，交换名称
    maxHp: 40,
    attack: 3,
    armor: 0,
    range: 1,
    moveSpeed: 0.6,
    attackSpeed: 1.5,
    cost: { food: 50, wood: 0, gold: 0, stone: 0 },
    trainTime: 15,
    gatherer: true,
    population: 1,
  },
  [UNIT_TYPE.FEMALE_FARMER]: {
    name: '女农夫',
    image: '男农夫',  // SVG男女标签反了，交换名称
    maxHp: 30,
    attack: 2,
    armor: 0,
    range: 1,
    moveSpeed: 0.6,
    attackSpeed: 1.2,
    cost: { food: 50, wood: 0, gold: 0, stone: 0 },
    trainTime: 15,
    gatherer: true,
    population: 1,
  },
  [UNIT_TYPE.SWORDSMAN]: {
    name: '剑士',
    image: 'swordsman',
    maxHp: 60,
    attack: 8,
    armor: 2,
    range: 1,
    moveSpeed: 0.5,
    attackSpeed: 1.0,
    cost: { food: 60, wood: 20, gold: 0, stone: 0 },
    trainTime: 20,
    gatherer: false,
    population: 1,
  },
  [UNIT_TYPE.ARCHER]: {
    name: '弓箭手',
    image: 'archer',
    maxHp: 30,
      attack: 6,
      armor: 0,
      range: 3,
      moveSpeed: 0.55,
    attackSpeed: 1.2,
    cost: { food: 30, wood: 40, gold: 0, stone: 0 },
    trainTime: 22,
    gatherer: false,
    population: 1,
  },
  [UNIT_TYPE.KNIGHT]: {
    name: '骑士',
    image: 'knight',
    maxHp: 100,
    attack: 12,
    armor: 4,
    range: 1,
    moveSpeed: 0.75,
    attackSpeed: 0.8,
    cost: { food: 60, wood: 0, gold: 60, stone: 0 },
    trainTime: 30,
    gatherer: false,
    population: 2,
  },
  [UNIT_TYPE.HALBERDIER]: {
    name: '执戟卫士',
    image: 'halberdier',
    maxHp: 70,
    attack: 10,
    armor: 3,
    range: 1,
    moveSpeed: 0.45,
    attackSpeed: 1.0,
    cost: { food: 35, wood: 0, gold: 25, stone: 0 },
    trainTime: 22,
    gatherer: false,
    population: 1,
  },
  [UNIT_TYPE.IRON_GUARD]: {
    name: '铁甲卫士',
    image: 'iron_guard',
    maxHp: 120,
    attack: 8,
    armor: 6,
    range: 1,
    moveSpeed: 0.35,
    attackSpeed: 0.9,
    cost: { food: 40, wood: 0, gold: 40, stone: 10 },
    trainTime: 28,
    gatherer: false,
    population: 1,
  },
  [UNIT_TYPE.WARSHIP]: {
    name: '战船',
    image: 'warship',
    maxHp: 150,
    attack: 15,
    armor: 3,
    range: 4,
    moveSpeed: 0.4,
    attackSpeed: 1.2,
    cost: { food: 0, wood: 150, gold: 100, stone: 0 },
    trainTime: 35,
    gatherer: false,
    population: 2,
  },
}

// ========== 建筑定义 ==========
export const BUILDING_DEFS = {
  [BUILDING_TYPE.TOWN_CENTER]: {
    name: '城镇中心',
    images: ['城镇中心上', '城镇中心下'],
    size: { w: 2, h: 2 },
    maxHp: 600,
    cost: { food: 0, wood: 200, gold: 0, stone: 0 },
    buildTime: 60,
    dropSite: true,
    populationProvide: 5,
    trainableUnits: [UNIT_TYPE.FARMER],
  },
  [BUILDING_TYPE.HOUSE]: {
    name: '房屋',
    image: 'house',
    size: { w: 2, h: 2 },
    maxHp: 100,
    cost: { food: 0, wood: 30, gold: 0, stone: 0 },
    buildTime: 15,
    populationProvide: 5,
  },
  [BUILDING_TYPE.FARM]: {
    name: '农场',
    image: 'farm',
    size: { w: 2, h: 2 },
    maxHp: 50,
    cost: { food: 0, wood: 60, gold: 0, stone: 0 },
    buildTime: 20,
    produces: RESOURCE_TYPE.FOOD,
    farmAmount: 250,
  },
  [BUILDING_TYPE.LUMBER_CAMP]: {
    name: '伐木场',
    image: 'lumber_camp',
    size: { w: 2, h: 2 },
    maxHp: 100,
    cost: { food: 0, wood: 100, gold: 0, stone: 0 },
    buildTime: 20,
    dropSite: true,
    dropTypes: [RESOURCE_TYPE.WOOD],
  },
  [BUILDING_TYPE.MINING_CAMP]: {
    name: '采矿场',
    image: 'mining_camp',
    size: { w: 2, h: 2 },
    maxHp: 100,
    cost: { food: 0, wood: 100, gold: 0, stone: 0 },
    buildTime: 20,
    dropSite: true,
    dropTypes: [RESOURCE_TYPE.GOLD, RESOURCE_TYPE.STONE],
  },
  [BUILDING_TYPE.BARRACKS]: {
    name: '兵营',
    image: 'barracks',
    size: { w: 2, h: 2 },
    maxHp: 200,
    cost: { food: 0, wood: 175, gold: 0, stone: 0 },
    buildTime: 30,
    trainableUnits: [UNIT_TYPE.SWORDSMAN],
  },
  [BUILDING_TYPE.ARCHERY_RANGE]: {
    name: '射箭场',
    image: 'archery',
    size: { w: 2, h: 2 },
    maxHp: 180,
    cost: { food: 0, wood: 175, gold: 0, stone: 0 },
    buildTime: 30,
    trainableUnits: [UNIT_TYPE.ARCHER],
  },
  [BUILDING_TYPE.STABLE]: {
    name: '马厩',
    image: 'stable',
    size: { w: 2, h: 2 },
    maxHp: 200,
    cost: { food: 0, wood: 150, gold: 50, stone: 0 },
    buildTime: 35,
    trainableUnits: [UNIT_TYPE.KNIGHT],
  },
  [BUILDING_TYPE.TOWER]: {
    name: '箭塔',
    image: 'tower',
    size: { w: 1, h: 1 },
    maxHp: 150,
    cost: { food: 0, wood: 50, gold: 0, stone: 100 },
    buildTime: 40,
    attack: 6,
    range: 5,
    attackSpeed: 1.0,
  },
  [BUILDING_TYPE.CIVILIAN_HOUSE]: {
    name: '民房',
    image: 'civilian_house',
    size: { w: 1, h: 1 },
    maxHp: 120,
    cost: { food: 0, wood: 25, gold: 0, stone: 0 },
    buildTime: 12,
    populationProvide: 5,
  },
  [BUILDING_TYPE.CITY_WALL]: {
    name: '城墙',
    image: 'city_wall',
    size: { w: 1, h: 1 },
    maxHp: 300,
    cost: { food: 0, wood: 0, gold: 0, stone: 10 },
    buildTime: 8,
  },
  [BUILDING_TYPE.MILITARY_CAMP]: {
    name: '军营',
    image: 'military_camp',
    size: { w: 2, h: 1 },
    maxHp: 250,
    cost: { food: 0, wood: 150, gold: 50, stone: 0 },
    buildTime: 35,
    trainableUnits: [UNIT_TYPE.HALBERDIER, UNIT_TYPE.IRON_GUARD],
  },
  [BUILDING_TYPE.SHIPYARD]: {
    name: '船坞',
    image: 'shipyard',
    size: { w: 1, h: 1 },
    maxHp: 300,
    cost: { food: 0, wood: 200, gold: 100, stone: 0 },
    buildTime: 40,
    trainableUnits: [UNIT_TYPE.WARSHIP],
  },
}

// ========== 瓦片图片映射 ==========
export const TILE_IMAGES = {
  [TERRAIN.DEEP_WATER]: '深水',
  [TERRAIN.SHALLOW_WATER]: '浅水',
  [TERRAIN.SAND]: '土地',
  [TERRAIN.EMPTY]: '空地',
  [TERRAIN.GRASS]: '草地',
  [TERRAIN.FOREST]: '三棵树草地',
  [TERRAIN.MOUNTAIN]: 'tile_58',
}

export const ROAD_IMAGES = {
  [ROAD.HORIZONTAL]: '左右单路',
  [ROAD.VERTICAL]: '上下单路',
  [ROAD.CROSS]: '十字路',
  [ROAD.T_TOP]: '无上丁字路',
  [ROAD.T_BOTTOM]: '无下丁字路',
  [ROAD.T_LEFT]: '无左丁字路',
  [ROAD.T_RIGHT]: '无右丁字路',
  [ROAD.CORNER_TL]: '左上角弯路',
  [ROAD.CORNER_TR]: '右上角弯路',
  [ROAD.CORNER_BL]: '左下角弯路',
  [ROAD.CORNER_BR]: '右下角弯路',
}

export const ROAD_COLOR = '#b0976a'

// ========== 迷雾系统配置 ==========
export const FOG_CONFIG = {
  unitVisionRange: 6,         // 单位视野（瓦片数）
  buildingVisionRange: 8,     // 建筑视野（瓦片数）
  fogAlpha: 0.92,             // 黑雾模式：未探索区域透明度
  exploredAlpha: 0.45,        // 已探索但不在视野内的灰雾透明度（半明/黑雾通用）
}


