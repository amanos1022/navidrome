package nativeapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path"
	"slices"
	"strings"

	"github.com/Masterminds/squirrel"
	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/scanner"
	"go.senan.xyz/taglib"
)

// editableTags maps the field names accepted by the bulk tag editor to the TagLib property names
// written to the file. Only these fields can be edited: every other tag either has no single
// meaning across formats or is derived by the scanner, and would need its own validation.
var editableTags = map[string]string{
	"title":       "TITLE",
	"artist":      "ARTIST",
	"albumArtist": "ALBUMARTIST",
	"album":       "ALBUM",
	"genre":       "GENRE",
	"year":        "DATE",
	"trackNumber": "TRACKNUMBER",
	"discNumber":  "DISCNUMBER",
	"comment":     "COMMENT",
	"composer":    "COMPOSER",
}

// maxTagUpdateBatch caps one request, as every file is written synchronously (each write spins up
// its own TagLib WASM module) and the response reports the outcome per file.
const maxTagUpdateBatch = 1000

type tagUpdateRequest struct {
	IDs []string `json:"ids"`
	// Tags maps a field of editableTags to its new values. A field that is absent is left
	// untouched in the file; a field with no values clears it.
	Tags map[string][]string `json:"tags"`
}

type tagUpdateFailure struct {
	ID    string `json:"id"`
	Path  string `json:"path,omitempty"`
	Error string `json:"error"`
}

type tagUpdateResponse struct {
	Updated   int                `json:"updated"`
	Failed    []tagUpdateFailure `json:"failed,omitempty"`
	Rescanned bool               `json:"rescanned"`
}

func (api *Router) addSongTagsRoute(r chi.Router) {
	r.Put("/song/tags", updateSongTags(api.ds, api.scanner))
}

// toTagLibProperties validates the requested fields and translates them to TagLib property names.
func toTagLibProperties(tags map[string][]string) (map[string][]string, error) {
	props := make(map[string][]string, len(tags))
	for field, values := range tags {
		prop, ok := editableTags[field]
		if !ok {
			return nil, fmt.Errorf("tag %q cannot be edited", field)
		}
		// Drop empty values, so a cleared text field clears the tag instead of writing a blank one
		kept := make([]string, 0, len(values))
		for _, v := range values {
			if v = strings.TrimSpace(v); v != "" {
				kept = append(kept, v)
			}
		}
		props[prop] = kept
	}
	return props, nil
}

func updateSongTags(ds model.DataStore, scn model.Scanner) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		var payload tagUpdateRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if len(payload.IDs) == 0 {
			http.Error(w, "no songs selected", http.StatusBadRequest)
			return
		}
		if len(payload.IDs) > maxTagUpdateBatch {
			http.Error(w, fmt.Sprintf("too many songs selected (max %d)", maxTagUpdateBatch), http.StatusBadRequest)
			return
		}
		props, err := toTagLibProperties(payload.Tags)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if len(props) == 0 {
			http.Error(w, "no tags to update", http.StatusBadRequest)
			return
		}

		files, err := loadMediaFiles(ctx, ds, payload.IDs)
		if err != nil {
			log.Error(ctx, "Error loading songs to update tags", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		resp := writeTagsToFiles(ctx, files, props)
		// Files not found in the DB are reported too, so the client never sees a silent no-op
		found := make(map[string]struct{}, len(files))
		for _, f := range files {
			found[f.ID] = struct{}{}
		}
		for _, id := range payload.IDs {
			if _, ok := found[id]; !ok {
				resp.Failed = append(resp.Failed, tagUpdateFailure{ID: id, Error: "not found"})
			}
		}

		if resp.Updated > 0 {
			resp.Rescanned = rescanFolders(ctx, scn, files)
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			log.Error(ctx, "Error sending response to client", err)
		}
	}
}

// loadMediaFiles reads the selected songs in chunks, keeping the id list well under SQLite's
// bound-parameter limit.
func loadMediaFiles(ctx context.Context, ds model.DataStore, ids []string) (model.MediaFiles, error) {
	var files model.MediaFiles
	for chunk := range slices.Chunk(ids, 200) {
		res, err := ds.MediaFile(ctx).GetAll(model.QueryOptions{
			Filters: squirrel.Eq{"media_file.id": chunk},
		})
		if err != nil {
			return nil, err
		}
		files = append(files, res...)
	}
	return files, nil
}

// writeTagsToFiles writes the properties to each file, collecting per-file failures instead of
// stopping at the first one: a bulk edit over a mixed selection should still apply where it can.
func writeTagsToFiles(ctx context.Context, files model.MediaFiles, props map[string][]string) tagUpdateResponse {
	var resp tagUpdateResponse
	for _, file := range files {
		if file.Missing {
			resp.Failed = append(resp.Failed, tagUpdateFailure{ID: file.ID, Path: file.Path, Error: "file is missing"})
			continue
		}
		absolutePath := file.AbsolutePath()
		if err := taglib.WriteTags(absolutePath, props, 0); err != nil {
			log.Error(ctx, "Error writing tags to file", "path", absolutePath, err)
			resp.Failed = append(resp.Failed, tagUpdateFailure{ID: file.ID, Path: file.Path, Error: err.Error()})
			continue
		}
		log.Info(ctx, "Updated tags in file", "path", absolutePath, "tags", props)
		resp.Updated++
	}
	return resp
}

// rescanFolders triggers a selective scan of the folders holding the edited files, so the library
// picks up the new tags. It runs in the background: the scanner notifies the UI when it's done.
func rescanFolders(ctx context.Context, scn model.Scanner, files model.MediaFiles) bool {
	if scn == nil {
		return false
	}
	targets := make([]model.ScanTarget, 0, len(files))
	for _, file := range files {
		if file.Missing {
			continue
		}
		// Paths are stored relative to the library root, with forward slashes
		target := model.ScanTarget{LibraryID: file.LibraryID, FolderPath: path.Dir(file.Path)}
		if !slices.Contains(targets, target) {
			targets = append(targets, target)
		}
	}
	if len(targets) == 0 {
		return false
	}
	go func() {
		// The request's context is gone by the time the scan runs
		scanCtx := context.WithoutCancel(ctx)
		if _, err := scn.ScanFolders(scanCtx, false, targets); err != nil {
			if errors.Is(err, scanner.ErrAlreadyScanning) {
				log.Warn(scanCtx, "Tags were written, but a scan is already running. The library will pick them up on the next scan")
				return
			}
			log.Error(scanCtx, "Error rescanning folders after a tag update", err)
		}
	}()
	return true
}
