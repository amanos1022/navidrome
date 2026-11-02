import { useCallback, useEffect, useState } from 'react'
import {
  browseColumnsKey,
  getStoredColumns,
  setStoredColumns,
  toggleColumn,
} from './trackColumns'

/**
 * The columns a track list shows, remembered per list (the browser and the file browser keep
 * their own choice under different keys).
 */
export const useTrackColumns = (storageKey = browseColumnsKey) => {
  const [visibleColumns, setVisibleColumns] = useState(() =>
    getStoredColumns(storageKey),
  )

  useEffect(
    () => setStoredColumns(visibleColumns, storageKey),
    [visibleColumns, storageKey],
  )

  const handleToggleColumn = useCallback(
    (source) => setVisibleColumns((prev) => toggleColumn(prev, source)),
    [],
  )

  return [visibleColumns, handleToggleColumn]
}
