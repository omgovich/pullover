import type { Category } from '@shared/types'
import { useCallback, useState } from 'react'

export interface SectionCollapse {
  collapsed: Set<Category>
  toggleCategory: (category: Category) => void
}

export function useSectionCollapse(initiallyCollapsed: Category[] = ['waiting']): SectionCollapse {
  const [collapsed, setCollapsed] = useState<Set<Category>>(() => new Set(initiallyCollapsed))

  const toggleCategory = useCallback((category: Category): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }, [])

  return { collapsed, toggleCategory }
}
