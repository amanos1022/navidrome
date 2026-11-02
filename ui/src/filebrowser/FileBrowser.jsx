import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useHistory } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import {
  Title,
  Loading,
  useDataProvider,
  usePermissions,
  useTranslate,
  useNotify,
} from 'react-admin'
import {
  Card,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Breadcrumbs,
  Link,
  Button,
  Divider,
  Typography,
} from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import FolderIcon from '@material-ui/icons/Folder'
import HomeIcon from '@material-ui/icons/Home'
import ArrowUpwardIcon from '@material-ui/icons/ArrowUpward'
import PlayArrowIcon from '@material-ui/icons/PlayArrow'
import ShuffleIcon from '@material-ui/icons/Shuffle'
import EditIcon from '@material-ui/icons/Edit'
import { playTracks, shuffleTracks } from '../actions'
import { useRefreshOnEvents } from '../common'
import EditTagsDialog from '../dialogs/EditTagsDialog'
import TrackTable from '../browse/TrackTable'
import { useTrackColumns } from '../browse/useTrackColumns'
import { compareBy, filesColumnsKey } from '../browse/trackColumns'

const useStyles = makeStyles((theme) => ({
  root: {
    marginTop: '1em',
    display: 'flex',
    flexDirection: 'column',
    // Fill the viewport below the app bar, so the folders and the tracks scroll on their own
    height: 'calc(100vh - 11em)',
    minHeight: '30em',
    overflow: 'hidden',
    padding: theme.spacing(1, 2, 0, 2),
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    flexShrink: 0,
    gap: theme.spacing(1),
    padding: theme.spacing(1, 0),
  },
  actions: { display: 'flex', gap: theme.spacing(1) },
  crumb: { display: 'flex', alignItems: 'center' },
  empty: { padding: theme.spacing(2), color: theme.palette.text.secondary },
  folders: {
    overflowY: 'auto',
    flexShrink: 0,
  },
  // With tracks below, the folders take at most a third of the card; on their own they take it all
  foldersSplit: {
    maxHeight: '33%',
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  foldersOnly: {
    flex: 1,
    minHeight: 0,
  },
}))

const PER_PAGE = 1000

const FileBrowser = () => {
  const classes = useStyles()
  const translate = useTranslate()
  const dataProvider = useDataProvider()
  const notify = useNotify()
  const dispatch = useDispatch()
  const history = useHistory()
  const { folderId } = useParams()
  const { permissions } = usePermissions()
  const isAdmin = permissions === 'admin'

  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(null)
  const [folders, setFolders] = useState([])
  const [songs, setSongs] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [editOpen, setEditOpen] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  // Files in a folder are usually one album, so track order is the useful default
  const [sort, setSort] = useState({ field: 'track_number', order: 'ASC' })
  const [visibleColumns, toggleColumn] = useTrackColumns(filesColumnsKey)

  // A tag edit is applied by rescanning the folder, so reload once the scanner reports the songs
  // it touched
  useRefreshOnEvents({
    events: ['song'],
    onRefresh: useCallback(() => setReloadToken((t) => t + 1), []),
  })

  const t = (key, def) => translate(key, { _: def })

  useEffect(() => {
    let active = true
    setLoading(true)

    const loadCurrent = folderId
      ? dataProvider.getOne('folder', { id: folderId }).then((r) => r.data)
      : Promise.resolve(null)

    const loadFolders = dataProvider
      .getList('folder', {
        pagination: { page: 1, perPage: PER_PAGE },
        sort: { field: 'name', order: 'ASC' },
        filter: { parent_id: folderId || 'root' },
      })
      .then((r) => r.data)

    const loadSongs = folderId
      ? dataProvider
          .getList('song', {
            pagination: { page: 1, perPage: PER_PAGE },
            sort: { field: 'path', order: 'ASC' },
            filter: { folder_id: folderId },
          })
          .then((r) => r.data)
      : Promise.resolve([])

    Promise.all([loadCurrent, loadFolders, loadSongs])
      .then(([cur, fs, ss]) => {
        if (!active) return
        setCurrent(cur)
        setFolders(fs)
        setSongs(ss)
        setSelectedIds([])
        setLoading(false)
      })
      .catch((e) => {
        if (!active) return
        notify(typeof e === 'string' ? e : e.message, 'warning')
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [folderId, dataProvider, notify, reloadToken])

  // The folder holds at most one page of songs, so the list is sorted here instead of asking
  // the server for every column click
  const sortedSongs = useMemo(
    () => [...songs].sort(compareBy(sort.field, sort.order)),
    [songs, sort],
  )

  const songMap = useMemo(
    () => Object.fromEntries(songs.map((s) => [s.id, s])),
    [songs],
  )
  const songIds = useMemo(() => sortedSongs.map((s) => s.id), [sortedSongs])

  const openFolder = (f) => history.push(`/files/${f.id}`)

  const handleSort = (field) =>
    setSort((prev) =>
      prev.field === field
        ? { field, order: prev.order === 'ASC' ? 'DESC' : 'ASC' }
        : { field, order: 'ASC' },
    )

  const playFrom = (id) => {
    if (songs.length === 0) return
    dispatch(playTracks(songMap, songIds, id))
  }
  const playAll = () => songs.length && dispatch(playTracks(songMap, songIds))
  const shuffleAll = () =>
    songs.length && dispatch(shuffleTracks(songMap, songIds))

  // Memoized: the dialog resets its form whenever the selection it is given changes
  const selectedRecords = useMemo(
    () => songs.filter((s) => selectedIds.includes(s.id)),
    [songs, selectedIds],
  )

  const goUp = () => {
    if (!current) return
    // Top-level folders have Path === '.', so their parent is a library root:
    // go back to the root listing instead of showing the "." root folder.
    if (current.path === '.' || !current.parentId) {
      history.push('/files')
    } else {
      history.push(`/files/${current.parentId}`)
    }
  }

  const currentPath = current
    ? current.path && current.path !== '.'
      ? `${current.path}/${current.name}`
      : current.name
    : null

  return (
    <Card className={classes.root}>
      <Title title={`Navidrome - ${t('menu.files', 'Files')}`} />

      <div className={classes.header}>
        <Breadcrumbs aria-label="breadcrumb">
          <Link
            component="button"
            color="inherit"
            className={classes.crumb}
            onClick={() => history.push('/files')}
          >
            <HomeIcon fontSize="small" />
            &nbsp;{t('menu.files', 'Files')}
          </Link>
          {currentPath && (
            <Typography color="textPrimary">{currentPath}</Typography>
          )}
        </Breadcrumbs>

        <div className={classes.actions}>
          {folderId && (
            <Button size="small" startIcon={<ArrowUpwardIcon />} onClick={goUp}>
              {t('ra.action.back', 'Up')}
            </Button>
          )}
          {songs.length > 0 && (
            <>
              <Button
                size="small"
                variant="contained"
                color="primary"
                startIcon={<PlayArrowIcon />}
                onClick={playAll}
              >
                {t('resources.song.actions.playAll', 'Play')}
              </Button>
              <Button
                size="small"
                startIcon={<ShuffleIcon />}
                onClick={shuffleAll}
              >
                {t('resources.song.actions.shuffle', 'Shuffle')}
              </Button>
              {isAdmin && (
                <Button
                  size="small"
                  startIcon={<EditIcon />}
                  disabled={selectedIds.length === 0}
                  onClick={() => setEditOpen(true)}
                >
                  {t('browse.editTags', 'Edit Tags')}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <Divider />

      {loading ? (
        <Loading />
      ) : folders.length === 0 && songs.length === 0 ? (
        <div className={classes.empty}>
          {t('ra.navigation.no_results', 'Empty')}
        </div>
      ) : (
        <>
          {folders.length > 0 && (
            <List
              dense
              className={`${classes.folders} ${
                songs.length > 0 ? classes.foldersSplit : classes.foldersOnly
              }`}
            >
              {folders.map((f) => (
                <ListItem button key={f.id} onClick={() => openFolder(f)}>
                  <ListItemIcon>
                    <FolderIcon />
                  </ListItemIcon>
                  <ListItemText primary={f.name} />
                </ListItem>
              ))}
            </List>
          )}
          {songs.length > 0 && (
            <TrackTable
              tracks={sortedSongs}
              sort={sort}
              onSort={handleSort}
              visibleColumns={visibleColumns}
              onToggleColumn={toggleColumn}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onPlay={playFrom}
            />
          )}
        </>
      )}

      <EditTagsDialog
        open={editOpen}
        records={selectedRecords}
        onClose={() => setEditOpen(false)}
      />
    </Card>
  )
}

export default FileBrowser
