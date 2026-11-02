import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import {
  Title,
  useDataProvider,
  useNotify,
  usePermissions,
  useTranslate,
} from 'react-admin'
import { Button, Card, Divider, Typography } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import PlayArrowIcon from '@material-ui/icons/PlayArrow'
import ShuffleIcon from '@material-ui/icons/Shuffle'
import EditIcon from '@material-ui/icons/Edit'
import { playTracks, shuffleTracks } from '../actions'
import { useRefreshOnEvents } from '../common'
import EditTagsDialog from '../dialogs/EditTagsDialog'
import BrowseColumn from './BrowseColumn'
import TrackTable from './TrackTable'
import { useTrackColumns } from './useTrackColumns'

// One page of tracks. The browser is meant for narrowing down, not for scrolling a whole library,
// so instead of paging it loads this many and says how many are left out.
const MAX_TRACKS = 1000

const useStyles = makeStyles((theme) => ({
  root: {
    marginTop: '1em',
    display: 'flex',
    flexDirection: 'column',
    // Fill the viewport below the app bar, so the panes and the list scroll on their own
    height: 'calc(100vh - 11em)',
    minHeight: '30em',
    overflow: 'hidden',
  },
  columns: {
    display: 'flex',
    // A fixed share of the card, so the three panes scroll instead of pushing the track list down
    height: '35%',
    minHeight: '10em',
    flexShrink: 0,
    overflow: 'hidden',
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  toolbar: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(0.5, 1.5),
    flexWrap: 'wrap',
  },
  spacer: {
    flex: 1,
  },
}))

const emptyList = []

const ItunesBrowse = () => {
  const classes = useStyles()
  const translate = useTranslate()
  const dataProvider = useDataProvider()
  const notify = useNotify()
  const dispatch = useDispatch()
  const { permissions } = usePermissions()
  const isAdmin = permissions === 'admin'

  const [genre, setGenre] = useState(null)
  const [artist, setArtist] = useState(null)
  const [album, setAlbum] = useState(null)
  const [sort, setSort] = useState({ field: 'album', order: 'ASC' })
  const [visibleColumns, toggleColumn] = useTrackColumns()
  const [selectedIds, setSelectedIds] = useState(emptyList)
  const [editOpen, setEditOpen] = useState(false)

  const [genres, setGenres] = useState(emptyList)
  const [artists, setArtists] = useState(emptyList)
  const [albums, setAlbums] = useState(emptyList)
  const [tracks, setTracks] = useState(emptyList)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState({
    genres: true,
    artists: true,
    albums: true,
    tracks: true,
  })
  const [reloadToken, setReloadToken] = useState(0)
  const reload = useCallback(() => setReloadToken((t) => t + 1), [])

  // A tag edit is applied by rescanning the affected folders, so the lists are refreshed when the
  // scanner reports the songs it touched.
  useRefreshOnEvents({
    events: ['song', 'album', 'artist', 'tag'],
    onRefresh: reload,
  })

  const t = useCallback((key, def) => translate(key, { _: def }), [translate])

  const onError = useCallback(
    (e) => notify(typeof e === 'string' ? e : e.message, 'warning'),
    [notify],
  )

  const setLoadingFor = useCallback(
    (key, value) => setLoading((prev) => ({ ...prev, [key]: value })),
    [],
  )

  // Genres: the leftmost pane never narrows, so it is loaded once
  useEffect(() => {
    let active = true
    setLoadingFor('genres', true)
    dataProvider
      .getList('genre', {
        pagination: { page: 1, perPage: -1 },
        sort: { field: 'name', order: 'ASC' },
        filter: {},
      })
      .then(({ data }) => {
        if (!active) return
        setGenres(data)
        setLoadingFor('genres', false)
      })
      .catch((e) => {
        if (!active) return
        onError(e)
        setLoadingFor('genres', false)
      })
    return () => {
      active = false
    }
  }, [dataProvider, onError, setLoadingFor, reloadToken])

  useEffect(() => {
    let active = true
    setLoadingFor('artists', true)
    dataProvider
      .getList('artist', {
        pagination: { page: 1, perPage: -1 },
        sort: { field: 'name', order: 'ASC' },
        filter: { role: 'albumartist', ...(genre && { genre_id: genre }) },
      })
      .then(({ data }) => {
        if (!active) return
        setArtists(data)
        setLoadingFor('artists', false)
      })
      .catch((e) => {
        if (!active) return
        onError(e)
        setLoadingFor('artists', false)
      })
    return () => {
      active = false
    }
  }, [dataProvider, genre, onError, setLoadingFor, reloadToken])

  useEffect(() => {
    let active = true
    setLoadingFor('albums', true)
    dataProvider
      .getList('album', {
        pagination: { page: 1, perPage: -1 },
        sort: { field: 'name', order: 'ASC' },
        filter: {
          ...(genre && { genre_id: genre }),
          ...(artist && { artist_id: artist }),
        },
      })
      .then(({ data }) => {
        if (!active) return
        setAlbums(data)
        setLoadingFor('albums', false)
      })
      .catch((e) => {
        if (!active) return
        onError(e)
        setLoadingFor('albums', false)
      })
    return () => {
      active = false
    }
  }, [dataProvider, genre, artist, onError, setLoadingFor, reloadToken])

  useEffect(() => {
    let active = true
    setLoadingFor('tracks', true)
    dataProvider
      .getList('song', {
        pagination: { page: 1, perPage: MAX_TRACKS },
        sort,
        filter: {
          ...(genre && { genre_id: genre }),
          ...(artist && { artists_id: artist }),
          ...(album && { album_id: album }),
        },
      })
      .then(({ data, total: count }) => {
        if (!active) return
        setTracks(data)
        setTotal(count ?? data.length)
        setLoadingFor('tracks', false)
      })
      .catch((e) => {
        if (!active) return
        onError(e)
        setLoadingFor('tracks', false)
      })
    return () => {
      active = false
    }
  }, [
    dataProvider,
    genre,
    artist,
    album,
    sort,
    onError,
    setLoadingFor,
    reloadToken,
  ])

  // Narrowing one pane resets the panes to its right, like iTunes does
  const selectGenre = (id) => {
    setGenre(id)
    setArtist(null)
    setAlbum(null)
    setSelectedIds(emptyList)
  }
  const selectArtist = (id) => {
    setArtist(id)
    setAlbum(null)
    setSelectedIds(emptyList)
  }
  const selectAlbum = (id) => {
    setAlbum(id)
    setSelectedIds(emptyList)
  }

  const handleSort = (field) =>
    setSort((prev) =>
      prev.field === field
        ? { field, order: prev.order === 'ASC' ? 'DESC' : 'ASC' }
        : { field, order: 'ASC' },
    )

  const trackMap = useMemo(
    () => Object.fromEntries(tracks.map((track) => [track.id, track])),
    [tracks],
  )
  const playableIds = useMemo(
    () => (selectedIds.length > 1 ? selectedIds : tracks.map((t) => t.id)),
    [selectedIds, tracks],
  )

  const trackIds = useMemo(() => tracks.map((track) => track.id), [tracks])

  const playFrom = (id) => dispatch(playTracks(trackMap, trackIds, id))
  const playAll = () =>
    playableIds.length && dispatch(playTracks(trackMap, playableIds))
  const shuffleAll = () =>
    playableIds.length && dispatch(shuffleTracks(trackMap, playableIds))

  // Memoized: the dialog resets its form whenever the selection it is given changes
  const selectedRecords = useMemo(
    () => selectedIds.map((id) => trackMap[id]).filter(Boolean),
    [selectedIds, trackMap],
  )

  return (
    <Card className={classes.root}>
      <Title title={`Navidrome - ${t('menu.browse', 'iTunes Browse')}`} />

      <div className={classes.columns}>
        <BrowseColumn
          title={t('resources.song.fields.genre', 'Genre')}
          items={genres}
          selected={genre}
          onSelect={selectGenre}
          loading={loading.genres}
        />
        <BrowseColumn
          title={translate('resources.artist.name', {
            smart_count: 2,
            _: 'Artists',
          })}
          items={artists}
          selected={artist}
          onSelect={selectArtist}
          loading={loading.artists}
        />
        <BrowseColumn
          title={translate('resources.album.name', {
            smart_count: 2,
            _: 'Albums',
          })}
          items={albums}
          selected={album}
          onSelect={selectAlbum}
          loading={loading.albums}
        />
      </div>

      <div className={classes.toolbar}>
        <Button
          size="small"
          variant="contained"
          color="primary"
          startIcon={<PlayArrowIcon />}
          disabled={tracks.length === 0}
          onClick={playAll}
        >
          {t('resources.song.actions.playAll', 'Play')}
        </Button>
        <Button
          size="small"
          startIcon={<ShuffleIcon />}
          disabled={tracks.length === 0}
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
        <div className={classes.spacer} />
        <Typography variant="caption" color="textSecondary">
          {selectedIds.length > 0 &&
            `${translate('browse.selected', {
              smart_count: selectedIds.length,
              _: '%{smart_count} selected',
            })} · `}
          {total > tracks.length
            ? translate('browse.showingFirst', {
                shown: tracks.length,
                total,
                _: 'showing first %{shown} of %{total}',
              })
            : translate('browse.trackCount', {
                smart_count: tracks.length,
                _: '%{smart_count} tracks',
              })}
        </Typography>
      </div>

      <Divider />

      <TrackTable
        tracks={tracks}
        loading={loading.tracks}
        sort={sort}
        onSort={handleSort}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onPlay={playFrom}
      />

      <EditTagsDialog
        open={editOpen}
        records={selectedRecords}
        onClose={() => setEditOpen(false)}
      />
    </Card>
  )
}

export default ItunesBrowse
