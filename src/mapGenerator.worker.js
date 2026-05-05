/**
 * 地图生成 Worker - 在后台线程执行
 */

import { TERRAIN, ROAD, RESOURCE, TILE_IMAGES, STRUCTURE, UNIT } from './mapConstants.js'

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
    // 角落命名规则：CORNER_TL = 左上角的弯路，连接 bottom + right（从左上角看是右下方向）
    if (hasTop && hasLeft) return ROAD.CORNER_TL
    if (hasTop && hasRight) return ROAD.CORNER_TR
    if (hasBottom && hasLeft) return ROAD.CORNER_BL
    if (hasBottom && hasRight) return ROAD.CORNER_BR
  }
  if (count === 1) {
    if (hasTop || hasBottom) return ROAD.VERTICAL
    if (hasLeft || hasRight) return ROAD.HORIZONTAL
  }
  return ROAD.HORIZONTAL
}

// 简化的 A* 寻路 - 使用 TypedArray 避免内存溢出，支持绕开水域
function findPath(map, x0, y0, x1, y1, cols, rows) {
  // 使用曼哈顿距离作为启发函数
  const heuristic = (ax, ay) => Math.abs(ax - x1) + Math.abs(ay - y1)

  // 使用 Int32Array 队列代替数组来减少内存开销
  const maxNodes = cols * rows
  const openX = new Int32Array(maxNodes)
  const openY = new Int32Array(maxNodes)
  const openF = new Float32Array(maxNodes)
  let openHead = 0, openTail = 0

  const cameFromX = new Int32Array(maxNodes)
  const cameFromY = new Int32Array(maxNodes)
  const gScore = new Float32Array(maxNodes).fill(Infinity)
  const closed = new Uint8Array(maxNodes)

  const idx = (x, y) => y * cols + x

  openX[openTail] = x0
  openY[openTail] = y0
  openF[openTail] = heuristic(x0, y0)
  openTail++
  gScore[idx(x0, y0)] = 0

  while (openHead < openTail) {
    // 找 f 值最小的节点（线性搜索，对于少量节点足够快）
    let bestIdx = openHead
    for (let i = openHead + 1; i < openTail; i++) {
      if (openF[i] < openF[bestIdx]) bestIdx = i
    }
    // 交换到队首
    if (bestIdx !== openHead) {
      const tmpX = openX[openHead], tmpY = openY[openHead], tmpF = openF[openHead]
      openX[openHead] = openX[bestIdx]; openY[openHead] = openY[bestIdx]; openF[openHead] = openF[bestIdx]
      openX[bestIdx] = tmpX; openY[bestIdx] = tmpY; openF[bestIdx] = tmpF
    }

    const cx = openX[openHead]
    const cy = openY[openHead]
    openHead++

    const cidx = idx(cx, cy)
    if (closed[cidx]) continue
    closed[cidx] = 1

    if (cx === x1 && cy === y1) {
      // 重建路径
      const path = []
      let px = x1, py = y1
      while (px !== x0 || py !== y0) {
        path.push({ x: px, y: py })
        const pidx = idx(px, py)
        const nx = cameFromX[pidx]
        const ny = cameFromY[pidx]
        px = nx; py = ny
      }
      path.push({ x: x0, y: y0 })
      path.reverse()
      return path
    }

    const neighbors = [
      [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]
    ]

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
      const nidx = idx(nx, ny)
      if (closed[nidx]) continue

      const tile = map[ny][nx]
      // 水域不可通行，但允许起点/终点在水边
      let moveCost = 1
      if (tile.terrain === TERRAIN.DEEP_WATER) {
        // 水域惩罚极高，但允许必要时通过（如必须跨越海峡）
        moveCost = 100
      } else if (tile.terrain === TERRAIN.MOUNTAIN) {
        moveCost = 5
      } else if (tile.terrain === TERRAIN.FOREST) {
        moveCost = 2
      }

      const tentativeG = gScore[cidx] + moveCost
      if (tentativeG < gScore[nidx]) {
        cameFromX[nidx] = cx
        cameFromY[nidx] = cy
        gScore[nidx] = tentativeG
        const f = tentativeG + heuristic(nx, ny)
        if (openTail < maxNodes) {
          openX[openTail] = nx
          openY[openTail] = ny
          openF[openTail] = f
          openTail++
        }
      }
    }
  }

  // 找不到路径，返回空
  return []
}

// 在直线路径基础上添加自然弯曲：使用贝塞尔曲线采样 + A* 绕开水域
function curvedPath(map, x0, y0, x1, y1, cols, rows, bendAmount) {
  // 如果距离太近，直接直线
  const dist = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2)
  if (dist < 30) {
    return findPath(map, x0, y0, x1, y1, cols, rows)
  }

  // 计算贝塞尔控制点，制造自然弯曲
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  // 垂直于连线的方向
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  // 单位垂直向量
  const perpX = -dy / len
  const perpY = dx / len

  // 控制点偏移量
  const offset = bendAmount * dist * 0.3
  const cx1 = mx + perpX * offset
  const cy1 = my + perpY * offset

  // 在贝塞尔曲线上采样多个途经点
  const waypoints = []
  const steps = Math.max(3, Math.floor(dist / 40))
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    // 二次贝塞尔曲线
    const bx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx1 + t * t * x1
    const by = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy1 + t * t * y1
    const wx = Math.max(0, Math.min(cols - 1, Math.round(bx)))
    const wy = Math.max(0, Math.min(rows - 1, Math.round(by)))
    waypoints.push({ x: wx, y: wy })
  }

  // 分段 A* 连接
  const fullPath = []
  let prevX = x0, prevY = y0
  for (const wp of waypoints) {
    const segment = findPath(map, prevX, prevY, wp.x, wp.y, cols, rows)
    if (segment.length === 0) {
      // 某段不通，尝试直接连到终点
      return findPath(map, x0, y0, x1, y1, cols, rows)
    }
    // 去掉最后一个点避免重复
    for (let i = 0; i < segment.length - 1; i++) {
      fullPath.push(segment[i])
    }
    prevX = wp.x
    prevY = wp.y
  }
  const lastSegment = findPath(map, prevX, prevY, x1, y1, cols, rows)
  if (lastSegment.length === 0) {
    return findPath(map, x0, y0, x1, y1, cols, rows)
  }
  for (const p of lastSegment) {
    fullPath.push(p)
  }

  return fullPath
}

function generateRoads(map, cols, rows, seed) {
  const perlin = new PerlinNoise(seed + 88888)
  const rng = perlin.seedRng(seed + 99999)
  const roads = Array(rows).fill(null).map(() => Array(cols).fill(false))
  const towns = []
  const numTowns = Math.min(5, Math.floor(cols * rows / 25000) + 2)
  let attempts = 0

  while (towns.length < numTowns && attempts < 500) {
    attempts++
    const tx = Math.floor(rng() * cols)
    const ty = Math.floor(rng() * rows)
    // 城镇只生成在草地或空地上，确保道路在绿色区域
    if (map[ty][tx].terrain === TERRAIN.GRASS || map[ty][tx].terrain === TERRAIN.EMPTY) {
      let tooClose = false
      for (const t of towns) {
        const dist = Math.sqrt((t.x - tx) ** 2 + (t.y - ty) ** 2)
        if (dist < 60) { tooClose = true; break }
      }
      if (!tooClose) towns.push({ x: tx, y: ty })
    }
  }

  // 用弯曲路径连接城镇，道路优先走草地/空地
  for (let i = 0; i < towns.length; i++) {
    for (let j = i + 1; j < towns.length; j++) {
      const bendNoise = perlin.noise(i * 3.7 + seed, j * 2.3 + seed)
      const bendAmount = bendNoise > 0 ? 1 : -1
      const path = curvedPath(map, towns[i].x, towns[i].y, towns[j].x, towns[j].y, cols, rows, bendAmount)
      for (const p of path) {
        if (p.x >= 0 && p.x < cols && p.y >= 0 && p.y < rows) {
          const tile = map[p.y][p.x]
          // 只在草地、空地、森林上铺路，避开深水、沙地、山地
          if (tile.terrain === TERRAIN.GRASS || tile.terrain === TERRAIN.EMPTY || tile.terrain === TERRAIN.FOREST) {
            roads[p.y][p.x] = true
          }
        }
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
      if (elevation < -0.08) terrain = TERRAIN.DEEP_WATER
      else if (elevation < 0.02) terrain = TERRAIN.SAND
      else if (elevation < 0.30) terrain = TERRAIN.EMPTY
      else if (elevation < 0.50) terrain = TERRAIN.GRASS
      else if (elevation < 0.70) terrain = TERRAIN.FOREST
      else terrain = TERRAIN.MOUNTAIN

      row.push({
        x, y, terrain, elevation, resource: null,
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

  // 后处理：在空草地上按聚类分布资源，石块/土块远离树木
  placeResources(map, cols, rows, seed)

  // 在城镇中心放置建筑和单位
  placeTownBuildings(map, cols, rows, towns)

  return { map, towns }
}

function placeResources(map, cols, rows, seed) {
  const perlin = new PerlinNoise(seed + 55555)
  const rng = perlin.seedRng(seed + 66666)

  // 资源分布的噪声图层，控制聚类
  const treeNoise = new PerlinNoise(seed + 11111)
  const stoneNoise = new PerlinNoise(seed + 22222)
  const dirtNoise = new PerlinNoise(seed + 33333)

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tile = map[y][x]
      if (tile.terrain !== TERRAIN.EMPTY && tile.terrain !== TERRAIN.GRASS && tile.terrain !== TERRAIN.FOREST && tile.terrain !== TERRAIN.SAND && tile.terrain !== TERRAIN.MOUNTAIN) continue

      const nx = x / cols
      const ny = y / rows

      // 空地：少量散布浆果
      if (tile.terrain === TERRAIN.EMPTY) {
        const roll = rng()
        if (roll < 0.015) tile.resource = RESOURCE.BERRY
      }

      // 草地：树木和浆果聚类出现，偶尔有金矿群和石矿群（避开树木区域）
      else if (tile.terrain === TERRAIN.GRASS) {
        const tVal = treeNoise.octaveNoise(nx * 6, ny * 6, 3, 0.5)
        if (tVal > 0.4) {
          // 树木区域：只放树和浆果，不放石块/土块
          const roll = rng()
          if (roll < 0.35) {
            tile.resource = RESOURCE.PINE_TREE
          } else if (roll < 0.5) {
            tile.resource = RESOURCE.BERRY
          }
        }
        // 草地上的金矿群/石矿群：只在远离树木的区域出现
        else if (tVal < 0.05) {
          const roll = rng()
          if (roll < 0.03) tile.resource = RESOURCE.STONE_CLUSTER
          else if (roll < 0.05) tile.resource = RESOURCE.GOLD_CLUSTER
        }
      }

      // 森林：只放树和浆果，不放石块/土块
      else if (tile.terrain === TERRAIN.FOREST) {
        const tVal = treeNoise.octaveNoise(nx * 8, ny * 8, 2, 0.5)
        if (tVal > 0.1) {
          const roll = rng()
          if (roll < 0.88) tile.resource = RESOURCE.PINE_TREE
          else tile.resource = RESOURCE.BERRY
        }
      }

      // 沙地：土块为主，少量石矿群和金矿群
      else if (tile.terrain === TERRAIN.SAND) {
        const dVal = dirtNoise.octaveNoise(nx * 7 + 50, ny * 7 + 50, 3, 0.5)
        if (dVal > 0.3) {
          const roll = rng()
          if (roll < 0.15) tile.resource = RESOURCE.DIRT_2
          else if (roll < 0.28) tile.resource = RESOURCE.DIRT_3
        }
        const sVal = stoneNoise.octaveNoise(nx * 7, ny * 7, 3, 0.5)
        if (sVal > 0.35 && !tile.resource) {
          const roll = rng()
          if (roll < 0.08) tile.resource = RESOURCE.STONE_CLUSTER
          else if (roll < 0.13) tile.resource = RESOURCE.GOLD_CLUSTER
        }
      }

      // 山地：石矿群和少量金矿群
      else if (tile.terrain === TERRAIN.MOUNTAIN) {
        const sVal = stoneNoise.octaveNoise(nx * 5, ny * 5, 2, 0.5)
        if (sVal > 0.15) {
          const roll = rng()
          if (roll < 0.15) tile.resource = RESOURCE.GOLD_CLUSTER
          else if (roll < 0.4) tile.resource = RESOURCE.STONE_CLUSTER
        }
        const dVal = dirtNoise.octaveNoise(nx * 5 + 50, ny * 5 + 50, 2, 0.5)
        if (dVal > 0.25 && !tile.resource) {
          const roll = rng()
          if (roll < 0.1) tile.resource = RESOURCE.DIRT_2
        }
      }
    }
  }
}

function placeTownBuildings(map, cols, rows, towns) {
  // 在地图左上角找到第一块 2x2 陆地放置城镇中心
  const startPos = findTopLeftLand(map, cols, rows)
  if (startPos) {
    placeTownCenter(map, startPos.x, startPos.y)
  }

  // 其余城镇正常放置
  for (const town of towns) {
    const { x: tx, y: ty } = town
    // 跳过左上角已放置的 2x2 区域
    if (startPos && tx >= startPos.x && tx <= startPos.x + 1 && ty >= startPos.y && ty <= startPos.y + 1) continue

    if (tx + 1 >= cols || ty + 1 >= rows) continue
    placeTownCenter(map, tx, ty)
  }
}

/** 在地图左上角搜索第一块 2x2 陆地 */
function findTopLeftLand(map, cols, rows) {
  const margin = 5 // 离边缘最少 5 格
  for (let y = margin; y < rows - margin - 1; y++) {
    for (let x = margin; x < cols - margin - 1; x++) {
      const t00 = map[y][x].terrain
      const t10 = map[y][x + 1].terrain
      const t01 = map[y + 1][x].terrain
      const t11 = map[y + 1][x + 1].terrain
      const isLand = (t) => t === TERRAIN.GRASS || t === TERRAIN.EMPTY
      if (isLand(t00) && isLand(t10) && isLand(t01) && isLand(t11)) {
        return { x, y }
      }
    }
  }
  return null
}

// 单位唯一 ID 生成器
let _unitIdCounter = 0
function nextUnitId() {
  return ++_unitIdCounter
}

/** 在 (tx, ty) 为左上角的 2x2 区域放置城镇中心+农夫 */
function placeTownCenter(map, tx, ty) {
  // (tx, ty)：城镇中心上半部分
  map[ty][tx].structure = { name: STRUCTURE.TOWN_CENTER_TOP.name, image: STRUCTURE.TOWN_CENTER_TOP.image }
  map[ty][tx].resource = null

  // (tx, ty+1)：城镇中心下半部分
  map[ty + 1][tx].structure = { name: STRUCTURE.TOWN_CENTER_BOTTOM.name, image: STRUCTURE.TOWN_CENTER_BOTTOM.image }
  map[ty + 1][tx].resource = null

  // (tx+1, ty)：男农夫
  map[ty][tx + 1].units = [{ id: nextUnitId(), name: UNIT.MALE_FARMER.name, image: UNIT.MALE_FARMER.image, maxHp: UNIT.MALE_FARMER.maxHp, hp: UNIT.MALE_FARMER.hp }]
  map[ty][tx + 1].resource = null

  // (tx+1, ty+1)：女农夫
  map[ty + 1][tx + 1].units = [{ id: nextUnitId(), name: UNIT.FEMALE_FARMER.name, image: UNIT.FEMALE_FARMER.image, maxHp: UNIT.FEMALE_FARMER.maxHp, hp: UNIT.FEMALE_FARMER.hp }]
  map[ty + 1][tx + 1].resource = null
}

self.onmessage = function(e) {
  const { cols, rows, seed } = e.data
  const result = generateMap(cols, rows, seed)
  const serializableMap = result.map.map(row =>
    row.map(tile => {
      let resource = null
      if (tile.resource) {
        if (tile.resource.images) {
          resource = { name: tile.resource.name, images: tile.resource.images }
        } else {
          resource = { name: tile.resource.name, image: tile.resource.image }
        }
      }
      return {
        x: tile.x,
        y: tile.y,
        terrain: tile.terrain,
        elevation: tile.elevation,
        resource,
        tileImage: tile.tileImage,
        road: tile.road,
        structure: tile.structure || null,
        units: tile.units || [],
      }
    })
  )
  self.postMessage({ map: serializableMap, towns: result.towns })
}
