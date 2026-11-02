import { describe, it, expect } from 'vitest'
import { compareBy, toggleColumn, trackColumns } from './trackColumns'

const sorted = (tracks, field, order) =>
  [...tracks].sort(compareBy(field, order)).map((t) => t.title)

describe('compareBy', () => {
  const tracks = [
    { title: 'b', trackNumber: 2, genres: [{ name: 'Rock' }] },
    { title: 'A', trackNumber: 10, genres: [{ name: 'Ambient' }] },
    { title: 'c', trackNumber: undefined, genres: [] },
  ]

  it('compares numbers numerically, not as text', () => {
    expect(sorted(tracks, 'track_number', 'ASC')).toEqual(['b', 'A', 'c'])
  })

  it('compares text ignoring case', () => {
    expect(sorted(tracks, 'title', 'ASC')).toEqual(['A', 'b', 'c'])
    expect(sorted(tracks, 'title', 'DESC')).toEqual(['c', 'b', 'A'])
  })

  it('sorts empty values last whichever way the column is sorted', () => {
    expect(sorted(tracks, 'track_number', 'DESC').at(-1)).toBe('c')
    expect(sorted(tracks, 'genre', 'DESC').at(-1)).toBe('c')
  })

  it('sorts by what the cell shows, not by the raw field', () => {
    expect(sorted(tracks, 'genre', 'ASC')).toEqual(['A', 'b', 'c'])
  })

  it('leaves the order alone for an unknown column', () => {
    expect(sorted(tracks, 'nope', 'ASC')).toEqual(['b', 'A', 'c'])
  })
})

describe('toggleColumn', () => {
  it('adds a column in the canonical order, not where it was clicked', () => {
    expect(toggleColumn(['title', 'album'], 'artist')).toEqual([
      'title',
      'artist',
      'album',
    ])
  })

  it('removes a column that was shown', () => {
    expect(toggleColumn(['title', 'artist'], 'artist')).toEqual(['title'])
  })

  it('refuses to hide the last column', () => {
    expect(toggleColumn(['title'], 'title')).toEqual(['title'])
  })

  it('knows every column it is given', () => {
    const sources = trackColumns.map((c) => c.source)
    expect(toggleColumn(sources, 'path')).not.toContain('path')
  })
})
