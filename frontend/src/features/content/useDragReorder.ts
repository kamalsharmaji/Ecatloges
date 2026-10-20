import { useState } from 'react'
import { moveItem } from '@/features/content/reorder'

/**
 * Minimal HTML5 drag-and-drop reordering for lists/grids (no dependency).
 * Spread `itemProps(index)` on each draggable element; keyboard users get move up/down buttons separately.
 */
export function useDragReorder<T>(items: T[], onReorder: (next: T[]) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const move = (from: number, to: number) => {
    const next = moveItem(items, from, to)
    if (next !== items) onReorder(next)
  }

  const itemProps = (index: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDragIndex(index)
      e.dataTransfer.effectAllowed = 'move'
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      setOverIndex(index)
    },
    onDragEnd: () => {
      setDragIndex(null)
      setOverIndex(null)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      if (dragIndex !== null) move(dragIndex, index)
      setDragIndex(null)
      setOverIndex(null)
    },
  })

  return { itemProps, move, dragIndex, overIndex }
}
