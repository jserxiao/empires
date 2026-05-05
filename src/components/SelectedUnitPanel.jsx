/**
 * 选中单位信息面板 - 屏幕顶部居中
 */
function SelectedUnitPanel({ units }) {
  if (!units || units.length === 0) return null

  if (units.length === 1) {
    const u = units[0]
    return (
      <div className="selected-unit-panel">
        <div className="selected-unit-name">{u.name}</div>
        <div className="selected-unit-hp-bar">
          <div
            className="selected-unit-hp-fill"
            style={{ width: `${(u.hp / u.maxHp) * 100}%` }}
          />
        </div>
        <div className="selected-unit-hp-text">{u.hp} / {u.maxHp}</div>
      </div>
    )
  }

  const totalHp = units.reduce((s, u) => s + u.hp, 0)
  const totalMaxHp = units.reduce((s, u) => s + u.maxHp, 0)

  return (
    <div className="selected-unit-panel">
      <div className="selected-unit-name">已选中 {units.length} 个单位</div>
      <div className="selected-unit-hp-bar">
        <div
          className="selected-unit-hp-fill"
          style={{ width: `${(totalHp / totalMaxHp) * 100}%` }}
        />
      </div>
      <div className="selected-unit-hp-text">{totalHp} / {totalMaxHp}</div>
    </div>
  )
}

export default SelectedUnitPanel
