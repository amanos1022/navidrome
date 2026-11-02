import { formatBytes, formatDuration } from '../utils/formatters'

// The columns the track list can show. `sortBy` is the field sent to the API (a sort the server
// does not know is better left unsortable than silently ignored), and `numeric` right-aligns the
// cell, as a number column reads better aligned on its last digit.
export const trackColumns = [
  {
    source: 'trackNumber',
    label: 'trackNumber',
    sortBy: 'track_number',
    numeric: true,
  },
  {
    source: 'discNumber',
    label: 'discNumber',
    sortBy: 'disc_number',
    numeric: true,
  },
  { source: 'title', label: 'title', sortBy: 'title' },
  { source: 'artist', label: 'artist', sortBy: 'artist' },
  { source: 'albumArtist', label: 'albumArtist', sortBy: 'album_artist' },
  { source: 'album', label: 'album', sortBy: 'album' },
  {
    source: 'genre',
    label: 'genre',
    sortBy: 'genre',
    // A track can carry several genres; `genre` alone would only show the first
    format: (record) =>
      record.genres?.length
        ? record.genres.map((g) => g.name).join(', ')
        : record.genre || '',
  },
  { source: 'year', label: 'year', sortBy: 'year', numeric: true },
  {
    source: 'duration',
    label: 'duration',
    sortBy: 'duration',
    numeric: true,
    format: (record) => formatDuration(record.duration),
  },
  {
    source: 'playCount',
    label: 'playCount',
    sortBy: 'play_count',
    numeric: true,
  },
  { source: 'bpm', label: 'bpm', sortBy: 'bpm', numeric: true },
  { source: 'channels', label: 'channels', sortBy: 'channels', numeric: true },
  {
    source: 'bitRate',
    label: 'bitRate',
    sortBy: 'bit_rate',
    numeric: true,
    format: (record) => (record.bitRate ? `${record.bitRate} kbps` : ''),
  },
  {
    source: 'size',
    label: 'size',
    sortBy: 'size',
    numeric: true,
    format: (record) => (record.size ? formatBytes(record.size) : ''),
  },
  { source: 'comment', label: 'comment', sortBy: 'comment' },
  { source: 'path', label: 'path', sortBy: 'path' },
]

export const defaultVisibleColumns = [
  'trackNumber',
  'title',
  'artist',
  'album',
  'genre',
  'year',
  'duration',
]

export const browseColumnsKey = 'browse.columns'
export const filesColumnsKey = 'files.columns'

export const getStoredColumns = (storageKey = browseColumnsKey) => {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey))
    if (!Array.isArray(stored) || stored.length === 0) {
      return defaultVisibleColumns
    }
    // Drop anything that is no longer a column, so a renamed source can't hide the whole list
    const known = stored.filter((source) =>
      trackColumns.some((c) => c.source === source),
    )
    return known.length > 0 ? known : defaultVisibleColumns
  } catch {
    return defaultVisibleColumns
  }
}

export const setStoredColumns = (columns, storageKey = browseColumnsKey) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(columns))
  } catch {
    // Private windows and blocked site data: the choice just won't be remembered
  }
}

export const formatCell = (column, record) => {
  if (column.format) {
    return column.format(record)
  }
  const value = record[column.source]
  return value === undefined || value === null || value === 0 ? '' : value
}

// Toggling a column keeps the canonical column order, and never hides the last one: an empty
// table has nothing left to right-click on.
export const toggleColumn = (columns, source) => {
  const shown = new Set(columns)
  if (shown.has(source)) {
    shown.delete(source)
  } else {
    shown.add(source)
  }
  const next = trackColumns
    .filter((c) => shown.has(c.source))
    .map((c) => c.source)
  return next.length > 0 ? next : columns
}

// Comparator for lists sorted in the browser (the file browser loads one folder at a time, so
// there is no server-side sort to defer to). Numbers compare numerically, everything else by the
// text the cell shows, and empty values always sort last.
export const compareBy = (sortBy, order) => {
  const column = trackColumns.find((c) => c.sortBy === sortBy)
  if (!column) {
    return () => 0
  }
  const direction = order === 'DESC' ? -1 : 1
  const valueOf = (record) =>
    column.numeric
      ? (record[column.source] ?? null)
      : String(formatCell(column, record)).toLowerCase()

  return (a, b) => {
    const left = valueOf(a)
    const right = valueOf(b)
    if (left === right) return 0
    if (left === null || left === '') return 1
    if (right === null || right === '') return -1
    return (
      (column.numeric ? left - right : String(left).localeCompare(right)) *
      direction
    )
  }
}
