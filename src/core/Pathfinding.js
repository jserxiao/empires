/**
 * 优化的 A* 寻路
 * - 使用 MinHeap 替代数组线性查找
 * - 使用 TypedArray 替代 Map/Set
 * - 支持 8 方向移动
 * - 直接读取 SoA 地形数据
 */

import { MinHeap } from './MinHeap.js'
import { MAP_CONFIG, TERRAIN } from './constants.js'

const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG

const DIRS = [
  { dx: 0, dy: -1, cost: 1 },
  { dx: 1, dy: 0, cost: 1 },
  { dx: 0, dy: 1, cost: 1 },
  { dx: -1, dy: 0, cost: 1 },
  { dx: -1, dy: -1, cost: 1.414 },
  { dx: 1, dy: -1, cost: 1.414 },
  { dx: -1, dy: 1, cost: 1.414 },
  { dx: 1, dy: 1, cost: 1.414 },
]

const TERRAIN_COST = new Float32Array(8)
TERRAIN_COST[TERRAIN.DEEP_WATER] = 999
TERRAIN_COST[TERRAIN.SHALLOW_WATER] = 999
TERRAIN_COST[TERRAIN.SAND] = 1.5
TERRAIN_COST[TERRAIN.EMPTY] = 1.0
TERRAIN_COST[TERRAIN.GRASS] = 1.0
TERRAIN_COST[TERRAIN.FOREST] = 1.8
TERRAIN_COST[TERRAIN.MOUNTAIN] = 3.0

export function findPath(terrainGrid, sx, sy, tx, ty, walkableCheck) {
  if (sx < 0 || sx >= COLS || sy < 0 || sy >= ROWS) return [{ x: sx, y: sy }]
  if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return [{ x: sx, y: sy }]

  const startTerrain = terrainGrid[sy * COLS + sx]
  if (startTerrain === TERRAIN.DEEP_WATER || startTerrain === TERRAIN.SHALLOW_WATER) {
    return [{ x: sx, y: sy }]
  }

  let actualTX = tx, actualTY = ty
  const targetTerrain = terrainGrid[ty * COLS + tx]
  if (targetTerrain === TERRAIN.DEEP_WATER || targetTerrain === TERRAIN.SHALLOW_WATER ||
      (walkableCheck && !walkableCheck(tx, ty))) {
    const nearest = findNearestWalkable(terrainGrid, tx, ty, walkableCheck)
    if (!nearest) return [{ x: sx, y: sy }]
    actualTX = nearest.x
    actualTY = nearest.y
  }

  if (actualTX === sx && actualTY === sy) return [{ x: sx, y: sy }]

  const total = COLS * ROWS
  const gScore = new Float32Array(total)
  gScore.fill(Infinity)
  const cameFrom = new Int32Array(total)
  cameFrom.fill(-1)
  const closed = new Uint8Array(total)

  const heuristic = (ax, ay) => {
    const dx = Math.abs(ax - actualTX)
    const dy = Math.abs(ay - actualTY)
    return dx + dy + (1.414 - 2) * Math.min(dx, dy)
  }

  const startIdx = sy * COLS + sx
  gScore[startIdx] = 0

  const openSet = new MinHeap()
  openSet.push({ x: sx, y: sy, f: heuristic(sx, sy) })

  let bestReachable = null
  let bestDist = Infinity

  while (openSet.size > 0) {
    const current = openSet.pop()
    const cx = current.x
    const cy = current.y
    const cIdx = cy * COLS + cx

    if (closed[cIdx]) continue
    closed[cIdx] = 1

    const dist = heuristic(cx, cy)
    if (dist < bestDist) {
      bestDist = dist
      bestReachable = { x: cx, y: cy }
    }

    if (cx === actualTX && cy === actualTY) {
      return reconstructPath(cameFrom, cx, cy)
    }

    for (const dir of DIRS) {
      const nx = cx + dir.dx
      const ny = cy + dir.dy

      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
      const nIdx = ny * COLS + nx
      if (closed[nIdx]) continue

      const terrain = terrainGrid[nIdx]
      if (terrain === TERRAIN.DEEP_WATER || terrain === TERRAIN.SHALLOW_WATER) continue
      if (walkableCheck && !walkableCheck(nx, ny)) continue

      if (dir.dx !== 0 && dir.dy !== 0) {
        const adj1 = terrainGrid[cy * COLS + nx]
        const adj2 = terrainGrid[ny * COLS + cx]
        if (adj1 === TERRAIN.DEEP_WATER || adj1 === TERRAIN.SHALLOW_WATER) continue
        if (adj2 === TERRAIN.DEEP_WATER || adj2 === TERRAIN.SHALLOW_WATER) continue
        if (walkableCheck) {
          if (!walkableCheck(nx, cy) || !walkableCheck(cx, ny)) continue
        }
      }

      const moveCost = dir.cost * (TERRAIN_COST[terrain] || 1.0)
      const tentativeG = gScore[cIdx] + moveCost

      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = cIdx
        gScore[nIdx] = tentativeG
        openSet.push({ x: nx, y: ny, f: tentativeG + heuristic(nx, ny) })
      }
    }
  }

  if (bestReachable && (bestReachable.x !== sx || bestReachable.y !== sy)) {
    return reconstructPath(cameFrom, bestReachable.x, bestReachable.y)
  }

  return [{ x: sx, y: sy }]
}

function reconstructPath(cameFrom, ex, ey) {
  const path = [{ x: ex, y: ey }]
  let idx = ey * COLS + ex
  while (cameFrom[idx] !== -1) {
    const from = cameFrom[idx]
    path.push({ x: from % COLS, y: Math.floor(from / COLS) })
    idx = from
  }
  path.reverse()
  return path
}

function findNearestWalkable(terrainGrid, tx, ty, walkableCheck) {
  if (tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS) {
    const t = terrainGrid[ty * COLS + tx]
    if (t !== TERRAIN.DEEP_WATER && t !== TERRAIN.SHALLOW_WATER &&
        (!walkableCheck || walkableCheck(tx, ty))) {
      return { x: tx, y: ty }
    }
  }
  for (let r = 1; r < 15; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const nx = tx + dx, ny = ty + dy
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
        const t = terrainGrid[ny * COLS + nx]
        if (t !== TERRAIN.DEEP_WATER && t !== TERRAIN.SHALLOW_WATER &&
            (!walkableCheck || walkableCheck(nx, ny))) {
          return { x: nx, y: ny }
        }
      }
    }
  }
  return null
}

export function pathToWorldPath(gridPath) {
  return gridPath.map(p => ({
    x: p.x * TILE_SIZE + TILE_SIZE / 2,
    y: p.y * TILE_SIZE + TILE_SIZE / 2,
  }))
}

export function computePathLength(worldPath) {
  let total = 0
  for (let i = 0; i < worldPath.length - 1; i++) {
    const dx = worldPath[i + 1].x - worldPath[i].x
    const dy = worldPath[i + 1].y - worldPath[i].y
    total += Math.sqrt(dx * dx + dy * dy)
  }
  return total
}

export function distributeTargets(terrainGrid, centerCol, centerRow, count, walkableCheck) {
  const targets = []
  const used = new Set()

  if (isWalkable(terrainGrid, centerCol, centerRow, walkableCheck)) {
    targets.push({ col: centerCol, row: centerRow })
    used.add(centerCol * 10000 + centerRow)
  }

  let radius = 1
  while (targets.length < count && radius < 20) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
        const nx = centerCol + dx, ny = centerRow + dy
        const key = nx * 10000 + ny
        if (used.has(key)) continue
        if (isWalkable(terrainGrid, nx, ny, walkableCheck)) {
          targets.push({ col: nx, row: ny })
          used.add(key)
          if (targets.length >= count) break
        }
      }
      if (targets.length >= count) break
    }
    radius++
  }
  return targets
}

function isWalkable(terrainGrid, x, y, walkableCheck) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false
  const t = terrainGrid[y * COLS + x]
  if (t === TERRAIN.DEEP_WATER || t === TERRAIN.SHALLOW_WATER) return false
  if (walkableCheck && !walkableCheck(x, y)) return false
  return true
}
