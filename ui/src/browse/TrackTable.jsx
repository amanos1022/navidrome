import { useCallback, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { useTranslate } from 'react-admin'
import {
  Checkbox,
  CircularProgress,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import clsx from 'clsx'
import { formatCell, trackColumns } from './trackColumns'

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    position: 'relative',
  },
  table: {
    tableLayout: 'auto',
  },
  headerCell: {
    whiteSpace: 'nowrap',
    background: theme.palette.background.paper,
    position: 'sticky',
    top: 0,
    zIndex: 2,
    userSelect: 'none',
  },
  cell: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '28em',
    paddingTop: 2,
    paddingBottom: 2,
  },
  row: {
    cursor: 'pointer',
    userSelect: 'none',
  },
  selected: {
    backgroundColor: theme.palette.action.selected,
  },
  playing: {
    fontWeight: 'bold',
  },
  empty: {
    padding: theme.spacing(3),
    textAlign: 'center',
    color: theme.palette.text.secondary,
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: theme.spacing(3),
  },
}))

/**
 * The bottom list: sortable columns, a right-click menu to pick which columns are shown, and
 * click / ctrl+click / shift+click selection, with double click to play.
 */
const TrackTable = ({
  tracks,
  loading,
  sort,
  onSort,
  visibleColumns,
  onToggleColumn,
  selectedIds,
  onSelectionChange,
  onPlay,
}) => {
  const classes = useStyles()
  const translate = useTranslate()
  const [columnMenu, setColumnMenu] = useState(null)
  const lastClicked = useRef(null)

  const columns = useMemo(
    () => trackColumns.filter((c) => visibleColumns.includes(c.source)),
    [visibleColumns],
  )

  const label = useCallback(
    (column) =>
      translate(`resources.song.fields.${column.label}`, { _: column.source }),
    [translate],
  )

  const openColumnMenu = (event) => {
    event.preventDefault()
    setColumnMenu({ top: event.clientY, left: event.clientX })
  }

  const handleRowClick = (event, track, index) => {
    const ids = tracks.map((t) => t.id)
    if (event.shiftKey && lastClicked.current !== null) {
      const from = Math.min(lastClicked.current, index)
      const to = Math.max(lastClicked.current, index)
      onSelectionChange(ids.slice(from, to + 1))
      return
    }
    lastClicked.current = index
    if (event.ctrlKey || event.metaKey) {
      onSelectionChange(
        selectedIds.includes(track.id)
          ? selectedIds.filter((id) => id !== track.id)
          : [...selectedIds, track.id],
      )
      return
    }
    onSelectionChange([track.id])
  }

  const allSelected = tracks.length > 0 && selectedIds.length === tracks.length

  if (loading) {
    return (
      <div className={clsx(classes.root, classes.loading)}>
        <CircularProgress size={28} />
      </div>
    )
  }

  return (
    <div className={classes.root} onContextMenu={openColumnMenu}>
      {tracks.length === 0 ? (
        <Typography className={classes.empty}>
          {translate('ra.navigation.no_results', { _: 'No results found' })}
        </Typography>
      ) : (
        <Table size="small" className={classes.table}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" className={classes.headerCell}>
                <Checkbox
                  color="primary"
                  checked={allSelected}
                  indeterminate={selectedIds.length > 0 && !allSelected}
                  onChange={() =>
                    onSelectionChange(
                      allSelected ? [] : tracks.map((t) => t.id),
                    )
                  }
                />
              </TableCell>
              {columns.map((column) => (
                <TableCell
                  key={column.source}
                  align={column.numeric ? 'right' : 'left'}
                  className={classes.headerCell}
                  sortDirection={
                    sort.field === column.sortBy
                      ? sort.order.toLowerCase()
                      : false
                  }
                >
                  <TableSortLabel
                    active={sort.field === column.sortBy}
                    direction={
                      sort.field === column.sortBy
                        ? sort.order.toLowerCase()
                        : 'asc'
                    }
                    onClick={() => onSort(column.sortBy)}
                  >
                    {label(column)}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {tracks.map((track, index) => (
              <TableRow
                hover
                key={track.id}
                className={clsx(
                  classes.row,
                  selectedIds.includes(track.id) && classes.selected,
                )}
                onClick={(e) => handleRowClick(e, track, index)}
                onDoubleClick={() => onPlay(track.id)}
              >
                <TableCell padding="checkbox">
                  <Checkbox
                    color="primary"
                    checked={selectedIds.includes(track.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() =>
                      onSelectionChange(
                        selectedIds.includes(track.id)
                          ? selectedIds.filter((id) => id !== track.id)
                          : [...selectedIds, track.id],
                      )
                    }
                  />
                </TableCell>
                {columns.map((column) => (
                  <TableCell
                    key={column.source}
                    align={column.numeric ? 'right' : 'left'}
                    className={classes.cell}
                  >
                    {formatCell(column, track)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Menu
        open={columnMenu !== null}
        onClose={() => setColumnMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={columnMenu ?? undefined}
      >
        {trackColumns.map((column) => (
          <MenuItem
            key={column.source}
            dense
            onClick={() => onToggleColumn(column.source)}
          >
            <ListItemIcon>
              <Checkbox
                color="primary"
                edge="start"
                disableRipple
                checked={visibleColumns.includes(column.source)}
              />
            </ListItemIcon>
            <ListItemText primary={label(column)} />
          </MenuItem>
        ))}
      </Menu>
    </div>
  )
}

TrackTable.propTypes = {
  tracks: PropTypes.array.isRequired,
  loading: PropTypes.bool,
  sort: PropTypes.object.isRequired,
  onSort: PropTypes.func.isRequired,
  visibleColumns: PropTypes.array.isRequired,
  onToggleColumn: PropTypes.func.isRequired,
  selectedIds: PropTypes.array.isRequired,
  onSelectionChange: PropTypes.func.isRequired,
  onPlay: PropTypes.func.isRequired,
}

export default TrackTable
