/**
 * 地中海地形地图生成器 - 纯计算逻辑，可在主线程或 Worker 中运行
 */

class PerlinNoise {
  constructor(seed = Math.random() * 65536) {
    this.grad3 = [
      [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
      [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
      [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
    ]
    this.p = []
    const rng = this.seedRng(seed)
    for (let i = 0; i < 256; i++) this.p[i] = i
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [this.p[i], this.p[j]] = [this.p[j], this.p[i]]
    }
    this.perm = new Array(512)
    for (let i = 0; i < 512; i++) this.perm[i] = this.p[i & 255]
  }

  seedRng(seed) {
    let s = seed
    return () => {
      s = (s * 16807 + 0) % 2147483647
      return (s - 1) / 2147483646
    }
  }

  dot(g, x, y) {
    return g[0] * x + g[1] * y
  }

  noise(xin, yin) {
    const F2 = 0.5 * (Math.sqrt(3.0) - 1.0)
    const G2 = (3.0 - Math.sqrt(3.0)) / 6.0
    const s = (xin + yin) * F2
    const i = Math.floor(xin + s)
    const j = Math.floor(yin + s)
    const t = (i + j) * G2
    const X0 = i - t
    const Y0 = j - t
    const x0 = xin - X0
    const y0 = yin - Y0
    let i1, j1
    if (x0 > y0) { i1 = 1; j1 = 0 }
    else { i1 = 0; j1 = 1 }
    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1.0 + 2.0 * G2
    const y2 = y0 - 1.0 + 2.0 * G2
    const ii = i & 255
    const jj = j & 255
    const gi0 = this.perm[ii + this.perm[jj]] % 12
    const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 12
    const gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % 12
    let n0 = 0, n1 = 0, n2 = 0
    let t0 = 0.5 - x0 * x0 - y0 * y0
    if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * this.dot(this.grad3[gi0], x0, y0) }
    let t1 = 0.5 - x1 * x1 - y1 * y1
    if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * this.dot(this.grad3[gi1], x1, y1) }
    let t2 = 0.5 - x2 * x2 - y2 * y2
    if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * this.dot(this.grad3[gi2], x2, y2) }
    return 70.0 * (n0 + n1 + n2)
  }

  octaveNoise(x, y, octaves = 4, persistence = 0.5) {
    let total = 0
    let frequency = 1
    let amplitude = 1
    let maxValue = 0
    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * frequency, y * frequency) * amplitude
      maxValue += amplitude
      amplitude *= persistence
      frequency *= 2
    }
    return total / maxValue
  }
}

const TERRAIN = {
  DEEP_WATER: 'deep_water',
  SHALLOW_WATER: 'shallow_water',
  SAND: 'sand',
  GRASS: 'grass',
  FOREST: 'forest',
  MOUNTAIN: 'mountain',
}

const TILE_IMAGES = {
  [TERRAIN.DEEP_WATER]: '/PNG/Default size/Tile/深水.png',
  [TERRAIN.SHALLOW_WATER]: '/PNG/Default size/Tile/浅水.png',
  [TERRAIN.SAND]: '/PNG/Default size/Tile/土地.png',
  [TERRAIN.GRASS]: '/PNG/Default size/Tile/一棵树草地.png',
  [TERRAIN.FOREST]: '/PNG/Default size/Tile/三棵树草地.png',
  [TERRAIN.MOUNTAIN]: '/PNG/Default size/Tile/medievalTile_01.png',
}

const ROAD = {
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

const ROAD_IMAGES = {
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

const RESOURCE = {
  PINE_TREE: { name: '尖木树', image: '/PNG/Default size/Environment/尖木树.png' },
  ROUND_TREE: { name: '圆木树', image: '/PNG/Default size/Environment/圆木树.png' },
  BERRY: { name: '浆果', image: '/PNG/Default size/Environment/浆果.png' },
  GOLD_MINE: { name: '金矿', image: '/PNG/Default size/Environment/金矿.png' },
  BIG_GOLD_MINE: { name: '大金矿', image: '/PNG/Default size/Environment/大金矿.png' },
  STONE_1: { name: '一个石块', image: '/PNG/Default size/Environment/一个石块.png' },
  STONE_2: { name: '两个石块', image: '/PNG/Default size/Environment/两个石块.png' },
  STONE_3: { name: '三个石块', image: '/PNG/Default size/Environment/三个石块.png' },
  DIRT_1: { name: '土块', image: '/PNG/Default size/Environment/土块.png' },
  DIRT_2: { name: '两个土块', image: '/PNG/Default size/Environment/两个土块.png' },
  DIRT_3: { name: '三个土块', image: '/PNG/Default size/Environment/三个土块.png' },
}

const RESOURCE_WEIGHTS_BY_TERRAIN = {
  [TERRAIN.GRASS]: [
    { resource: RESOURCE.PINE_TREE, weight: 15 },
    { resource: RESOURCE.ROUND_TREE, weight: 15 },
    { resource: RESOURCE.BERRY, weight: 10 },
    { resource: RESOURCE.STONE_1, weight: 5 },
    { resource: RESOURCE.DIRT_1, weight: 5 },
    { resource: null, weight: 50 },
  ],
  [TERRAIN.FOREST]: [
    { resource: RESOURCE.PINE_TREE, weight: 20 },
    { resource: RESOURCE.ROUND_TREE, weight: 25 },
    { resource: RESOURCE.BERRY, weight: 15 },
    { resource: RESOURCE.STONE_1, weight: 3 },
    { resource: RESOURCE.DIRT_1, weight: 3 },
    { resource: null, weight: 34 },
  ],
  [TERRAIN.SAND]: [
    { resource: RESOURCE.STONE_2, weight: 8 },
    { resource: RESOURCE.STONE_3, weight: 5 },
    { resource: RESOURCE.DIRT_2, weight: 5 },
    { resource: RESOURCE.DIRT_3, weight: 5 },
    { resource: null, weight: 77 },
  ],
  [TERRAIN.MOUNTAIN]: [
    { resource: RESOURCE.GOLD_MINE, weight: 8 },
    { resource: RESOURCE.BIG_GOLD_MINE, weight: 3 },
    { resource: RESOURCE.STONE_2, weight: 15 },
    { resource: RESOURCE.STONE_3, weight: 15 },
    { resource: RESOURCE.DIRT_2, weight: 5 },
    { resource: null, weight: 54 },
  ],
}

function determineRoadType(roads, x, y, cols, rows) {
  const hasTop = y > 0 && roads[y - 1][x]
  const hasBottom = y < rows - 1 && roads[y + 1][x]
  const hasLeft = x > 0 && roads[y][x - 1]
  const hasRight = x < cols - 1 && roads[y][x + 1]
  const count = (hasTop ? 1 : 0) + (hasBottom ? 1 : 0) + (hasLeft ? 1 : 0) + (hasRight ? 1 : 0)
  if (count === 4) return ROAD.CROSS
  if (count === 3) {
    if (!hasTop) return ROAD.T_TOP
    if (!hasBottom) return ROAD.T_BOTTOM
    if (!hasLeft) return ROAD.T_LEFT
    if (!hasRight) return ROAD.T_RIGHT
  }
  if (count === 2) {
    if (hasTop && hasBottom) return ROAD.VERTICAL
    if (hasLeft && hasRight) return ROAD.HORIZONTAL
    if (hasTop && hasLeft) return ROAD.CORNER_BL
    if (hasTop && hasRight) return ROAD.CORNER_BR
    if (hasBottom && hasLeft) return ROAD.CORNER_TL
    if (hasBottom && hasRight) return ROAD.CORNER_TR
  }
  if (count === 1) {
    if (hasTop || hasBottom) return ROAD.VERTICAL
    if (hasLeft || hasRight) return ROAD.HORIZONTAL
  }
  return ROAD.HORIZONTAL
}

function findPathFast(map, start, end, cols, rows) {
  const openSet = [{ x: start.x, y: start.y, g: 0, f: 0 }]
  const closedSet = new Uint8Array(cols * rows)
  const cameFrom = new Int32Array(cols * rows)
  const gScores = new Float32Array(cols * rows)
  gScores.fill(Infinity)
  gScores[start.y * cols + start.x] = 0
  const idx = (x, y) => y * cols + x
  const heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

  while (openSet.length > 0) {
    let minIdx = 0
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[minIdx].f) minIdx = i
    }
    const current = openSet[minIdx]
    openSet.splice(minIdx, 1)
    const cIdx = idx(current.x, current.y)

    if (current.x === end.x && current.y === end.y) {
      const path = []
      let curIdx = cIdx
      while (curIdx >= 0) {
        const cx = curIdx % cols
        const cy = Math.floor(curIdx / cols)
        path.push({ x: cx, y: cy })
        curIdx = cameFrom[curIdx]
      }
      return path.reverse()
    }

    if (closedSet[cIdx]) continue
    closedSet[cIdx] = 1

    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ]

    for (const n of neighbors) {
      if (n.x < 0 || n.x >= cols || n.y < 0 || n.y >= rows) continue
      const nIdx = idx(n.x, n.y)
      if (closedSet[nIdx]) continue
      const tile = map[n.y][n.x]
      const isWater = tile.terrain === TERRAIN.DEEP_WATER
      const cost = isWater ? 50 : 1
      const tentativeG = gScores[cIdx] + cost
      if (tentativeG < gScores[nIdx]) {
        cameFrom[nIdx] = cIdx
        gScores[nIdx] = tentativeG
        const f = tentativeG + heuristic(n, end)
        const existing = openSet.find(n2 => n2.x === n.x && n2.y === n.y)
        if (!existing) {
          openSet.push({ x: n.x, y: n.y, g: tentativeG, f })
        } else {
          existing.g = tentativeG
          existing.f = f
        }
      }
    }
  }
  return []
}

function generateRoads(map, cols, rows, seed) {
  const rng = new PerlinNoise(seed).seedRng(seed + 99999)
  const roads = Array(rows).fill(null).map(() => Array(cols).fill(false))
  const towns = []
  const numTowns = Math.min(4, Math.floor(cols * rows / 20000) + 2)
  let attempts = 0

  while (towns.length < numTowns && attempts < 500) {
    attempts++
    const tx = Math.floor(rng() * cols)
    const ty = Math.floor(rng() * rows)
    if (map[ty][tx].terrain !== TERRAIN.DEEP_WATER && map[ty][tx].terrain !== TERRAIN.SHALLOW_WATER) {
      let tooClose = false
      for (const t of towns) {
        const dist = Math.sqrt((t.x - tx) ** 2 + (t.y - ty) ** 2)
        if (dist < 60) { tooClose = true; break }
      }
      if (!tooClose) towns.push({ x: tx, y: ty })
    }
  }

  const connected = new Set()
  for (let i = 0; i < towns.length; i++) {
    let nearest = -1
    let nearestDist = Infinity
    for (let j = 0; j < towns.length; j++) {
      if (i === j) continue
      const dist = Math.sqrt((towns[i].x - towns[j].x) ** 2 + (towns[i].y - towns[j].y) ** 2)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = j
      }
    }
    if (nearest >= 0) {
      const pairKey = [i, nearest].sort().join('-')
      if (!connected.has(pairKey)) {
        connected.add(pairKey)
        const path = findPathFast(map, towns[i], towns[nearest], cols, rows)
        for (const p of path) roads[p.y][p.x] = true
      }
    }
  }

  const roadTypes = Array(rows).fill(null).map(() => Array(cols).fill(ROAD.NONE))
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (roads[y][x]) roadTypes[y][x] = determineRoadType(roads, x, y, cols, rows)
    }
  }
  return { roadTypes, towns }
}

function generateMap(cols, rows, seed) {
  const perlin = new PerlinNoise(seed)
  const perlin2 = new PerlinNoise(seed + 12345)
  const rng = perlin.seedRng(seed + 777)
  const map = []
  const centerX = cols / 2
  const centerY = rows / 2

  for (let y = 0; y < rows; y++) {
    const row = []
    for (let x = 0; x < cols; x++) {
      const nx = x / cols
      const ny = y / rows
      let elevation = perlin.octaveNoise(nx * 3, ny * 3, 5, 0.5)
      const dx = (x - centerX) / centerX
      const dy = (y - centerY) / centerY
      const distFromCenter = Math.sqrt(dx * dx + dy * dy)
      const noiseDistortion = perlin2.octaveNoise(nx * 2.5, ny * 2.5, 3, 0.5) * 0.18
      const distortedDist = distFromCenter + noiseDistortion
      const seaRadius = 0.32
      const seaFalloff = 0.08

      if (distortedDist < seaRadius) {
        const seaDepth = 1 - (distortedDist / seaRadius)
        elevation -= seaDepth * 1.2
      } else if (distortedDist < seaRadius + seaFalloff) {
        const t = (distortedDist - seaRadius) / seaFalloff
        elevation -= (1 - t) * 0.3
      }

      const islandNoise = perlin2.octaveNoise(nx * 8 + 100, ny * 8 + 100, 2, 0.5)
      if (distortedDist > seaRadius - 0.05 && distortedDist < seaRadius + 0.1 && islandNoise > 0.5) {
        elevation += (islandNoise - 0.5) * 0.5
      }

      let terrain
      if (elevation < -0.35) terrain = TERRAIN.DEEP_WATER
      else if (elevation < -0.08) terrain = TERRAIN.SHALLOW_WATER
      else if (elevation < 0.02) terrain = TERRAIN.SAND
      else if (elevation < 0.3) terrain = TERRAIN.GRASS
      else if (elevation < 0.5) terrain = TERRAIN.FOREST
      else terrain = TERRAIN.MOUNTAIN

      let resource = null
      const weights = RESOURCE_WEIGHTS_BY_TERRAIN[terrain]
      if (weights) {
        const roll = rng()
        let cumulative = 0
        for (const w of weights) {
          cumulative += w.weight / 100
          if (roll < cumulative) { resource = w.resource; break }
        }
      }

      row.push({
        x, y, terrain, elevation, resource,
        tileImage: TILE_IMAGES[terrain],
        road: ROAD.NONE,
      })
    }
    map.push(row)
  }

  const { roadTypes, towns } = generateRoads(map, cols, rows, seed)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      map[y][x].road = roadTypes[y][x]
    }
  }

  return { map, towns }
}

// Worker 环境检测
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  // 在 Web Worker 中运行
  self.onmessage = function(e) {
    const { cols, rows, seed } = e.data
    const result = generateMap(cols, rows, seed)
    // 序列化时去掉循环引用，只保留必要数据
    const serializableMap = result.map.map(row =>
      row.map(tile => ({
        x: tile.x,
        y: tile.y,
        terrain: tile.terrain,
        elevation: tile.elevation,
        resource: tile.resource ? { name: tile.resource.name, image: tile.resource.image } : null,
        tileImage: tile.tileImage,
        road: tile.road,
      }))
    )
    self.postMessage({ map: serializableMap, towns: result.towns })
  }
}

// 主线程导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateMap, TERRAIN, ROAD, ROAD_IMAGES, RESOURCE, TILE_IMAGES }
}
