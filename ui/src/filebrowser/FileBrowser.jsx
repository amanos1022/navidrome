import React, { useCallback, useEffect, useState } from 'react'
import { useParams, useHistory } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import {
  Title,
  Loading,
  useDataProvider,
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
import MusicNoteIcon from '@material-ui/icons/MusicNote'
import HomeIcon from '@material-ui/icons/Home'
import ArrowUpwardIcon from '@material-ui/icons/ArrowUpward'
import PlayArrowIcon from '@material-ui/icons/PlayArrow'
import ShuffleIcon from '@material-ui/icons/Shuffle'
import { playTracks, shuffleTracks } from '../actions'
import { formatDuration } from '../utils/formatters'

const useStyles = makeStyles((theme) => ({
  root: { marginTop: '1em', padding: theme.spacing(1, 2, 2, 2) },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    padding: theme.spacing(1, 0),
  },
  actions: { display: 'flex', gap: theme.spacing(1) },
  crumb: { display: 'flex', alignItems: 'center' },
  empty: { padding: theme.spacing(2), color: theme.palette.text.secondary },
  duration: {
    color: theme.palette.text.secondary,
    marginLeft: theme.spacing(2),
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

  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(null)
  const [folders, setFolders] = useState([])
  const [songs, setSongs] = useState([])

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
  }, [folderId, dataProvider, notify])

  const songMap = useCallback(
    () => Object.fromEntries(songs.map((s) => [s.id, s])),
    [songs],
  )
  const songIds = songs.map((s) => s.id)

  const openFolder = (f) => history.push(`/files/${f.id}`)

  const playFrom = (id) => {
    if (songs.length === 0) return
    dispatch(playTracks(songMap(), songIds, id))
  }
  const playAll = () => songs.length && dispatch(playTracks(songMap(), songIds))
  const shuffleAll = () =>
    songs.length && dispatch(shuffleTracks(songMap(), songIds))

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
        <List dense>
          {folders.map((f) => (
            <ListItem button key={f.id} onClick={() => openFolder(f)}>
              <ListItemIcon>
                <FolderIcon />
              </ListItemIcon>
              <ListItemText primary={f.name} />
            </ListItem>
          ))}
          {songs.map((s) => (
            <ListItem button key={s.id} onClick={() => playFrom(s.id)}>
              <ListItemIcon>
                <MusicNoteIcon />
              </ListItemIcon>
              <ListItemText
                primary={s.title}
                secondary={[s.artist, s.album].filter(Boolean).join(' • ')}
              />
              {s.duration != null && (
                <span className={classes.duration}>
                  {formatDuration(s.duration)}
                </span>
              )}
            </ListItem>
          ))}
        </List>
      )}
    </Card>
  )
}

export default FileBrowser
