{
  description = "Navidrome dev environment (Go + Node build toolchain)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };

        # go.mod requires Go 1.26. Prefer the exact minor if this nixpkgs pin
        # provides it, otherwise fall back to the channel default `go`.
        go = pkgs.go_1_26 or pkgs.go;

        # gen2brain/webp's native libwebp backend dlopens libwebp at runtime via
        # purego on 64-bit arches (see release/build-tags.sh). Expose the shared
        # lib so `make dev` / `go run` find it without the WASM fallback.
        runtimeLibs = [ pkgs.libwebp ];
      in
      {
        devShells.default = pkgs.mkShell {
          name = "navidrome";

          packages = [
            go
            pkgs.nodejs_24

            # cgo toolchain: sqlite_fts5 + libwebp are compiled/linked with CGO_ENABLED=1
            pkgs.gcc
            pkgs.pkg-config

            # Go dev tooling
            pkgs.golangci-lint # note: `make lint` may reinstall its own pinned build into ./bin
            pkgs.goreleaser # `make snapshot`

            # Runtime deps Navidrome shells out to
            pkgs.ffmpeg-headless # transcoding
            pkgs.mpv # optional playback backend

            pkgs.git
            pkgs.gnumake
            pkgs.zip # plugins/testdata packs its .ndp fixtures with zip, so `go test ./plugins/...` needs it
          ] ++ runtimeLibs;

          env = {
            CGO_ENABLED = "1";
            # Matches Makefile's GO_BUILD_TAGS for 64-bit hosts.
            GO_BUILD_TAGS = "netgo,sqlite_fts5";
          };

          shellHook = ''
            export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath runtimeLibs}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
            echo "navidrome dev shell — go $(go version | awk '{print $3}' | sed 's/go//'), node $(node --version), ffmpeg $(ffmpeg -version 2>/dev/null | head -n1 | awk '{print $3}')"
            echo "  make setup   # first-time deps (npm ci, golangci-lint)"
            echo "  make dev     # hot-reload backend + UI on :4533"
          '';
        };
      }
    );
}
