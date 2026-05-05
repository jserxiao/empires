import { MAP_CONFIG } from '../mapConstants'

const { COLS, ROWS } = MAP_CONFIG

/**
 * 地图加载界面
 */
function LoadingScreen({ progress }) {
  return (
    <div className="map-loading">
      <div className="spinner"></div>
      <p>正在生成 {COLS}x{ROWS} 地图... {progress}%</p>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }}></div>
      </div>
      <p className="loading-hint">地图在后台线程生成中，请稍候</p>
    </div>
  )
}

export default LoadingScreen
