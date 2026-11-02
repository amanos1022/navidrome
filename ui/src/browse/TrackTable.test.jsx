import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import TrackTable from './TrackTable'

// The table only needs the label lookup from react-admin
vi.mock('react-admin', () => ({
  useTranslate: () => (key, options) => options?._ ?? key,
}))

const tracks = [
  { id: '1', title: 'One', artist: 'A', trackNumber: 1, duration: 61 },
  { id: '2', title: 'Two', artist: 'B', trackNumber: 2, duration: 62 },
  { id: '3', title: 'Three', artist: 'C', trackNumber: 3, duration: 63 },
]

const renderTable = (props = {}) => {
  const onSort = vi.fn()
  const onToggleColumn = vi.fn()
  const onSelectionChange = vi.fn()
  const onPlay = vi.fn()
  const result = render(
    <TrackTable
      tracks={tracks}
      sort={{ field: 'title', order: 'ASC' }}
      onSort={onSort}
      visibleColumns={['title', 'artist']}
      onToggleColumn={onToggleColumn}
      selectedIds={[]}
      onSelectionChange={onSelectionChange}
      onPlay={onPlay}
      {...props}
    />,
  )
  return { ...result, onSort, onToggleColumn, onSelectionChange, onPlay }
}

describe('<TrackTable />', () => {
  afterEach(cleanup)

  it('renders only the visible columns', () => {
    renderTable()
    expect(screen.getByText('title')).not.toBeNull()
    expect(screen.getByText('artist')).not.toBeNull()
    expect(screen.queryByText('album')).toBeNull()
    expect(screen.getByText('One')).not.toBeNull()
  })

  it('asks to sort by the column clicked', () => {
    const { onSort } = renderTable()
    fireEvent.click(screen.getByText('artist'))
    expect(onSort).toHaveBeenCalledWith('artist')
  })

  it('replaces the selection on a plain click', () => {
    const { onSelectionChange } = renderTable({ selectedIds: ['1'] })
    fireEvent.click(screen.getByText('Two'))
    expect(onSelectionChange).toHaveBeenCalledWith(['2'])
  })

  it('adds to the selection on ctrl+click', () => {
    const { onSelectionChange } = renderTable({ selectedIds: ['1'] })
    fireEvent.click(screen.getByText('Two'), { ctrlKey: true })
    expect(onSelectionChange).toHaveBeenCalledWith(['1', '2'])
  })

  it('selects a range on shift+click', () => {
    const { onSelectionChange } = renderTable()
    fireEvent.click(screen.getByText('One'))
    fireEvent.click(screen.getByText('Three'), { shiftKey: true })
    expect(onSelectionChange).toHaveBeenLastCalledWith(['1', '2', '3'])
  })

  it('plays the track on double click', () => {
    const { onPlay } = renderTable()
    fireEvent.doubleClick(screen.getByText('Two'))
    expect(onPlay).toHaveBeenCalledWith('2')
  })

  it('selects every track from the header checkbox', () => {
    const { onSelectionChange } = renderTable()
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(onSelectionChange).toHaveBeenCalledWith(['1', '2', '3'])
  })

  it('offers every column in the right-click menu', () => {
    const { onToggleColumn } = renderTable()
    fireEvent.contextMenu(screen.getByText('One'))
    // The menu lists all columns, visible or not
    fireEvent.click(screen.getByText('album'))
    expect(onToggleColumn).toHaveBeenCalledWith('album')
  })
})
