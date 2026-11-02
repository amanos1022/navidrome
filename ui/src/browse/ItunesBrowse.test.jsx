import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import ItunesBrowse from './ItunesBrowse'

const getList = vi.fn()
// Stable identities, like the real hooks: a new function on every render would make the loading
// effects re-run forever
const notify = vi.fn()
const dataProvider = { getList }
const translate = (key, options) => options?._ ?? key

vi.mock('react-admin', () => ({
  Title: () => null,
  useTranslate: () => translate,
  useNotify: () => notify,
  useDataProvider: () => dataProvider,
  usePermissions: () => ({ permissions: 'admin' }),
}))

const dispatch = vi.fn()
vi.mock('react-redux', () => ({ useDispatch: () => dispatch }))

vi.mock('../common', () => ({ useRefreshOnEvents: () => {} }))

vi.mock('../dialogs/EditTagsDialog', () => ({ default: () => null }))

const page = (data) => Promise.resolve({ data, total: data.length })

const responses = {
  genre: [
    { id: 'g1', name: 'Jazz' },
    { id: 'g2', name: 'Rock' },
  ],
  artist: [{ id: 'ar1', name: 'Miles Davis' }],
  album: [{ id: 'al1', name: 'Kind of Blue' }],
  song: [
    {
      id: 's1',
      title: 'So What',
      artist: 'Miles Davis',
      album: 'Kind of Blue',
      trackNumber: 1,
      year: 1959,
      duration: 545,
      genres: [{ id: 'g1', name: 'Jazz' }],
    },
  ],
}

describe('<ItunesBrowse />', () => {
  beforeEach(() => {
    localStorage.clear()
    getList.mockReset()
    getList.mockImplementation((resource) => page(responses[resource] ?? []))
  })
  afterEach(cleanup)

  const lastCallFor = (resource) =>
    getList.mock.calls.filter((c) => c[0] === resource).at(-1)[1]

  // The panes are rendered above the track list, so a name shared with a track cell is matched
  // first in the pane
  const paneRow = (name) => screen.getAllByText(name)[0]

  it('shows the three panes and the tracks', async () => {
    render(<ItunesBrowse />)
    await waitFor(() => expect(paneRow('Jazz')).not.toBeNull())
    expect(paneRow('Miles Davis')).not.toBeNull()
    expect(paneRow('Kind of Blue')).not.toBeNull()
    expect(screen.getByText('So What')).not.toBeNull()
    // The genre column renders every genre of the track
    expect(screen.getAllByText('Jazz').length).toBeGreaterThan(1)
  })

  it('narrows the other panes by the genre picked', async () => {
    render(<ItunesBrowse />)
    await waitFor(() => expect(paneRow('Jazz')).not.toBeNull())
    fireEvent.click(paneRow('Jazz'))

    await waitFor(() =>
      expect(lastCallFor('artist').filter).toEqual({
        role: 'albumartist',
        genre_id: 'g1',
      }),
    )
    expect(lastCallFor('album').filter).toEqual({ genre_id: 'g1' })
    expect(lastCallFor('song').filter).toEqual({ genre_id: 'g1' })
  })

  it('narrows the tracks by artist and album', async () => {
    render(<ItunesBrowse />)
    await waitFor(() => expect(paneRow('Miles Davis')).not.toBeNull())

    fireEvent.click(paneRow('Miles Davis'))
    await waitFor(() =>
      expect(lastCallFor('song').filter).toEqual({ artists_id: 'ar1' }),
    )

    fireEvent.click(paneRow('Kind of Blue'))
    await waitFor(() =>
      expect(lastCallFor('song').filter).toEqual({
        artists_id: 'ar1',
        album_id: 'al1',
      }),
    )
  })

  it('asks the server for the sort of the column clicked', async () => {
    render(<ItunesBrowse />)
    await waitFor(() => expect(screen.getByText('So What')).not.toBeNull())
    fireEvent.click(screen.getByText('title'))
    await waitFor(() =>
      expect(lastCallFor('song').sort).toEqual({
        field: 'title',
        order: 'ASC',
      }),
    )
  })

  it('remembers the columns picked from the right-click menu', async () => {
    render(<ItunesBrowse />)
    await waitFor(() => expect(screen.getByText('So What')).not.toBeNull())
    fireEvent.contextMenu(screen.getByText('So What'))
    fireEvent.click(screen.getByText('path'))
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('browse.columns'))).toContain(
        'path',
      ),
    )
  })
})
