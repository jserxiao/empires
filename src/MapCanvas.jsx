import { useRef, useEffect, useState, useCallback } from 'react'
import { MAP_CONFIG, TERRAIN_NAMES, ROAD } from './mapConstants.js'
import { useMapAssets } from './hooks/useMapAssets.js'
import { useMapData } from './hooks/useMapData.js'
import { useViewport } from './hooks/useViewport.js'
import { useUnitMovement } from './hooks/useUnitMovement.js'
import { useSelection } from './hooks/useSelection.js'
import { useRenderLoop } from './hooks/useRenderLoop.js'
import { renderViewport } from './renderers/tileRenderer.js'
import MiniMap from './MiniMap'
import SelectedUnitPanel from './components/SelectedUnitPanel.jsx'
import LoadingScreen from './components/LoadingScreen.jsx'

const { COLS, ROWS } = MAP_CONFIG

function MapCanvas() {
  const canvasRef = useRef(null)

  // 资源加载
  const { images, loading: loadingImages, progress: assetsProgress } = useMapAssets()

  // 地图生成
  const [seed] = useState(Date.now())
  const { map, loading: loadingMap, progress: mapProgress } = useMapData(seed)

  // 视口交互
  const { viewportRef, renderFlagRef, viewportState, isEdgeScrolling, updateViewport, handlers } = useViewport()

  // 悬停信息
  const [hoveredTile, setHoveredTile] = useState(null)

  // 地图 ref（供移动系统使用）
  const mapRef = useRef(map)
  useEffect(() => { mapRef.current = map }, [map])

  // 渲染触发
  const triggerRender = useCallback(() => {
    renderFlagRef.current++
  }, [renderFlagRef])

  // 单位移动
  const { handleTileClick, handleBoxSelect, getMovingUnits, getSelectedUnits, clearSelection } = useUnitMovement(mapRef, triggerRender, map)

  // 框选交互
  const { selectionBoxRef, handleMouseMove: selectionMouseMove, handleMouseDown: selectionMouseDown, handleMouseUp: selectionMouseUp, cancelSelection } = useSelection({
    handleTileClick,
    handleBoxSelect,
    viewportRef,
    map,
  })

  // 渲染循环 + 选中信息
  const { selectedInfo } = useRenderLoop({
    canvasRef,
    map,
    images,
    loadingImages,
    loadingMap,
    viewportRef,
    getMovingUnits,
    getSelectedUnits,
    selectionBoxRef,
    renderViewport,
  })

  // 总进度
  const loadingProgress = Math.max(assetsProgress, mapProgress)
  const isLoading = loadingImages || loadingMap

  // ==================== 鼠标事件 ====================

  const handleMouseMove = useCallback((e) => {
    // 框选拖拽检测
    const isSelecting = selectionMouseMove(e)
    if (isSelecting) return // 框选期间不更新悬停信息

    // 悬停检测
    handlers.handleMouseMove(e, map, (tileCol, tileRow) => {
      if (tileCol >= 0 && tileCol < COLS && tileRow >= 0 && tileRow < ROWS) {
        const tile = map[tileRow][tileCol]
        setHoveredTile({
          terrain: TERRAIN_NAMES[tile.terrain],
          unit: (tile.units && tile.units.length > 0) ? tile.units.map(u => u.name).join(', ') : '无',
        })
      } else {
        setHoveredTile(null)
      }
    })
  }, [map, handlers, selectionMouseMove])

  const handleMouseDown = useCallback((e) => {
    selectionMouseDown(e)
  }, [selectionMouseDown])

  const handleMouseUp = useCallback((e) => {
    selectionMouseUp(e)
  }, [selectionMouseUp])

  const handleMouseLeave = useCallback((e) => {
    handlers.handleMouseLeave(e)
    setHoveredTile(null)
    cancelSelection()
  }, [handlers, cancelSelection])

  const handleMinimapViewportChange = useCallback((newVp) => {
    updateViewport(newVp)
  }, [updateViewport])

  const handleContextMenu = useCallback((e) => {
    e.preventDefault()
  }, [])

  // 边缘滚动时光标变化
  const [edgeCursor, setEdgeCursor] = useState('default')
  useEffect(() => {
    const interval = setInterval(() => {
      if (isEdgeScrolling.current) {
        setEdgeCursor('move')
      } else {
        setEdgeCursor('default')
      }
    }, 100)
    return () => clearInterval(interval)
  }, [isEdgeScrolling])

  // ==================== 渲染 ====================

  if (isLoading) {
    return <LoadingScreen progress={loadingProgress} />
  }

  return (
    <div className="map-container">
      <canvas
        ref={canvasRef}
        className="map-canvas"
        style={{ cursor: edgeCursor, width: '100vw', height: '100vh', display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handlers.handleWheel}
        onContextMenu={handleContextMenu}
      />
      {hoveredTile && (
        <div className="tile-info">
          <span>{hoveredTile.terrain}</span>
          {hoveredTile.unit !== '无' && <span className="unit-info">{hoveredTile.unit}</span>}
        </div>
      )}
      <SelectedUnitPanel units={selectedInfo} />
      <MiniMap
        map={map}
        viewport={viewportState}
        onViewportChange={handleMinimapViewportChange}
      />
    </div>
  )
}

export default MapCanvas
