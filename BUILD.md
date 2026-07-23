# building lwriter from source

lwriter is a Tauri 2 app: a Rust backend with a static, vanilla HTML/CSS/JS
frontend. there is **no Node, npm, or bundler step** — the only toolchain you
need is Rust.

## prerequisites (all platforms)

1. [Rust](https://rustup.rs/) (stable, 1.77+)
2. the Tauri CLI:

```sh
cargo install tauri-cli --locked
```

## linux

install the system libraries Tauri needs first.

**debian / ubuntu**

```sh
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

**fedora**

```sh
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel
sudo dnf group install "c-development"
```

**arch**

```sh
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file \
  openssl appindicator librsvg
```

then build. the repo's bundle config targets NSIS (a Windows installer), so
override the bundle format on linux:

```sh
git clone https://github.com/warmpop/lwriter
cd lwriter
cargo tauri build --bundles appimage,deb
```

or skip packaging entirely and take the raw binary:

```sh
cargo tauri build --no-bundle
# → src-tauri/target/release/lwriter
```

> **honesty note:** lwriter is developed and tested on Windows. it should
> compile fine on linux, but a few conveniences are Windows-flavored right
> now (e.g. "show in explorer" invokes `explorer.exe`). issues and PRs for
> linux polish are very welcome.

## windows

nothing else to install — WebView2 ships with Windows 10/11.

```sh
git clone https://github.com/warmpop/lwriter
cd lwriter
cargo tauri build
```

artifacts:

- portable exe → `src-tauri/target/release/lwriter.exe`
- installer → `src-tauri/target/release/bundle/nsis/lwriter_x.y.z_x64-setup.exe`


## developing

```sh
cargo tauri dev
```

runs a debug build with the frontend served straight from `ui/` — edit the
HTML/CSS/JS and just reload. see `ARCHITECTURE.md` for how the frontend and
the Rust backend talk to each other.
