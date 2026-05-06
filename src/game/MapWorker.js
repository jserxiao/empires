let generating = false

export function startMapGeneration(cols, rows, seed, onComplete) {
  if (generating) return
  generating = true
  setTimeout(() => {
    import('../core/MapGenerator.js').then(({ generateMap }) => {
      const result = generateMap(cols, rows, seed)
      generating = false
      onComplete(result)
    }).catch(err => {
      console.error('Map generation failed:', err)
      generating = false
    })
  }, 100)
}

export function cancelMapGeneration() {
  generating = false
}
