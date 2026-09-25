# time-machine-widget

[![License](https://img.shields.io/github/license/brianmcleer/time-machine-widget)](LICENSE) [![Release](https://img.shields.io/github/v/release/brianmcleer/time-machine-widget?display_name=tag)](https://github.com/brianmcleer/time-machine-widget/releases) [![Issues](https://img.shields.io/github/issues/brianmcleer/time-machine-widget)](https://github.com/brianmcleer/time-machine-widget/issues)

Repository for the Time Machine custom widget for ArcGIS Experience Builder Developer Edition (1.19 and later, React 19).

Time Machine puts one date slider on the map and makes every dated layer follow it. Drag to a day and the map shows what was there on that day. Feature layers, hosted layers and map image sublayers are filtered client side; groups of yearly snapshots switch to the matching year; Compare mode shows two dates behind a divider. No time-enabled services are needed. For the full feature list and install steps, see the widget README in the `time-machine` subfolder.

Author: Brian McLeer, City of Grand Junction, CO.

## Repository layout

```
time-machine-widget/              <- this repo
├── README.md                     <- this file (GitHub landing page)
├── LICENSE                       <- Apache-2.0
├── .gitignore                    <- ignores node_modules, .vs, dist, OS cruft
├── publish.ps1                   <- one-command publish/update script
└── time-machine/                 <- the widget (drops into your-extensions/widgets)
    ├── package.json
    ├── manifest.json
    ├── config.json
    ├── icon.svg
    ├── README.md                 <- install steps, features, troubleshooting
    ├── CHANGELOG.md
    ├── LICENSE
    ├── .gitignore
    ├── .npmignore
    ├── docs/handover/            <- code structure and troubleshooting for maintainers
    ├── tests/                    <- node --test suites (no Experience Builder runtime needed)
    └── src/ ...
```

The widget lives in the `time-machine` subfolder so this repo can hold project level files without polluting the shareable widget. Only the `time-machine` folder is dropped into an Experience Builder install.

## Install (for users)

See `time-machine/README.md` for the full steps. In short: place the `time-machine` folder in `client\your-extensions\widgets\` so `manifest.json` is directly inside it, run `pnpm install` (1.21+) or `npm install` (1.20 and earlier) from the `client` folder, then restart the client.

### The release zip and the editor shims

The zip is the widget only. The Visual Studio type shims in the repo (`time-machine/src/exb-editor-shims.d.ts`, `time-machine/src/vendor-shims.d.ts`, `time-machine/src/runtime/esri.d.ts`) are left out on purpose: their ambient `declare module` blocks are not file-scoped and would rewrite the react, jimu and esri types for every other widget in your `your-extensions` folder.

If you clone the repository instead of using the zip, delete those files before building; nothing else depends on them.

## Publishing updates (for the maintainer)

`publish.ps1` syncs the widget from the live Experience Builder folder into this repo's `time-machine` subfolder (skipping `node_modules`, `.vs` and `Claude outputs`), commits, pushes to GitHub, and optionally cuts a release whose zip drops the editor shims. Edit the variables at the top of the script if paths change.

- Code update only:
  ```
  powershell -ExecutionPolicy Bypass -File .\publish.ps1
  ```
- Code update plus a new downloadable version:
  ```
  powershell -ExecutionPolicy Bypass -File .\publish.ps1 -Release v1.0.0
  ```

Version tags must increase and never repeat. Bug fix: v1.0.1. New feature: v1.1.0. Major change: v2.0.0.

For the Esri Community post, upload the zip from the GitHub release (never a right-click zip of the repo folder, which would put the shims back).

## License

Apache-2.0. See the LICENSE file.
