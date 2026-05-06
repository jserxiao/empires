import { useMemo } from 'react'
import { BUILDING_DEFS, UNIT_DEFS, RESOURCE_TYPE, RESOURCE_DEFS, TEAM } from '../core/constants'
import { cancelBuild, demolishBuilding, startTraining } from '../core/GameState'
import { enterBuildMode, cancelBuildMode, getBuildMode } from '../game/InputHandler'
import { PLAYER_COLORS } from '../core/SvgTextures'
import './InfoPanel.css'

// ===== 通用子组件 =====

/** 血条组件 */
function HpBar({ hp, maxHp, width = '100%' }) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100))
  const color = pct > 60 ? '#4caf50' : pct > 30 ? '#ff9800' : '#f44336'
  return (
    <div className="info-hp-bar" style={{ width }}>
      <div className="info-hp-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

/** 进度条组件 */
function ProgressBar({ progress, max, color = '#ff9800', width = '100%', label }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (progress / max) * 100)) : 0
  return (
    <div className="info-progress-wrap" style={{ width }}>
      {label && <span className="info-progress-label">{label}</span>}
      <div className="info-progress-bar">
        <div className="info-progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="info-progress-text">{Math.floor(pct)}%</span>
    </div>
  )
}

/** 操作按钮组件 */
function ActionButton({ label, onClick, variant = 'default', disabled = false }) {
  return (
    <button
      className={`info-action-btn info-action-btn--${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  )
}

const RESOURCE_NAMES = {
  [RESOURCE_TYPE.FOOD]: '食物',
  [RESOURCE_TYPE.WOOD]: '木材',
  [RESOURCE_TYPE.GOLD]: '黄金',
  [RESOURCE_TYPE.STONE]: '石头',
}

const RESOURCE_COLORS = {
  [RESOURCE_TYPE.FOOD]: '#e74c3c',
  [RESOURCE_TYPE.WOOD]: '#8d6e63',
  [RESOURCE_TYPE.GOLD]: '#ffd700',
  [RESOURCE_TYPE.STONE]: '#9e9e9e',
}

// ===== 资源信息面板 =====

function ResourceInfo({ resource }) {
  const def = RESOURCE_DEFS[resource.key]
  if (!def) return null

  const resourceName = def.name || resource.key
  const resourceType = def.type
  const typeName = RESOURCE_NAMES[resourceType] || resourceType
  const amount = Math.floor(resource.amount)
  const maxAmount = Math.floor(resource.maxAmount || def.amount || 0)
  const ratio = maxAmount > 0 ? Math.min(1, amount / maxAmount) : 0
  const color = RESOURCE_COLORS[resourceType] || '#aaa'

  return (
    <div className="info-section">
      <div className="info-header">
        <span className="info-name">{resourceName}</span>
        <span className="info-badge info-badge--resource">{typeName}</span>
      </div>

      <div className="info-block">
        <div className="info-subtitle">剩余储量</div>
        <div className="info-resource-amount-row">
          <span className="info-resource-amount" style={{ color }}>{amount}</span>
          <span className="info-resource-max"> / {maxAmount}</span>
        </div>
        <div className="info-resource-bar">
          <div className="info-resource-bar-fill" style={{ width: `${ratio * 100}%`, background: color }} />
        </div>
      </div>

      {def.gatherRate && (
        <div className="info-block">
          <div className="info-subtitle">采集速率</div>
          <div className="info-resource-detail">{def.gatherRate} / 秒</div>
        </div>
      )}
    </div>
  )
}

// ===== 建筑信息面板 =====

function BuildingInfo({ building, buildModeState, onBuildModeChange, onActionDone, trainingQueues }) {
  const def = BUILDING_DEFS[building.type]
  const trainingQueue = trainingQueues?.get(building.id) || []

  const handleCancelBuild = () => {
    cancelBuild(building.id)
    onActionDone()
  }

  const handleDemolish = () => {
    demolishBuilding(building.id)
    onActionDone()
  }

  const handleTrain = (unitType) => {
    startTraining(building.id, unitType)
  }

  const handleBuildMode = (bType) => {
    const bm = getBuildMode()
    if (bm && bm.buildingType === bType) {
      cancelBuildMode()
      onBuildModeChange(null)
    } else {
      enterBuildMode(bType)
      onBuildModeChange(bType)
    }
  }

  // 训练中数量统计
  const trainingCounts = useMemo(() => {
    const counts = {}
    for (const item of trainingQueue) {
      counts[item.unitType] = (counts[item.unitType] || 0) + 1
    }
    return counts
  }, [trainingQueue.length]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="info-section">
      {/* 基本信息 */}
      <div className="info-header">
        <span className="info-name">{building.name}</span>
        {!building.isBuilt && <span className="info-badge info-badge--building">建造中</span>}
      </div>

      <HpBar hp={building.hp} maxHp={building.maxHp} />
      <div className="info-hp-text">{building.hp} / {building.maxHp}</div>

      {/* 建造进度 */}
      {!building.isBuilt && (
        <div className="info-block">
          <ProgressBar progress={building.buildProgress} max={100} color="#ff9800" label="建造进度" />
          <ActionButton label="取消建造" variant="danger" onClick={handleCancelBuild} />
        </div>
      )}

      {/* 已完成 - 拆除按钮 */}
      {building.isBuilt && (
        <div className="info-block">
          <ActionButton label="拆除建筑" variant="danger" onClick={handleDemolish} />
        </div>
      )}

      {/* 训练面板 - 城镇中心等可训练单位 */}
      {building.isBuilt && building.trainableUnits?.length > 0 && (
        <div className="info-block">
          <div className="info-subtitle">生产单位</div>
          <div className="info-train-grid">
            {building.trainableUnits.map(uType => {
              const uDef = UNIT_DEFS[uType]
              if (!uDef) return null
              const count = trainingCounts[uType] || 0
              const currentTraining = trainingQueue.find(t => t.unitType === uType)
              return (
                <div key={uType} className="info-train-item">
                  <button className="info-train-btn" onClick={() => handleTrain(uType)}>
                    {uDef.name}
                  </button>
                  {count > 0 && (
                    <div className="info-train-status">
                      <span className="info-train-count">×{count}</span>
                      {currentTraining && (
                        <ProgressBar
                          progress={currentTraining.progress}
                          max={currentTraining.trainTime}
                          color="#4caf50"
                          width="60px"
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ===== 单位信息面板 =====

/** 农民可建造的建筑列表 */
const FARMER_BUILDINGS = ['town_center', 'civilian_house', 'city_wall', 'military_camp']

function UnitInfo({ unit, buildModeState, onBuildModeChange }) {
  const handleBuildMode = (bType) => {
    const bm = getBuildMode()
    if (bm && bm.buildingType === bType) {
      cancelBuildMode()
      onBuildModeChange(null)
    } else {
      enterBuildMode(bType)
      onBuildModeChange(bType)
    }
  }

  const maxCarry = unit.maxCarry || 20
  const carryingAmount = unit.carrying?.amount || 0
  const carryRatio = maxCarry > 0 ? Math.min(1, carryingAmount / maxCarry) : 0

  return (
    <div className="info-section">
      <div className="info-header">
        <span className="info-name">{unit.name}</span>
      </div>

      <HpBar hp={unit.hp} maxHp={unit.maxHp} />
      <div className="info-hp-text">{unit.hp} / {unit.maxHp}</div>

      {/* 单位属性 */}
      <div className="info-block">
        <div className="info-stats-grid">
          {unit.attack != null && (
            <div className="info-stat">
              <span className="info-stat-label">攻击</span>
              <span className="info-stat-value">{unit.attack}</span>
            </div>
          )}
          {unit.armor != null && (
            <div className="info-stat">
              <span className="info-stat-label">护甲</span>
              <span className="info-stat-value">{unit.armor}</span>
            </div>
          )}
          {unit.range != null && (
            <div className="info-stat">
              <span className="info-stat-label">射程</span>
              <span className="info-stat-value">{unit.range}</span>
            </div>
          )}
          {unit.baseMoveSpeed != null && (
            <div className="info-stat">
              <span className="info-stat-label">移速</span>
              <span className="info-stat-value">{unit.baseMoveSpeed}</span>
            </div>
          )}
        </div>
      </div>

      {/* 农民携带状态 */}
      {unit.gatherer && (
        <div className="info-block">
          <div className="info-subtitle">携带状态</div>
          {unit.carrying ? (
            <div className="info-carry-info">
              <span className="info-carry-type">{RESOURCE_NAMES[unit.carrying.type] || unit.carrying.type}</span>
              <ProgressBar progress={carryingAmount} max={maxCarry} color="#4caf50" width="80px" />
              <span className="info-carry-amount">{carryingAmount}/{maxCarry}</span>
            </div>
          ) : (
            <div className="info-carry-empty">未携带资源</div>
          )}
        </div>
      )}

      {/* 农民建造面板 */}
      {unit.gatherer && (
        <div className="info-block">
          <div className="info-subtitle">建造建筑</div>
          <div className="info-build-grid">
            {FARMER_BUILDINGS.map(bType => {
              const def = BUILDING_DEFS[bType]
              if (!def) return null
              const isActive = buildModeState === bType
              return (
                <button
                  key={bType}
                  className={`info-build-btn ${isActive ? 'active' : ''}`}
                  onClick={() => handleBuildMode(bType)}
                >
                  {def.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ===== 多选信息面板 =====

function MultiSelectInfo({ entities, buildModeState, onBuildModeChange }) {
  const totalHp = entities.reduce((s, u) => s + u.hp, 0)
  const totalMaxHp = entities.reduce((s, u) => s + u.maxHp, 0)
  const hasFarmer = entities.some(u => u.gatherer)

  const handleBuildMode = (bType) => {
    const bm = getBuildMode()
    if (bm && bm.buildingType === bType) {
      cancelBuildMode()
      onBuildModeChange(null)
    } else {
      enterBuildMode(bType)
      onBuildModeChange(bType)
    }
  }

  return (
    <div className="info-section">
      <div className="info-header">
        <span className="info-name">已选中 {entities.length} 个单位</span>
      </div>
      <HpBar hp={totalHp} maxHp={totalMaxHp} />
      <div className="info-hp-text">{totalHp} / {totalMaxHp}</div>

      {/* 包含农民时显示建造面板 */}
      {hasFarmer && (
        <div className="info-block">
          <div className="info-subtitle">建造建筑</div>
          <div className="info-build-grid">
            {FARMER_BUILDINGS.map(bType => {
              const def = BUILDING_DEFS[bType]
              if (!def) return null
              const isActive = buildModeState === bType
              return (
                <button
                  key={bType}
                  className={`info-build-btn ${isActive ? 'active' : ''}`}
                  onClick={() => handleBuildMode(bType)}
                >
                  {def.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ===== 敌方单位序号映射 =====
const enemyUnitCounter = { value: 0 }
const enemyUnitNames = new Map()  // entityId → 序号字母

/** 获取敌方单位的显示名称（电脑A、电脑B...） */
function getEnemyUnitName(entityId) {
  if (!enemyUnitNames.has(entityId)) {
    const letter = String.fromCharCode(65 + (enemyUnitCounter.value % 26))  // A-Z 循环
    enemyUnitNames.set(entityId, letter)
    enemyUnitCounter.value++
  }
  return '电脑' + enemyUnitNames.get(entityId)
}

// 蓝色玩家主色调，用于敌方 tag
const ENEMY_COLOR = PLAYER_COLORS.blue?.orange?.[0] || '#5588E9'

// ===== 敌方实体信息面板（只读） =====

function EnemyInfo({ entity }) {
  const isBuilding = entity.entityType === 'building'
  const displayName = isBuilding ? entity.name : getEnemyUnitName(entity.id)

  return (
    <div className="info-section">
      <div className="info-header">
        <span className="info-name">{displayName}</span>
        <span className="info-badge info-badge--enemy" style={{
          background: `${ENEMY_COLOR}33`,
          color: ENEMY_COLOR,
          borderColor: `${ENEMY_COLOR}66`,
        }}>电脑</span>
      </div>

      {/* 非建筑单位显示单位类型名 */}
      {!isBuilding && (
        <div className="info-enemy-type">{entity.name}</div>
      )}

      <HpBar hp={entity.hp} maxHp={entity.maxHp} />
      <div className="info-hp-text">{entity.hp} / {entity.maxHp}</div>

      {/* 建造中的建筑：显示合并的建造进度+血量条 */}
      {isBuilding && !entity.isBuilt && (
        <div className="info-block">
          <div className="info-subtitle">建造进度</div>
          <ProgressBar progress={entity.buildProgress} max={100} color="#ff9800" />
        </div>
      )}

      {/* 单位属性 */}
      {!isBuilding && (
        <div className="info-block">
          <div className="info-stats-grid">
            {entity.attack != null && (
              <div className="info-stat">
                <span className="info-stat-label">攻击</span>
                <span className="info-stat-value">{entity.attack}</span>
              </div>
            )}
            {entity.armor != null && (
              <div className="info-stat">
                <span className="info-stat-label">护甲</span>
                <span className="info-stat-value">{entity.armor}</span>
              </div>
            )}
            {entity.range != null && (
              <div className="info-stat">
                <span className="info-stat-label">射程</span>
                <span className="info-stat-value">{entity.range}</span>
              </div>
            )}
            {entity.baseMoveSpeed != null && (
              <div className="info-stat">
                <span className="info-stat-label">移速</span>
                <span className="info-stat-value">{entity.baseMoveSpeed}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {isBuilding && entity.attack != null && (
        <div className="info-block">
          <div className="info-stats-grid">
            <div className="info-stat">
              <span className="info-stat-label">攻击</span>
              <span className="info-stat-value">{entity.attack}</span>
            </div>
            <div className="info-stat">
              <span className="info-stat-label">射程</span>
              <span className="info-stat-value">{entity.range}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== 主面板 =====

export default function InfoPanel({ gameState, buildModeState, onBuildModeChange }) {
  const selected = gameState?.selectedEntities || []
  const selectedResource = gameState?.selectedResource || null
  const selectedEnemy = gameState?.selectedEnemy || null

  // 没有选中任何东西
  if (selected.length === 0 && !selectedResource && !selectedEnemy) return null

  const handleActionDone = () => {
    // 取消后不需要额外处理，状态变更会通过 subscribe 自动更新
  }

  // 选中敌方实体（只读信息）
  if (selectedEnemy) {
    return (
      <div className="info-panel">
        <EnemyInfo entity={selectedEnemy} />
      </div>
    )
  }

  // 选中资源
  if (selectedResource) {
    return (
      <div className="info-panel">
        <ResourceInfo resource={selectedResource} />
      </div>
    )
  }

  // 单选建筑
  if (selected.length === 1 && selected[0]?.entityType === 'building') {
    return (
      <div className="info-panel">
        <BuildingInfo
          building={selected[0]}
          buildModeState={buildModeState}
          onBuildModeChange={onBuildModeChange}
          onActionDone={handleActionDone}
          trainingQueues={gameState?.trainingQueues}
        />
      </div>
    )
  }

  // 单选单位
  if (selected.length === 1 && selected[0]?.entityType === 'unit') {
    return (
      <div className="info-panel">
        <UnitInfo
          unit={selected[0]}
          buildModeState={buildModeState}
          onBuildModeChange={onBuildModeChange}
        />
      </div>
    )
  }

  // 多选
  return (
    <div className="info-panel">
      <MultiSelectInfo entities={selected} buildModeState={buildModeState} onBuildModeChange={onBuildModeChange} />
    </div>
  )
}
