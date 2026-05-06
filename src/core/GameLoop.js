/**
 * GameLoop - 唯一的游戏循环
 * 固定步长逻辑更新 + 自由帧率渲染
 */

import { getState, setViewport } from '../core/GameState.js'
import { updateMovement } from '../systems/MovementSystem.js'
import { updateCombat, updateProjectiles } from '../systems/CombatSystem.js'
import { updateGather } from '../systems/GatherSystem.js'
import { updateBuild } from '../systems/BuildSystem.js'
import { updateAI } from '../systems/AISystem.js'
import { updateFog } from '../systems/FogOfWar.js'
import { MAP_CONFIG } from '../core/constants.js'

const TICK_RATE = 30
const TICK_INTERVAL = 1000 / TICK_RATE

let running = false
let lastTimestamp = 0
let accumulator = 0
let rafId = null
let renderCallback = null
const projectiles = []

let edgeScrollDir = { dx: 0, dy: 0 }
const EDGE_SIZE = 60
const SCROLL_SPEED = 180
const OUT_OF_BOUNDS_SPEED = SCROLL_SPEED * 2
let mouseX = 0, mouseY = 0, mouseInCanvas = true

export function startGameLoop(onRender) {
  if (running) return
  running = true
  renderCallback = onRender
  lastTimestamp = 0
  accumulator = 0
  rafId = requestAnimationFrame(gameLoop)
}

export function stopGameLoop() {
  running = false
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }
  renderCallback = null
}

function gameLoop(timestamp) {
  if (!running) return
  if (!lastTimestamp) lastTimestamp = timestamp
  let dt = Math.min((timestamp - lastTimestamp) / 1000, 0.1)
  lastTimestamp = timestamp
  accumulator += dt

  while (accumulator >= TICK_INTERVAL / 1000) {
    updateAllSystems(TICK_INTERVAL / 1000)
    accumulator -= TICK_INTERVAL / 1000
  }

  const alpha = accumulator / (TICK_INTERVAL / 1000)
  if (renderCallback) renderCallback(alpha, projectiles)
  rafId = requestAnimationFrame(gameLoop)
}

function updateAllSystems(dt) {
  applyEdgeScroll(dt)
  updateMovement(dt)
  updateCombat(dt)
  updateGather(dt)
  updateBuild(dt)
  updateAI(dt)
  updateProjectiles(projectiles, dt)
  updateFog()
}

// ===== 边缘滚动 =====
export function setMousePosition(x, y) {
  mouseX = x; mouseY = y; mouseInCanvas = true
  computeEdgeScroll()
}

export function setMouseLeftCanvas(x, y) {
  mouseInCanvas = false
  computeEdgeScrollFromExit(x, y)
}

function computeEdgeScroll() {
  let dx = 0, dy = 0
  if (mouseX < EDGE_SIZE) dx = -1
  else if (mouseX > window.innerWidth - EDGE_SIZE) dx = 1
  if (mouseY < EDGE_SIZE) dy = -1
  else if (mouseY > window.innerHeight - EDGE_SIZE) dy = 1

  let speedX = SCROLL_SPEED, speedY = SCROLL_SPEED
  if (dx === -1) speedX = mouseX <= 0 ? OUT_OF_BOUNDS_SPEED : SCROLL_SPEED * (1 - mouseX / EDGE_SIZE)
  else if (dx === 1) speedX = mouseX >= window.innerWidth ? OUT_OF_BOUNDS_SPEED : SCROLL_SPEED * (1 - (window.innerWidth - mouseX) / EDGE_SIZE)
  if (dy === -1) speedY = mouseY <= 0 ? OUT_OF_BOUNDS_SPEED : SCROLL_SPEED * (1 - mouseY / EDGE_SIZE)
  else if (dy === 1) speedY = mouseY >= window.innerHeight ? OUT_OF_BOUNDS_SPEED : SCROLL_SPEED * (1 - (window.innerHeight - mouseY) / EDGE_SIZE)

  edgeScrollDir = { dx: dx * speedX, dy: dy * speedY }
}

function computeEdgeScrollFromExit(x, y) {
  let dx = 0, dy = 0
  if (x < EDGE_SIZE) dx = -1; else if (x > window.innerWidth - EDGE_SIZE) dx = 1
  if (y < EDGE_SIZE) dy = -1; else if (y > window.innerHeight - EDGE_SIZE) dy = 1
  edgeScrollDir = { dx: (dx > 0 ? 1 : dx < 0 ? -1 : 0) * OUT_OF_BOUNDS_SPEED, dy: (dy > 0 ? 1 : dy < 0 ? -1 : 0) * OUT_OF_BOUNDS_SPEED }
}

export function clearEdgeScroll() { edgeScrollDir = { dx: 0, dy: 0 } }
export function isEdgeScrolling() { return edgeScrollDir.dx !== 0 || edgeScrollDir.dy !== 0 }
export function getMousePosition() { return { x: mouseX, y: mouseY } }

function applyEdgeScroll(dt) {
  if (edgeScrollDir.dx === 0 && edgeScrollDir.dy === 0) return
  const state = getState()
  if (!state.mapReady) return
  setViewport({
    x: state.viewport.x + edgeScrollDir.dx * dt * 3,
    y: state.viewport.y + edgeScrollDir.dy * dt * 3,
  })
}
