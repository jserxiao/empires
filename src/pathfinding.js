/**
 * A* 寻路算法 - 主线程使用
 * 障碍：深水不可通行，建筑不可通行
 * 遇到水域则停止（路径终点设为水边）
 */

import { TERRAIN } from './mapConstants.js'

/**
 * 判断格子是否可通行
 * @param {Object} tile - 地图瓦片
 * @returns {boolean}
 */
function isWalkable(tile) {
  if (!tile) return false
  // 深水不可通行
  if (tile.terrain === TERRAIN.DEEP_WATER) return false
  // 建筑不可通行
  if (tile.structure) return false
  return true
}

/**
 * A* 寻路
 * @param {Array} map - 地图二维数组
 * @param {number} sx - 起点列
 * @param {number} sy - 起点行
 * @param {number} tx - 目标列
 * @param {number} ty - 目标行
 * @returns {Array<{x: number, y: number}>} 路径数组（含起点），若不可达返回到最近可达点
 */
export function findPath(map, sx, sy, tx, ty) {
  const rows = map.length
  const cols = map[0].length

  // 边界检查
  if (sx < 0 || sx >= cols || sy < 0 || sy >= rows) return [{ x: sx, y: sy }]
  if (tx < 0 || tx >= cols || ty < 0 || ty >= rows) return [{ x: sx, y: sy }]

  // 如果起点就不可通行，不动
  if (!isWalkable(map[sy][sx])) return [{ x: sx, y: sy }]

  // 如果目标点可通行，直接寻路到目标
  // 如果目标不可通行（水域/建筑），寻路到目标旁边最近的可达点
  const actualTarget = findNearestWalkable(map, tx, ty)
  if (!actualTarget) return [{ x: sx, y: sy }]

  // 起点就是目标
  if (actualTarget.x === sx && actualTarget.y === sy) return [{ x: sx, y: sy }]

  // A* 实现
  const heuristic = (ax, ay) => Math.abs(ax - actualTarget.x) + Math.abs(ay - actualTarget.y)

  const openSet = []
  const closedSet = new Set()
  const gScore = new Map()
  const fScore = new Map()
  const cameFrom = new Map()

  const key = (x, y) => y * cols + x

  const startKey = key(sx, sy)
  gScore.set(startKey, 0)
  fScore.set(startKey, heuristic(sx, sy))
  openSet.push({ x: sx, y: sy, f: heuristic(sx, sy) })

  const dirs = [
    [0, -1], [0, 1], [-1, 0], [1, 0],  // 4方向
    [-1, -1], [-1, 1], [1, -1], [1, 1], // 8方向对角线
  ]

  let bestReachable = null
  let bestDist = Infinity

  while (openSet.length > 0) {
    // 找 f 值最小的
    let bestIdx = 0
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[bestIdx].f) bestIdx = i
    }

    const current = openSet.splice(bestIdx, 1)[0]
    const ck = key(current.x, current.y)

    // 记录离目标最近的可达点（用于水域阻挡时）
    const dist = heuristic(current.x, current.y)
    if (dist < bestDist) {
      bestDist = dist
      bestReachable = { x: current.x, y: current.y }
    }

    // 到达目标
    if (current.x === actualTarget.x && current.y === actualTarget.y) {
      return reconstructPath(cameFrom, current.x, current.y, cols)
    }

    closedSet.add(ck)

    for (const [dx, dy] of dirs) {
      const nx = current.x + dx
      const ny = current.y + dy

      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
      const nk = key(nx, ny)
      if (closedSet.has(nk)) continue
      if (!isWalkable(map[ny][nx])) continue

      // 对角线移动：检查两个相邻格子是否都可通行（防止穿墙角）
      if (dx !== 0 && dy !== 0) {
        if (!isWalkable(map[current.y + dy][current.x]) ||
            !isWalkable(map[current.y][current.x + dx])) continue
      }

      const moveCost = (dx !== 0 && dy !== 0) ? 1.414 : 1.0
      // 山地、森林增加移动代价
      const tile = map[ny][nx]
      let terrainCost = 1
      if (tile.terrain === TERRAIN.MOUNTAIN) terrainCost = 3
      else if (tile.terrain === TERRAIN.FOREST) terrainCost = 2

      const tentativeG = gScore.get(ck) + moveCost * terrainCost

      if (tentativeG < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, ck)
        gScore.set(nk, tentativeG)
        const f = tentativeG + heuristic(nx, ny)
        fScore.set(nk, f)

        // 如果不在 openSet 中，加入
        if (!openSet.some(n => n.x === nx && n.y === ny)) {
          openSet.push({ x: nx, y: ny, f })
        }
      }
    }
  }

  // 无法到达目标，走到最近的可达点
  if (bestReachable && (bestReachable.x !== sx || bestReachable.y !== sy)) {
    return reconstructPath(cameFrom, bestReachable.x, bestReachable.y, cols)
  }

  return [{ x: sx, y: sy }]
}

function reconstructPath(cameFrom, ex, ey, cols) {
  const path = [{ x: ex, y: ey }]
  let k = cameFrom.get(ey * cols + ex)
  while (k !== undefined) {
    const py = Math.floor(k / cols)
    const px = k % cols
    path.push({ x: px, y: py })
    k = cameFrom.get(k)
  }
  path.reverse()
  return path
}

/**
 * 找到目标附近最近的可达格子
 * 如果目标本身可通行则返回目标
 * 如果目标不可通行，搜索周围 5×5 范围找最近可达点
 */
function findNearestWalkable(map, tx, ty) {
  const rows = map.length
  const cols = map[0].length

  if (tx >= 0 && tx < cols && ty >= 0 && ty < rows && isWalkable(map[ty][tx])) {
    return { x: tx, y: ty }
  }

  // 搜索目标周围 5×5
  let best = null
  let bestDist = Infinity
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = tx + dx
      const ny = ty + dy
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
      if (isWalkable(map[ny][nx])) {
        const dist = Math.abs(dx) + Math.abs(dy)
        if (dist < bestDist) {
          bestDist = dist
          best = { x: nx, y: ny }
        }
      }
    }
  }
  return best
}
