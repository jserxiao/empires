/**
 * 二叉最小堆 - 用于 A* 寻路的 openSet
 * O(log n) 插入和弹出，替代数组线性查找
 */
export class MinHeap {
  constructor() {
    this.data = []
  }

  get size() {
    return this.data.length
  }

  push(item) {
    this.data.push(item)
    this._bubbleUp(this.data.length - 1)
  }

  pop() {
    if (this.data.length === 0) return undefined
    const top = this.data[0]
    const last = this.data.pop()
    if (this.data.length > 0) {
      this.data[0] = last
      this._sinkDown(0)
    }
    return top
  }

  _bubbleUp(i) {
    const data = this.data
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (data[i].f < data[parent].f) {
        ;[data[i], data[parent]] = [data[parent], data[i]]
        i = parent
      } else {
        break
      }
    }
  }

  _sinkDown(i) {
    const data = this.data
    const len = data.length
    while (true) {
      let smallest = i
      const left = 2 * i + 1
      const right = 2 * i + 2
      if (left < len && data[left].f < data[smallest].f) smallest = left
      if (right < len && data[right].f < data[smallest].f) smallest = right
      if (smallest !== i) {
        ;[data[i], data[smallest]] = [data[smallest], data[i]]
        i = smallest
      } else {
        break
      }
    }
  }
}
