import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import EditTagsDialog from './EditTagsDialog'

const httpClient = vi.fn(() => Promise.resolve({ json: { updated: 2 } }))
const notify = vi.fn()

vi.mock('../dataProvider', () => ({
  httpClient: (...args) => httpClient(...args),
}))

vi.mock('react-admin', () => ({
  useTranslate: () => (key, options) => options?._ ?? key,
  useNotify: () => notify,
  useDataProvider: () => ({
    getList: () => Promise.resolve({ data: [{ id: '1', name: 'Rock' }] }),
  }),
}))

const records = [
  { id: 's1', title: 'One', album: 'Shared Album', artist: 'A', genres: [] },
  { id: 's2', title: 'Two', album: 'Shared Album', artist: 'B', genres: [] },
]

const sentBody = () => JSON.parse(httpClient.mock.calls[0][1].body)

describe('<EditTagsDialog />', () => {
  beforeEach(() => {
    httpClient.mockClear()
    notify.mockClear()
  })
  afterEach(cleanup)

  const open = (props = {}) =>
    render(
      <EditTagsDialog open records={records} onClose={vi.fn()} {...props} />,
    )

  it('warns that the files on disk are rewritten', () => {
    open()
    expect(screen.getByText(/rewrites the tags/i)).not.toBeNull()
  })

  it('cannot save until something is changed', () => {
    open()
    expect(screen.getByText('Save').closest('button').disabled).toBe(true)
  })

  it('pre-fills values shared by the whole selection', () => {
    open()
    expect(screen.getByDisplayValue('Shared Album')).not.toBeNull()
  })

  it('sends only the fields that were edited', () => {
    open()
    fireEvent.change(screen.getByDisplayValue('Shared Album'), {
      target: { value: 'New Album' },
    })
    fireEvent.click(screen.getByText('Save').closest('button'))
    expect(httpClient).toHaveBeenCalledOnce()
    expect(sentBody()).toEqual({
      ids: ['s1', 's2'],
      tags: { album: ['New Album'] },
    })
  })

  it('sends an empty value to clear a tag that was filled', () => {
    open()
    fireEvent.change(screen.getByDisplayValue('Shared Album'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByText('Save').closest('button'))
    expect(httpClient).toHaveBeenCalledOnce()
    expect(sentBody().tags).toEqual({ album: [] })
  })

  it('hides per-track fields when several tracks are selected', () => {
    open()
    expect(screen.queryByDisplayValue('One')).toBeNull()
  })

  it('offers the per-track fields for a single track', () => {
    open({ records: [records[0]] })
    expect(screen.getByDisplayValue('One')).not.toBeNull()
  })
})
