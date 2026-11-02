package nativeapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"

	"github.com/navidrome/navidrome/model"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

type fakeScanner struct {
	model.Scanner
	targets []model.ScanTarget
	called  chan struct{}
}

func (s *fakeScanner) ScanFolders(_ context.Context, _ bool, targets []model.ScanTarget) ([]string, error) {
	s.targets = targets
	close(s.called)
	return nil, nil
}

var _ = Describe("Song tag editing", func() {
	Describe("toTagLibProperties", func() {
		It("maps the editable fields to TagLib property names", func() {
			props, err := toTagLibProperties(map[string][]string{
				"genre":       {"Rock", "Pop"},
				"albumArtist": {"Nina Simone"},
			})
			Expect(err).ToNot(HaveOccurred())
			Expect(props).To(Equal(map[string][]string{
				"GENRE":       {"Rock", "Pop"},
				"ALBUMARTIST": {"Nina Simone"},
			}))
		})

		It("keeps a field with no values, to clear the tag", func() {
			props, err := toTagLibProperties(map[string][]string{"comment": {"  "}})
			Expect(err).ToNot(HaveOccurred())
			Expect(props).To(HaveKeyWithValue("COMMENT", BeEmpty()))
		})

		It("rejects fields that are not editable", func() {
			_, err := toTagLibProperties(map[string][]string{"path": {"/etc/passwd"}})
			Expect(err).To(MatchError(ContainSubstring("cannot be edited")))
		})
	})

	Describe("rescanFolders", func() {
		It("scans each folder holding an edited file, once", func() {
			scn := &fakeScanner{called: make(chan struct{})}
			files := model.MediaFiles{
				{ID: "1", LibraryID: 1, Path: "Artist/Album/01.mp3"},
				{ID: "2", LibraryID: 1, Path: "Artist/Album/02.mp3"},
				{ID: "3", LibraryID: 2, Path: "Other/03.mp3"},
				{ID: "4", LibraryID: 2, Path: "Missing/04.mp3", Missing: true},
			}
			Expect(rescanFolders(context.Background(), scn, files)).To(BeTrue())
			Eventually(scn.called).Should(BeClosed())
			Expect(scn.targets).To(ConsistOf(
				model.ScanTarget{LibraryID: 1, FolderPath: "Artist/Album"},
				model.ScanTarget{LibraryID: 2, FolderPath: "Other"},
			))
		})

		It("does nothing when every file is missing", func() {
			scn := &fakeScanner{called: make(chan struct{})}
			files := model.MediaFiles{{ID: "1", Missing: true}}
			Expect(rescanFolders(context.Background(), scn, files)).To(BeFalse())
			Expect(scn.called).ToNot(BeClosed())
		})
	})

	Describe("the request handler", func() {
		var handler http.HandlerFunc

		BeforeEach(func() {
			handler = updateSongTags(nil, nil)
		})

		put := func(body string) *httptest.ResponseRecorder {
			w := httptest.NewRecorder()
			r := httptest.NewRequest(http.MethodPut, "/song/tags", bytes.NewBufferString(body))
			handler(w, r)
			return w
		}

		It("rejects a malformed body", func() {
			Expect(put("{").Code).To(Equal(http.StatusBadRequest))
		})

		It("rejects an empty selection", func() {
			Expect(put(`{"ids":[],"tags":{"genre":["Rock"]}}`).Code).To(Equal(http.StatusBadRequest))
		})

		It("rejects a selection over the batch limit", func() {
			ids := make([]string, maxTagUpdateBatch+1)
			for i := range ids {
				ids[i] = "id"
			}
			body, _ := json.Marshal(tagUpdateRequest{IDs: ids, Tags: map[string][]string{"genre": {"Rock"}}})
			w := put(string(body))
			Expect(w.Code).To(Equal(http.StatusBadRequest))
			Expect(w.Body.String()).To(ContainSubstring("too many songs"))
		})

		It("rejects a request with no tags", func() {
			Expect(put(`{"ids":["1"],"tags":{}}`).Code).To(Equal(http.StatusBadRequest))
		})
	})
})
