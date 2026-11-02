import { useMemo } from 'react'
import { Redirect, useHistory, useLocation } from 'react-router-dom'
import {
  Datagrid,
  DatagridBody,
  DatagridRow,
  Filter,
  FunctionField,
  NumberField,
  SearchInput,
  SelectInput,
  TextField,
  useRefresh,
  useTranslate,
  useVersion,
  NullableBooleanInput,
  usePermissions,
} from 'react-admin'
import { useMediaQuery, withWidth } from '@material-ui/core'
import FavoriteIcon from '@material-ui/icons/Favorite'
import FavoriteBorderIcon from '@material-ui/icons/FavoriteBorder'
import { makeStyles } from '@material-ui/core/styles'
import { useDrag } from 'react-dnd'
import clsx from 'clsx'
import {
  ArtistContextMenu,
  ArtworkAvatar,
  List,
  Title,
  useGetHandleArtistClick,
  RatingField,
  useSelectedFields,
  useResourceRefresh,
} from '../common'
import config from '../config'
import ArtistListActions from './ArtistListActions'
import ArtistSimpleList from './ArtistSimpleList'
import { DraggableTypes } from '../consts'
import en from '../i18n/en.json'
import { formatBytes } from '../utils/index.js'

const useStyles = makeStyles({
  contextHeader: {
    marginLeft: '3px',
    marginTop: '-2px',
    verticalAlign: 'text-top',
  },
  row: {
    '& td': {
      paddingTop: '4px !important',
      paddingBottom: '4px !important',
    },
    '&:hover': {
      '& $contextMenu': {
        visibility: 'visible',
      },
      '& $ratingField': {
        visibility: 'visible',
      },
    },
  },
  missingRow: {
    opacity: 0.3,
  },
  contextMenu: {
    visibility: 'hidden',
  },
  ratingField: {
    visibility: 'hidden',
  },
})

const ArtistFilter = (props) => {
  const translate = useTranslate()
  const { permissions } = usePermissions()
  const isAdmin = permissions === 'admin'
  const rolesObj = en?.resources?.artist?.roles
  const roles = Object.keys(rolesObj).reduce((acc, role) => {
    acc.push({
      id: role,
      name: translate(`resources.artist.roles.${role}`, {
        smart_count: 2,
      }),
    })
    return acc
  }, [])
  roles?.sort((a, b) => a.name.localeCompare(b.name))
  return (
    <Filter {...props} variant={'outlined'}>
      <SearchInput id="search" source="name" alwaysOn />
      <SelectInput source="role" choices={roles} alwaysOn />
      {config.enableFavourites && (
        <NullableBooleanInput
          source="starred"
          label={<FavoriteIcon fontSize={'small'} />}
        />
      )}
      {isAdmin && <NullableBooleanInput source="missing" />}
    </Filter>
  )
}

const ArtistDatagridRow = (props) => {
  const { record } = props
  const [, dragArtistRef] = useDrag(
    () => ({
      type: DraggableTypes.ARTIST,
      item: { artistIds: [record?.id] },
      options: { dropEffect: 'copy' },
    }),
    [record],
  )
  const classes = useStyles()
  const computedClasses = clsx(
    props.className,
    classes.row,
    record?.missing && classes.missingRow,
  )
  return (
    <DatagridRow ref={dragArtistRef} {...props} className={computedClasses} />
  )
}

const ArtistDatagridBody = (props) => (
  <DatagridBody {...props} row={<ArtistDatagridRow />} />
)

const ArtistDatagrid = (props) => (
  <Datagrid {...props} body={<ArtistDatagridBody />} />
)

const ArtistListView = ({
  hasShow,
  hasEdit,
  hasList,
  width,
  showGenres,
  ...rest
}) => {
  const { filterValues } = rest
  const classes = useStyles()
  const handleArtistLink = useGetHandleArtistClick(width)
  const history = useHistory()
  const isXsmall = useMediaQuery((theme) => theme.breakpoints.down('xs'))
  useResourceRefresh('artist')

  const role = filterValues?.role
  const getCounter = (record, counter) => {
    if (!record) return undefined
    return role ? record?.stats?.[role]?.[counter] : record?.[counter]
  }
  const getAlbumCount = (record) => getCounter(record, 'albumCount')
  const getSongCount = (record) => getCounter(record, 'songCount')
  const getSize = (record) => {
    const size = getCounter(record, 'size')
    return size ? formatBytes(size) : '0 MB'
  }

  const toggleableFields = useMemo(
    () => ({
      playCount: <NumberField source="playCount" sortByOrder={'DESC'} />,
      rating: config.enableStarRating && (
        <RatingField
          source="rating"
          sortByOrder={'DESC'}
          resource={'artist'}
          className={classes.ratingField}
        />
      ),
    }),
    [classes.ratingField],
  )

  const columns = useSelectedFields({
    resource: 'artist',
    columns: toggleableFields,
  })

  return isXsmall ? (
    <ArtistSimpleList
      linkType={(id) => history.push(handleArtistLink(id))}
      {...rest}
    />
  ) : (
    <ArtistDatagrid rowClick={handleArtistLink} classes={{ row: classes.row }}>
      <ArtworkAvatar source="id" />
      <TextField source="name" />
      <FunctionField
        source="albumCount"
        sortByOrder={'DESC'}
        render={getAlbumCount}
      />
      <FunctionField
        source="songCount"
        sortByOrder={'DESC'}
        render={getSongCount}
      />
      <FunctionField source="size" sortByOrder={'DESC'} render={getSize} />
      {showGenres && (
        <FunctionField
          source="genres"
          sortable={false}
          render={(record) => record?.genres?.map((g) => g.name).join(', ')}
        />
      )}
      {columns}
      <ArtistContextMenu
        source={'starred_at'}
        sortByOrder={'DESC'}
        sortable={config.enableFavourites}
        className={classes.contextMenu}
        label={
          config.enableFavourites && (
            <FavoriteBorderIcon
              fontSize={'small'}
              className={classes.contextHeader}
            />
          )
        }
      />
    </ArtistDatagrid>
  )
}

const ArtistListTitle = () => {
  const translate = useTranslate()
  const name = translate('resources.artist.name', { smart_count: 2 })
  const listTitle = translate('resources.artist.lists.random', { _: 'Random' })
  return <Title subTitle={`${name} - ${listTitle}`} args={{ smart_count: 2 }} />
}

const randomStartingSeed = Math.random().toString()

const ArtistList = (props) => {
  const location = useLocation()
  const version = useVersion()
  const refresh = useRefresh()
  // Same shape as the album lists: /artist/random renders this list with a random sort, and the
  // seed keeps the shuffle stable while paging, rerolling only on an explicit refresh.
  const isRandom = location.pathname === '/artist/random'
  const seed = `${randomStartingSeed}-${version}`

  // Coming from the menu there are no params yet: reroll and redirect to the sorted URL.
  if (isRandom && !location.search) {
    refresh()
    return (
      <Redirect
        to={`/artist/random?sort=random&order=ASC&filter=${encodeURIComponent(
          JSON.stringify({ role: 'albumartist' }),
        )}`}
      />
    )
  }

  return (
    <>
      <List
        {...props}
        sort={
          isRandom
            ? { field: 'random', order: 'ASC' }
            : { field: 'name', order: 'ASC' }
        }
        exporter={false}
        bulkActionButtons={false}
        filters={<ArtistFilter />}
        filterDefaultValues={{ role: 'albumartist' }}
        actions={<ArtistListActions />}
        {...(isRandom && {
          filter: { seed },
          title: <ArtistListTitle />,
        })}
      >
        <ArtistListView {...props} showGenres={isRandom} />
      </List>
    </>
  )
}

const ArtistListWithWidth = withWidth()(ArtistList)

export default ArtistListWithWidth
