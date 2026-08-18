# File Browser Feature — Implementation Plan

Browse the library by physical folder hierarchy, then play files the same way
Album/Artist views do today.

## Key finding: the data layer already exists

The new scanner already builds and stores the full directory tree. No schema
changes are needed.

- `folder` table (`db/migrations/20241026183640_support_new_scanner.go`):
  self-referential tree via `parent_id`, with `library_id`, `path`, `name`,
  `num_audio_files`, `num_playlists`, `missing`. Index on `folder_parent_id`.
- `model.Folder` (`model/folder.go`) + `FolderRepository` with
  `Get(id)`, `GetByPath`, `GetAll(QueryOptions)`, `CountAll`.
- `media_file.folder_id` FK (indexed) links tracks to their folder.
- `MediaFile.AbsolutePath()` and the existing Subsonic `stream?id=<mfId>`
  endpoint already serve a track given its id — playback needs no new plumbing.

**The only gap is the API surface + a UI view.** `getMusicDirectory`
(`server/subsonic/browsing.go`) only walks the tag-based Artist/Album hierarchy,
not the physical `folder` tree.

## Backend

Add a native API endpoint (the React UI talks to `/api/*`, not Subsonic).

1. **New handler** `server/nativeapi/folders.go`, registered in
   `server/nativeapi/native_api.go` `routes()`.
   - `GET /api/folder?parent_id=<id>&library_id=<id>` → child folders.
     - `ds.Folder(ctx).GetAll(model.QueryOptions{Filters: squirrel.Eq{"parent_id": parentID, "missing": false}, Sort: "name"})`
     - Root level = folders whose `parent_id` is the library root (or null-parent);
       reuse the pattern in `core/artwork/folders_album.go` which already walks
       `ParentID`.
   - `GET /api/folder/:id/tracks` → media files directly in that folder:
     - `ds.MediaFile(ctx).GetAll(model.QueryOptions{Filters: squirrel.Eq{"folder_id": id}, Sort: "path"})`
   - Alternatively expose `folder` through the generic `R()` CRUD registration
     (like other resources) and add a `folderTrack` sub-resource, mirroring how
     `playlistTrack` → `playlist/:id/tracks` works. This gets react-admin
     pagination/sorting for free.
2. Respect **multi-library** and **`missing`** filters — the data provider already
   injects `library_id`; filter `missing = false` by default.
3. Return enough on each folder row to render: `id`, `name`, `parent_id`,
   `num_audio_files`, `num_playlists`, `library_id`.

## Frontend (react-admin, `ui/src`)

Mirror how a resource is built (see `ui/src/artist/index.jsx`,
`ui/src/album/AlbumSongs.jsx`).

1. **New folder** `ui/src/filebrowser/` with `index.jsx` exporting
   `{ list, icon }` (a `FolderIcon` from `@material-ui/icons`).
2. **View**: because folder browsing is stateful navigation (not a flat list),
   the cleanest approach is a **custom route** rather than a plain `<List>`:
   - Add a `<Route path="/files">` (and `/files/:folderId`) in
     `ui/src/routes.jsx` (`customRoutes`), and a manual `<MenuItemLink>` in
     `ui/src/layout/Menu.jsx`.
   - The component keeps a breadcrumb path; each row is either a folder
     (navigate into it, `dataProvider.getList('folder', {filter:{parent_id}})`)
     or a track (in a `<SongDatagrid>`-style table).
   - Simpler MVP alternative: register `folder` as a normal `<Resource>` in
     `App.jsx` (auto menu item + list) and drill down by filtering on
     `parent_id`. Less polished breadcrumb UX but far less custom code.
3. **Playback** — reuse the existing machinery verbatim:
   - Build `{ id: songRecord }` map + ordered `ids`, then
     `dispatch(playTracks(data, ids, clickedId))`
     (`ui/src/actions/player.js`), exactly like `AlbumSongs.jsx:188`.
   - Add "Play all" / "Shuffle" / "Add to queue" for the current folder using
     `common/PlayButton.jsx`, `common/ShuffleAllButton.jsx`.
   - The player, queue reducer, and Subsonic `streamUrl` all work unchanged.
4. **i18n**: add the `Files`/`Folders` label to `ui/src/i18n/en.json`.

## Suggested build order (each shippable)

1. Backend `GET /api/folder` (children) + `/api/folder/:id/tracks`, with tests
   in `server/nativeapi/`.
2. MVP UI: `folder` as a `<Resource>` with drill-down list + play row → validates
   the full path end to end.
3. Upgrade to custom `/files` route with breadcrumbs + folder play/shuffle actions.
4. Polish: cover-art thumbnails per folder (reuse `core/artwork/folders_album.go`),
   remember last-visited folder, keyboard nav.

## Testing

- Go: table tests against an in-memory datastore in `server/nativeapi/` +
  `persistence/folder_repository_test.go` patterns.
- JS: `vitest` component tests mirroring `ui/src/album/*.test.jsx`.
