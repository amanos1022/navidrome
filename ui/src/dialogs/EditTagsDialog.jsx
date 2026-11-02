import { useCallback, useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { useDataProvider, useNotify, useTranslate } from 'react-admin'
import {
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from '@material-ui/core'
import Autocomplete from '@material-ui/lab/Autocomplete'
import { makeStyles } from '@material-ui/core/styles'
import { httpClient } from '../dataProvider'
import { REST_URL } from '../consts'

const useStyles = makeStyles((theme) => ({
  fields: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(12em, 1fr))',
    gap: theme.spacing(2),
    marginTop: theme.spacing(1),
  },
  wide: {
    gridColumn: '1 / -1',
  },
  warning: {
    color: theme.palette.warning.main,
  },
}))

// The fields the server accepts (see editableTags in the native API). `perTrack` fields would set
// the same value on every selected track, so they are only offered for a single track.
const fields = [
  { source: 'title', label: 'title', perTrack: true },
  { source: 'artist', label: 'artist' },
  { source: 'albumArtist', label: 'albumArtist' },
  { source: 'album', label: 'album' },
  { source: 'year', label: 'year', type: 'number' },
  {
    source: 'trackNumber',
    label: 'trackNumber',
    type: 'number',
    perTrack: true,
  },
  { source: 'discNumber', label: 'discNumber', type: 'number' },
  { source: 'composer', label: 'composer' },
  { source: 'comment', label: 'comment', wide: true },
]

// Reads the field's current value off a track, as a string, so values shared by the whole
// selection can be pre-filled and differing ones left blank.
const valueOf = (record, source) => {
  const value = record?.[source]
  return value === undefined || value === null || value === 0
    ? ''
    : String(value)
}

const sharedValue = (records, source) => {
  if (records.length === 0) return ''
  const first = valueOf(records[0], source)
  return records.every((r) => valueOf(r, source) === first) ? first : ''
}

const genresOf = (record) =>
  record?.genres?.length
    ? record.genres.map((g) => g.name)
    : record?.genre
      ? [record.genre]
      : []

const sharedGenres = (records) => {
  if (records.length === 0) return []
  const first = genresOf(records[0])
  const same = records.every((r) => {
    const current = genresOf(r)
    return (
      current.length === first.length && current.every((g, i) => g === first[i])
    )
  })
  return same ? first : []
}

/**
 * Bulk metadata editor. Only the fields the user actually touches are sent, so a blank field
 * leaves that tag alone; clearing a pre-filled field clears the tag in the files.
 */
const EditTagsDialog = ({ open, records, onClose }) => {
  const classes = useStyles()
  const translate = useTranslate()
  const notify = useNotify()
  const dataProvider = useDataProvider()

  const [values, setValues] = useState({})
  const [genres, setGenres] = useState([])
  const [dirty, setDirty] = useState({})
  const [saving, setSaving] = useState(false)
  const [genreOptions, setGenreOptions] = useState([])

  const single = records.length === 1
  const visibleFields = useMemo(
    () => fields.filter((f) => single || !f.perTrack),
    [single],
  )

  const t = useCallback((key, def) => translate(key, { _: def }), [translate])

  // Reset the form every time the dialog opens, so it always reflects the current selection
  useEffect(() => {
    if (!open) return
    const initial = {}
    for (const field of fields) {
      initial[field.source] = sharedValue(records, field.source)
    }
    setValues(initial)
    setGenres(sharedGenres(records))
    setDirty({})
  }, [open, records])

  useEffect(() => {
    if (!open) return
    let active = true
    dataProvider
      .getList('genre', {
        pagination: { page: 1, perPage: -1 },
        sort: { field: 'name', order: 'ASC' },
        filter: {},
      })
      .then(({ data }) => active && setGenreOptions(data.map((g) => g.name)))
      .catch(() => active && setGenreOptions([]))
    return () => {
      active = false
    }
  }, [dataProvider, open])

  const setField = (source, value) => {
    setValues((prev) => ({ ...prev, [source]: value }))
    setDirty((prev) => ({ ...prev, [source]: true }))
  }

  const changedTags = useMemo(() => {
    const tags = {}
    for (const field of visibleFields) {
      if (dirty[field.source]) {
        const value = (values[field.source] ?? '').trim()
        tags[field.source] = value === '' ? [] : [value]
      }
    }
    if (dirty.genre) {
      tags.genre = genres
    }
    return tags
  }, [dirty, values, genres, visibleFields])

  const handleSave = () => {
    setSaving(true)
    httpClient(`${REST_URL}/song/tags`, {
      method: 'PUT',
      body: JSON.stringify({
        ids: records.map((r) => r.id),
        tags: changedTags,
      }),
    })
      .then(({ json }) => {
        const failed = json.failed?.length || 0
        if (failed > 0) {
          notify(
            translate('browse.tagsPartiallyUpdated', {
              updated: json.updated,
              failed,
              _: 'Updated %{updated} files, %{failed} failed',
            }),
            'warning',
          )
        } else {
          notify(
            translate('browse.tagsUpdated', {
              smart_count: json.updated,
              _: 'Updated %{smart_count} files. Rescanning...',
            }),
            'info',
          )
        }
        setSaving(false)
        onClose(true)
      })
      .catch((e) => {
        setSaving(false)
        // The API answers with a plain-text reason for a rejected request
        const reason =
          typeof e === 'string'
            ? e
            : typeof e.body === 'string' && e.body
              ? e.body
              : e.message
        notify(reason, 'warning')
      })
  }

  const nothingToSave = Object.keys(changedTags).length === 0

  return (
    <Dialog
      open={open}
      onClose={() => onClose(false)}
      fullWidth
      maxWidth="sm"
      aria-labelledby="edit-tags-dialog"
    >
      <DialogTitle id="edit-tags-dialog">
        {single
          ? t('browse.editTags', 'Edit Tags')
          : translate('browse.editTagsCount', {
              smart_count: records.length,
              _: 'Edit tags of %{smart_count} tracks',
            })}
      </DialogTitle>
      <DialogContent>
        <DialogContentText className={classes.warning} variant="body2">
          {t(
            'browse.editTagsWarning',
            'This rewrites the tags in the audio files on disk. Fields left blank are not changed.',
          )}
        </DialogContentText>
        <div className={classes.fields}>
          <Autocomplete
            multiple
            freeSolo
            className={classes.wide}
            options={genreOptions}
            value={genres}
            onChange={(_, value) => {
              setGenres(value)
              setDirty((prev) => ({ ...prev, genre: true }))
            }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  size="small"
                  label={option}
                  {...getTagProps({ index })}
                  key={option}
                />
              ))
            }
            renderInput={(params) => (
              <TextField
                {...params}
                variant="outlined"
                size="small"
                label={t('resources.song.fields.genre', 'Genre')}
                placeholder={
                  !single && sharedGenres(records).length === 0
                    ? t('browse.multipleValues', '(multiple values)')
                    : undefined
                }
              />
            )}
          />
          {visibleFields.map((field) => (
            <TextField
              key={field.source}
              className={field.wide ? classes.wide : undefined}
              variant="outlined"
              size="small"
              type={field.type || 'text'}
              label={translate(`resources.song.fields.${field.label}`, {
                _: field.source,
              })}
              value={values[field.source] ?? ''}
              placeholder={
                !single && sharedValue(records, field.source) === ''
                  ? t('browse.multipleValues', '(multiple values)')
                  : undefined
              }
              onChange={(e) => setField(field.source, e.target.value)}
            />
          ))}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)} disabled={saving}>
          {t('ra.action.cancel', 'Cancel')}
        </Button>
        <Button
          color="primary"
          variant="contained"
          onClick={handleSave}
          disabled={saving || nothingToSave || records.length === 0}
          startIcon={saving ? <CircularProgress size={16} /> : null}
        >
          {t('ra.action.save', 'Save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

EditTagsDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  records: PropTypes.array.isRequired,
  onClose: PropTypes.func.isRequired,
}

export default EditTagsDialog
