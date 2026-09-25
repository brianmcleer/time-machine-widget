# Time Machine: code structure

| File | What it does |
|---|---|
| `src/config.ts` | `Config` interface, `CONFIG_DEFAULTS`, `DEFAULT_PREFERRED_FIELDS`. Every builder key is documented here. |
| `src/configXml.ts` | Typed XML import/export (same element scheme as Print Advanced). No esri or jimu imports, shared by settings. |
| `src/runtime/lib/timeMath.ts` | Pure date logic: field picking, span pairs, UTC rounding, slider index math, ISO parsing, SQL `TIMESTAMP` clauses, year-set picking, range fitting. |
| `src/runtime/lib/layerEngine.ts` | The map side, duck-typed: walk `map.layers`, read fields in parallel (load, then REST; one `layers?f=json` per map service), keep only fields the popup exposes (`exposedFields`), discover targets with an `on` flag (`isLayerOn`, `isTargetOn`, `visibilitySignature` for a cheap watch) and year sets, remember/apply/restore `definitionExpression`, `activityCounts` (grouped statistics with EXTRACT(YEAR/MONTH), bucket `queryFeatureCount` fallback capped at 40 buckets), statistics for the data range with a timeout per request and a second ask inside the year window when the edge is a placeholder date. |
| `src/runtime/lib/presentation.ts` | Pure presentation logic: sorted chapters, chapter at/in effect/next/prev, progress, banner model, fly-to target, keyboard map (digits plus Enter, full stop and comma, Z). `chapterStartingAt` returns the last chapter on a unit. |
| `src/runtime/lib/presentBanner.ts` | The on-map banner: plain DOM added through `view.ui`, colors from theme tokens, buttons call back into the widget; title and end cards, Back and Step, Clear the drawing, live region, progressbar role, 44 px targets on coarse pointers. |
| `src/message-actions/set-date-action.ts` | "Set the Time Machine date" message action; reads a date from the selected record and pushes `stateProps.request`. |
| `src/runtime/lib/compare.ts` | Compare mode: clone feature layers with date B, `arcgis-swipe` divider, pointer-events fix from Basemap Gallery Custom, cleanup and sweep by id prefix. |
| `src/runtime/widget.tsx` | Function component: state, discovery on view change and on `allLayers.length`, debounced apply, play timer, mode switching, controller open/close handling, all markup. |
| `src/runtime/helpSections.ts` | Help guide content built from `HelpFeatures` flags. |
| `src/runtime/components/HelpPopup.tsx`, `FirstRunHint.tsx`, `src/runtime/theme.ts` | Copied unchanged from the reference widget. |
| `src/runtime/lib/story.ts` | Chapters beyond the builder: `captureView` (viewpoint, layers on and off, basemap id), `applyChapterLayers` / `restoreLayers` / `mergeUndo`, `applyChapterBasemap`, `showChapterFeature`, the browser draft (`readDraft` / `writeDraft` under `timeMachine.story.<widgetId>`), `mergeChapters`, `storyXml`, `moveChapter`, presenter model helpers (`formatElapsed`, `parseCommand`). Duck-typed, tested. |
| `src/runtime/lib/presenterWindow.ts` | The presenter window: `openPresenter` writes a plain HTML page into `window.open`, talks over `BroadcastChannel` (`time-machine-presenter-<widgetId>`, postMessage fallback), sends `PresenterState`, receives commands. |
| `src/runtime/lib/brand.ts` | Presentation look: `cleanColor` (hex, rgb, hsl, names only), `luminance`, `contrastText`, `contrastRatio`, `FONT_CHOICES`, `fontStack`, `resolveBrand` (config over tokens), `brandTokens`. Imported by the settings too (no esri). |
| `src/runtime/lib/deck.ts` | `htmlDeck` (self contained slideshow with notes view and print to PDF), `autoChapterKeys`. |
| `src/runtime/lib/dateCache.ts` | Client side date cache: `loadDateCache` (paged query of oid + date fields, cap), `cacheRange`, `cacheCount` (same rules as buildWhere), `cacheActivity`, `cacheIdsBetween`. |
| `src/runtime/lib/video.ts` | `createRecorder` (offscreen canvas with a caption strip, `captureStream` into `MediaRecorder`, WebM), `videoSupported`, `pickMime`, `captionLayout`, `framesPerStep`. |
| `src/runtime/lib/stage.ts` | Ink canvas (`createInk`, pointer capture, DPR aware, resize safe), blackout cover, narrator over the Web Speech API, `narrationText`, `pace`, `addDwell`, `driftTarget`. |
| `src/runtime/lib/spotlight.ts` | Spotlight overlay on the view container (radial gradient following the pointer, pointer events pass through). |
| `src/setting/setting.tsx` | Builder settings (class component, local `SettingProps` type instead of `jimu-for-builder`). `readMapLayers` lists the selected map's dated layers through `DataSourceManager` (keys match the runtime: web map layer id, `<layer id>::<sublayer id>` for map service sublayers); ticking one writes a `field` rule. No `esri/*` import. |
| `src/shared/beacon.ts` | Shared telemetry module, byte copy of `_shared/beacon.ts`. |
| `src/exb-editor-shims.d.ts`, `src/vendor-shims.d.ts`, `src/runtime/esri.d.ts` | Editor-only type shims (mode B). Never in the release zip. |
| `tests/` | `transpile.js` emits `tests/build`; the three `*.test.js` files run on it with `node --test`. |

## Where is X

- The filter clause: `buildWhere` in `timeMath.ts`; combined with the layer's own filter by `combineWhere`.
- Which field a layer uses: `pickDateField` and `resolveFieldPick` in `timeMath.ts`; rules matched by `findRule`.
- Original filter memory: `rememberOriginal` / `originalWhere` in `layerEngine.ts`, stored on the layer object under `__timeMachineOriginal[widgetId]`.
- Apply timing: `scheduleApply(120)` in `widget.tsx`; sliders call `onSlider` on both input and change.
- Compare clone ids: `time-machine-<widgetId>-cmp-<layerKey>`; `sweepClones` removes leftovers after a close and reopen.
- URL date: `parseUrlDate`/`formatUrlDate` in `timeMath.ts`; read once per page load in `discover`, written by `copyLink`.
- Remembered date: `localStorage` key `timeMachine.last.<widgetId>` (only when `rememberDate`).
- Presentation: `startPresent`/`exitPresent` in `widget.tsx`; chapter hold uses `chapterHold` state to pause the play interval.
- Help hint storage: `localStorage` key `timeMachine.helpHintDismissed.<widgetId>`.

## Adding a config key

1. Add it to `Config` and `CONFIG_DEFAULTS` in `config.ts`.
2. Read it in `widget.tsx` through `readConfig` (defaults fill in) and pass a boolean down.
3. Add the settings row and its label plus hint in `setting/translations/default.ts`.
4. If it is a boolean or number, add it to `BOOL_KEYS` or `NUM_KEYS` in `configXml.ts` so a hand-edited XML still imports.
5. If it gates a help line, add the flag to `HelpFeatures`, gate the line with `when`, and extend `tests/help.test.js` (both directions).
