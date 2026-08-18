package persistence

import (
	"context"
	"encoding/json"
	"fmt"
	"iter"
	"maps"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"time"

	. "github.com/Masterminds/squirrel"
	"github.com/deluan/rest"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/utils/slice"
	"github.com/pocketbase/dbx"
)

type folderRepository struct {
	sqlRepository
}

type dbFolder struct {
	*model.Folder `structs:",flatten"`
	ImageFiles    string `structs:"-" json:"-"`
}

func (f *dbFolder) PostScan() error {
	var err error
	if f.ImageFiles != "" {
		if err = json.Unmarshal([]byte(f.ImageFiles), &f.Folder.ImageFiles); err != nil {
			return fmt.Errorf("parsing folder image files from db: %w", err)
		}
	}
	return nil
}

func (f *dbFolder) PostMapArgs(args map[string]any) error {
	if f.Folder.ImageFiles == nil {
		args["image_files"] = "[]"
	} else {
		imgFiles, err := json.Marshal(f.Folder.ImageFiles)
		if err != nil {
			return fmt.Errorf("marshalling image files: %w", err)
		}
		args["image_files"] = string(imgFiles)
	}
	return nil
}

type dbFolders []dbFolder

func (fs dbFolders) toModels() []model.Folder {
	return slice.Map(fs, func(f dbFolder) model.Folder { return *f.Folder })
}

func newFolderRepository(ctx context.Context, db dbx.Builder) model.FolderRepository {
	r := &folderRepository{}
	r.ctx = ctx
	r.db = db
	r.tableName = "folder"
	r.registerModel(&model.Folder{}, folderFilters())
	r.setSortMappings(map[string]string{
		"name": "name",
	})
	return r
}

// folderFilters defines the REST filters accepted by the file-browser endpoint.
// All column references are qualified with "folder." because selectFolder joins
// the library table (which also has a library_id column).
func folderFilters() map[string]filterFunc {
	return map[string]filterFunc{
		"id":         idFilter("folder"),
		"library_id": func(_ string, v any) Sqlizer { return Eq{"folder.library_id": v} },
		"missing": func(_ string, v any) Sqlizer {
			return Eq{"folder.missing": strings.EqualFold(fmt.Sprint(v), "true")}
		},
		// parent_id == "root" lists the top-level folders. The library root is
		// not stored as a folder row; its direct children are the folders whose
		// relative path is "." (they sit directly in the library root). For any
		// other value it's an exact parent match to drill down the tree.
		"parent_id": func(_ string, v any) Sqlizer {
			if s, ok := v.(string); ok && s == "root" {
				return Eq{"folder.path": "."}
			}
			return Eq{"folder.parent_id": v}
		},
	}
}

func (r folderRepository) selectFolder(options ...model.QueryOptions) SelectBuilder {
	sql := r.newSelect(options...).Columns("folder.*", "library.path as library_path").
		Join("library on library.id = folder.library_id")
	return r.applyLibraryFilter(sql)
}

func (r folderRepository) Get(id string) (*model.Folder, error) {
	sq := r.selectFolder().Where(Eq{"folder.id": id})
	var res dbFolder
	err := r.queryOne(sq, &res)
	return res.Folder, err
}

func (r folderRepository) GetByPath(lib model.Library, path string) (*model.Folder, error) {
	id := model.NewFolder(lib, path).ID
	return r.Get(id)
}

func (r folderRepository) GetAll(opt ...model.QueryOptions) ([]model.Folder, error) {
	sq := r.selectFolder(opt...)
	var res dbFolders
	err := r.queryAll(sq, &res)
	return res.toModels(), err
}

func (r folderRepository) CountAll(opt ...model.QueryOptions) (int64, error) {
	query := r.newSelect(opt...).Columns("count(*)")
	query = r.applyLibraryFilter(query)
	return r.count(query)
}

func (r folderRepository) GetFolderUpdateInfo(lib model.Library, targetPaths ...string) (map[string]model.FolderUpdateInfo, error) {
	// If no specific paths, return all folders in the library
	if len(targetPaths) == 0 {
		return r.getFolderUpdateInfoAll(lib)
	}

	// Check if any path is root (return all folders)
	for _, targetPath := range targetPaths {
		if targetPath == "" || targetPath == "." {
			return r.getFolderUpdateInfoAll(lib)
		}
	}

	// Process paths in batches to avoid SQLite's expression tree depth limit (max 1000).
	// Each path generates ~3 conditions, so batch size of 100 keeps us well under the limit.
	const batchSize = 100
	result := make(map[string]model.FolderUpdateInfo)

	for batch := range slices.Chunk(targetPaths, batchSize) {
		batchResult, err := r.getFolderUpdateInfoBatch(lib, batch)
		if err != nil {
			return nil, err
		}
		maps.Copy(result, batchResult)
	}

	return result, nil
}

// getFolderUpdateInfoAll returns update info for all non-missing folders in the library
func (r folderRepository) getFolderUpdateInfoAll(lib model.Library) (map[string]model.FolderUpdateInfo, error) {
	where := And{
		Eq{"library_id": lib.ID},
		Eq{"missing": false},
	}
	return r.queryFolderUpdateInfo(where)
}

// getFolderUpdateInfoBatch returns update info for a batch of target paths and their descendants
func (r folderRepository) getFolderUpdateInfoBatch(lib model.Library, targetPaths []string) (map[string]model.FolderUpdateInfo, error) {
	where := And{
		Eq{"library_id": lib.ID},
		Eq{"missing": false},
	}

	// Collect folder IDs for exact target folders and path conditions for descendants
	folderIDs := make([]string, 0, len(targetPaths))
	pathConditions := make(Or, 0, len(targetPaths)*2)

	for _, targetPath := range targetPaths {
		// Clean the path to normalize it. Paths stored in the folder table do not have leading/trailing slashes.
		cleanPath := strings.TrimPrefix(targetPath, string(os.PathSeparator))
		cleanPath = filepath.Clean(cleanPath)

		// Include the target folder itself by ID
		folderIDs = append(folderIDs, model.FolderID(lib, cleanPath))

		// Include all descendants: folders whose path field equals or starts with the target path
		// Note: Folder.Path is the directory path, so children have path = targetPath
		pathConditions = append(pathConditions, Eq{"path": cleanPath})
		pathConditions = append(pathConditions, Like{"path": cleanPath + "/%"})
	}

	// Combine conditions: exact folder IDs OR descendant path patterns
	if len(folderIDs) > 0 {
		where = append(where, Or{Eq{"id": folderIDs}, pathConditions})
	} else if len(pathConditions) > 0 {
		where = append(where, pathConditions)
	}

	return r.queryFolderUpdateInfo(where)
}

// queryFolderUpdateInfo executes the query and returns the result map
func (r folderRepository) queryFolderUpdateInfo(where And) (map[string]model.FolderUpdateInfo, error) {
	sq := r.newSelect().Columns("id", "updated_at", "hash").Where(where)
	var res []struct {
		ID        string
		UpdatedAt time.Time
		Hash      string
	}
	err := r.queryAll(sq, &res)
	if err != nil {
		return nil, err
	}
	m := make(map[string]model.FolderUpdateInfo, len(res))
	for _, f := range res {
		m[f.ID] = model.FolderUpdateInfo{UpdatedAt: f.UpdatedAt, Hash: f.Hash}
	}
	return m, nil
}

// HasAudioOutsideFolders reports whether any folder in parent's subtree
// (including parent itself) contains audio files and is not one of the given
// folder IDs. LIKE wildcards in the parent path are escaped, so it is always
// matched as a literal prefix.
func (r folderRepository) HasAudioOutsideFolders(parent model.Folder, excludeFolderIDs []string) (bool, error) {
	if parent.NumAudioFiles > 0 {
		return true, nil
	}
	parentPath := strings.TrimPrefix(path.Join(parent.Path, parent.Name), "/")
	return r.exists(And{
		Eq{"library_id": parent.LibraryID, "missing": false},
		Gt{"num_audio_files": 0},
		NotEq{"id": excludeFolderIDs},
		Or{
			// Direct children have path = parentPath; deeper descendants match the prefix
			Eq{"path": parentPath},
			Expr(`path LIKE ? ESCAPE '\'`, escapeLikePrefix(parentPath)+"/%"),
		},
	})
}

// escapeLikePrefix escapes SQL LIKE wildcards so a string can be used as a
// literal prefix in a LIKE pattern (with ESCAPE '\').
func escapeLikePrefix(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

func (r folderRepository) Put(f *model.Folder) error {
	dbf := dbFolder{Folder: f}
	_, err := r.put(dbf.ID, &dbf)
	return err
}

func (r folderRepository) MarkMissing(missing bool, ids ...string) error {
	log.Debug(r.ctx, "Marking folders as missing", "ids", ids, "missing", missing)
	for chunk := range slices.Chunk(ids, 200) {
		sq := Update(r.tableName).
			Set("missing", missing).
			Set("updated_at", time.Now()).
			Where(Eq{"id": chunk})
		_, err := r.executeSQL(sq)
		if err != nil {
			return err
		}
	}
	return nil
}

func (r folderRepository) GetTouchedWithPlaylists() (model.FolderCursor, error) {
	query := r.selectFolder().Where(And{
		Eq{"missing": false},
		Gt{"num_playlists": 0},
		ConcatExpr("folder.updated_at > library.last_scan_at"),
	})
	cursor, err := queryWithStableResults[dbFolder](r.sqlRepository, query)
	if err != nil {
		return nil, err
	}
	return wrapFolderCursor(cursor), nil
}

func (r folderRepository) GetAllWithPlaylists() (model.FolderCursor, error) {
	query := r.selectFolder().Where(And{
		Eq{"missing": false},
		Gt{"num_playlists": 0},
	})
	cursor, err := queryWithStableResults[dbFolder](r.sqlRepository, query)
	if err != nil {
		return nil, err
	}
	return wrapFolderCursor(cursor), nil
}

func wrapFolderCursor(cursor iter.Seq2[dbFolder, error]) model.FolderCursor {
	return model.FolderCursor(wrapCursor(cursor, func(f dbFolder) *model.Folder { return f.Folder }))
}

func (r folderRepository) purgeEmpty(libraryIDs ...int) error {
	sq := Delete(r.tableName).Where(And{
		Eq{"num_audio_files": 0},
		Eq{"num_playlists": 0},
		Eq{"image_files": "[]"},
		ConcatExpr("id not in (select parent_id from folder)"),
		ConcatExpr("id not in (select folder_id from media_file)"),
	})
	// If libraryIDs are specified, only purge folders from those libraries
	if len(libraryIDs) > 0 {
		sq = sq.Where(Eq{"library_id": libraryIDs})
	}
	c, err := r.executeSQL(sq)
	if err != nil {
		return fmt.Errorf("purging empty folders: %w", err)
	}
	if c > 0 {
		log.Debug(r.ctx, "Purging empty folders", "totalDeleted", c)
	}
	return nil
}

// ResourceRepository implementation, used by the native API to power the file
// browser (read-only: registered with persistable=false).

func (r *folderRepository) Read(id string) (any, error) {
	return r.Get(id)
}

func (r *folderRepository) ReadAll(options ...rest.QueryOptions) (any, error) {
	return r.GetAll(r.parseFolderOptions(options...))
}

func (r *folderRepository) Count(options ...rest.QueryOptions) (int64, error) {
	return r.CountAll(r.parseFolderOptions(options...))
}

func (r *folderRepository) EntityName() string {
	return "folder"
}

func (r *folderRepository) NewInstance() any {
	return &model.Folder{}
}

// parseFolderOptions converts REST query options into model.QueryOptions,
// defaulting to only non-missing folders when the caller doesn't ask otherwise.
func (r *folderRepository) parseFolderOptions(options ...rest.QueryOptions) model.QueryOptions {
	var o rest.QueryOptions
	if len(options) > 0 {
		o = options[0]
	}
	if o.Filters == nil {
		o.Filters = map[string]any{}
	} else {
		o.Filters = maps.Clone(o.Filters)
	}
	if _, ok := o.Filters["missing"]; !ok {
		o.Filters["missing"] = "false"
	}
	return r.parseRestOptions(r.ctx, o)
}

var _ model.FolderRepository = (*folderRepository)(nil)
var _ model.ResourceRepository = (*folderRepository)(nil)
