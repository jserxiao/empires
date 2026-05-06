import { useState, useEffect, useRef, useCallback } from 'react'
import { subscribe, getState, initMap, setViewport } from './core/GameState.js'
import { startGameLoop, stopGameLoop, setMousePosition, setMouseLeftCanvas, clearEdgeScroll } from './core/GameLoop.js'
import { renderGame, renderSelectionBox, initRenderer, clearEntitySprites } from './game/GameRenderer.js'
import { handleMouseMove, handleMouseDown, handleMouseUp, getTileInfo, enterBuildMode, cancelBuildMode, getBuildMode } from './game/InputHandler.js'
import { startMapGeneration, cancelMapGeneration } from './game/MapWorker.js'
import { initPixiApp, loadTextures, destroyPixiApp, isPixiReady } from './core/PixiApp.js'
import { MAP_CONFIG, FOG_CONFIG } from './core/constants.js'
import { getFogData } from './systems/FogOfWar.js'
import InfoPanel from './components/InfoPanel.jsx'
import './App.css'

const { COLS, ROWS, TILE_SIZE } = MAP_CONFIG

function App() {
  const [pixiReady, setPixiReady] = useState(false)
  const [assetsLoading, setAssetsLoading] = useState(true)
  const [mapReady, setMapReady] = useState(false)
  const [progress, setProgress] = useState(0)
  const [gameState, setGameState] = useState(null)
  const [tileInfo, setTileInfo] = useState(null)
  const [buildModeState, setBuildModeState] = useState(null)

  const pixiContainerRef = useRef(null)
  const minimapRef = useRef(null)
  const selectionBoxRef = useRef(null)
  // 追踪当前组件实例是否还存活（防止异步回调在卸载后执行）
  const aliveRef = useRef(true)

  // 1. 初始化 PixiJS 和加载纹理
  useEffect(() => {
    aliveRef.current = true

    async function init() {
      if (!pixiContainerRef.current) return

      try {
        // 创建 PixiJS Application
        await initPixiApp(pixiContainerRef.current)

        if (!aliveRef.current) return

        setPixiReady(true)

        // 加载纹理
        await loadTextures((p) => {
          if (aliveRef.current) setProgress(Math.floor(p * 50))
        })

        if (!aliveRef.current) return
        setAssetsLoading(false)
      } catch (e) {
        console.error('PixiJS init failed:', e)
      }
    }

    init()

    return () => {
      aliveRef.current = false
      setPixiReady(false)
      destroyPixiApp()
    }
  }, [])

  // 2. 生成地图
  useEffect(() => {
    if (assetsLoading) return
    const seed = Math.floor(Math.random() * 100000)
    startMapGeneration(COLS, ROWS, seed, (result) => {
      if (!aliveRef.current) return
      initMap(result.map, result.towns)
      setMapReady(true)
      setProgress(100)
    })
    return () => cancelMapGeneration()
  }, [assetsLoading])

  // 3. 订阅游戏状态
  useEffect(() => { return subscribe((snap) => { if (aliveRef.current) setGameState(snap) }) }, [])

  // 4. 启动游戏循环（依赖 pixiReady 和 mapReady 两个条件）
  useEffect(() => {
    if (!pixiReady || !mapReady) return

    // 再次确认 PixiJS 确实可用（防御 HMR 等场景）
    if (!isPixiReady()) return

    // 初始化渲染器 UI 元素
    initRenderer()

    startGameLoop((alpha, projectiles) => {
      renderGame(alpha, projectiles)
      renderSelectionBox(selectionBoxRef.current)
      renderMinimap()
    })

    return () => {
      stopGameLoop()
      clearEntitySprites()
    }
  }, [pixiReady, mapReady])

  // 5. 鼠标事件（绑定在 window 上，确保全窗口响应）
  useEffect(() => {
    if (!mapReady) return

    const isGameCanvas = (e) => {
      // 忽略来自 UI 面板/按钮的点击，避免建造按钮点击被当作游戏点击处理
      const el = e.target
      if (!el) return true
      // 按钮始终忽略
      if (el.tagName === 'BUTTON') return false
      // 在 UI 面板内的点击忽略
      if (el.closest?.('.info-panel') || el.closest?.('.resource-panel')) return false
      // 小地图点击忽略
      if (el.tagName === 'CANVAS' && el !== pixiContainerRef.current?.querySelector('canvas')) return false
      return true
    }

    const onMouseMove = (e) => {
      setMousePosition(e.clientX, e.clientY)
      const result = handleMouseMove(e)
      selectionBoxRef.current = result?.selectionBox || null
      setTileInfo(getTileInfo(e.clientX, e.clientY))
    }

    const onMouseDown = (e) => {
      if (!isGameCanvas(e)) return
      const wasBuilding = getBuildMode() !== null
      handleMouseDown(e)
      const nowBuilding = getBuildMode() !== null
      // 建造模式结束（放置或取消）时清除面板状态
      if (wasBuilding && !nowBuilding) {
        setBuildModeState(null)
      }
    }

    const onMouseUp = (e) => {
      if (!isGameCanvas(e)) return
      const wasBuilding = getBuildMode() !== null
      handleMouseUp(e)
      selectionBoxRef.current = null
      // 建造模式结束（左键点击空白处取消）时清除面板状态
      if (wasBuilding && getBuildMode() === null) {
        setBuildModeState(null)
      }
    }

    const onContextMenu = (e) => e.preventDefault()

    const onMouseLeave = (e) => {
      setMouseLeftCanvas(e.clientX, e.clientY)
      clearEdgeScroll()
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('mouseleave', onMouseLeave)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [mapReady])

  const renderMinimap = useCallback(() => {
    const mm = minimapRef.current; if (!mm || !mapReady) return
    const ctx = mm.getContext('2d'); const state = getState()
    const { terrain } = state; if (!terrain) return
    const mw = mm.width, mh = mm.height, sx = mw / COLS, sy = mh / ROWS
    const imgData = ctx.createImageData(mw, mh)
    const c = { 0:[26,82,118], 1:[41,128,185], 2:[212,172,110], 3:[200,214,160], 4:[82,190,128], 5:[39,174,96], 6:[127,140,141] }

    // 黑雾数据
    const fogEnabled = FOG_CONFIG.enabled
    const { fogExplored, fogVisible } = fogEnabled ? getFogData() : { fogExplored: null, fogVisible: null }

    for (let y = 0; y < mh; y++) { const row = Math.floor(y / sy); for (let x = 0; x < mw; x++) { const col = Math.floor(x / sx); const i = (y*mw+x)*4; const t = terrain[row*COLS+col]??4; const cc = c[t]||[82,190,128];
      // 黑雾处理
      if (fogEnabled && fogExplored && fogVisible) {
        const fidx = row * COLS + col
        if (!fogExplored[fidx]) {
          // 未探索 - 深黑
          imgData.data[i]=10; imgData.data[i+1]=10; imgData.data[i+2]=10; imgData.data[i+3]=255; continue
        } else if (!fogVisible[fidx]) {
          // 已探索但不在视野 - 灰色显示
          imgData.data[i]=Math.floor(cc[0]*0.35); imgData.data[i+1]=Math.floor(cc[1]*0.35); imgData.data[i+2]=Math.floor(cc[2]*0.35); imgData.data[i+3]=255; continue
        }
      }
      imgData.data[i]=cc[0]; imgData.data[i+1]=cc[1]; imgData.data[i+2]=cc[2]; imgData.data[i+3]=255 } }
    ctx.putImageData(imgData, 0, 0)
    const vp = state.viewport
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1
    ctx.strokeRect(vp.x/TILE_SIZE*sx, vp.y/TILE_SIZE*sy, window.innerWidth/TILE_SIZE*sx, window.innerHeight/TILE_SIZE*sy)
  }, [mapReady])

  const onMinimapClick = useCallback((e) => {
    const mm = minimapRef.current; if (!mm) return
    const rect = mm.getBoundingClientRect()
    const vpX = (e.clientX-rect.left)/mm.width*COLS*TILE_SIZE-window.innerWidth/2
    const vpY = (e.clientY-rect.top)/mm.height*ROWS*TILE_SIZE-window.innerHeight/2
    setViewport({ x: vpX, y: vpY })
  }, [])

  const onBuildModeChange = useCallback((type) => {
    setBuildModeState(type)
  }, [])

  const resources = gameState?.resources || { food: 0, wood: 0, gold: 0, stone: 0 }
  const population = gameState?.population || { current: 0, capacity: 0 }

  return (
    <div className="map-container">
      {/* PixiJS 容器始终渲染，确保初始化时 DOM 存在 */}
      <div ref={pixiContainerRef} className="pixi-container" style={{ visibility: (assetsLoading || !mapReady) ? 'hidden' : 'visible' }} />
      {(assetsLoading || !mapReady) && (
        <div className="map-loading">
          <div className="spinner"></div>
          <p>正在生成 {COLS}x{ROWS} 地图... {progress}%</p>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }}></div></div>
          <p className="loading-hint">地图在后台线程生成中，请稍候</p>
        </div>
      )}
      {!assetsLoading && mapReady && (
        <>
          <div className="resource-panel">
            <div className="resource-item food">🍖 {Math.floor(resources.food)}</div>
            <div className="resource-item wood">🪵 {Math.floor(resources.wood)}</div>
            <div className="resource-item gold">💰 {Math.floor(resources.gold)}</div>
            <div className="resource-item stone">🪨 {Math.floor(resources.stone)}</div>
            <div className="resource-item pop">👤 {population.current}/{population.capacity}</div>
          </div>
          <InfoPanel
            gameState={gameState}
            buildModeState={buildModeState}
            onBuildModeChange={onBuildModeChange}
          />
          <canvas ref={minimapRef} className="minimap" width={200} height={200} onClick={onMinimapClick} />
        </>
      )}
    </div>
  )
}

export default App
