# Time Machine

An ArcGIS Experience Builder widget that puts one date slider on the map and makes every dated layer follow it. Drag to a day and the map shows what was there on that day. No time-enabled services, no server configuration: the widget reads each layer's fields, picks the date field, and sets a client-side filter.

Built and maintained by the GIS Division, City of Grand Junction, Colorado.

## Features

- **One slider, every layer.** Feature layers, hosted layers, GeoJSON and CSV layers, and map image sublayers that have a date field all follow the same slider. Group layers and nested groups are walked.
- **Date, Range and Compare modes.** Date shows the map as of one day. Range shows only what happened between two handles. Compare puts two dates side by side behind a divider you drag on the map.
- **Play.** Walks the slider forward one step at a time with slow, normal and fast speeds, plus step buttons.
- **Start and end spans.** A layer with a start field and an end field (issued and expired, opened and closed) shows a feature while the date is inside its span. Common pairs are found automatically; any pair can be set in a rule.
- **Snapshots by year.** A group layer whose children are named by year (Aerials 2019, Aerials 2021) switches to the latest year on or before the slider date.
- **Client side.** The dates of each feature layer are read once (ids and date fields only, no geometry), and the range, the bars, the counts and the change glow are then computed in the browser. Dragging and playing send nothing to the server; the map filters on the layer view. Layers over a builder cap stay on the server.
- **Range from the data.** The slider range follows the oldest and newest dates across the layers that are on, read with one statistics request per layer (two ordered reads when a service has no statistics), in the background so the panel opens at once, and again whenever the set of layers changes. A line under the slider says where the range came from. Placeholder dates (2999, 9999, 1899) are ignored; the builder sets the years the data may reach.
- **Step by day, month or year.** Buttons above the slider switch how far one notch moves; the date you are on is kept. Year for decades of annexations, Day for one season. Advanced sets how many units one notch moves (every 5 years, every 3 months). The builder sets the opening step and units per notch and can hide the buttons. A Reset button puts everything back to how the widget opened.
- **Activity bars.** Bars above the slider, with a count scale, show how much happened in each year or month (one grouped count per layer, with a per-bucket fallback for services that cannot group by an expression). Next change and Previous change jump the slider to the next busy spot.
- **Typed dates.** Date boxes accept a full date, a month, or just a year.
- **Layer list.** The panel lists the layers that follow the slider, says why any dated layer cannot follow (no exposed date field, fields unreadable, left out by a rule), only the ones turned on in the map (it follows the layer list live). A layer with several dates gets a drop down of the published field aliases so the user picks which one. Only fields the map service or web map exposes are offered.
- **Put back on close.** Every layer's own filter is restored when the widget closes (optional).
- **Presentation mode.** Press Present and a large date banner appears on the map with its own play, chapter and full screen buttons, so an audience watches the map rather than the panel. Play can walk every step (pausing on chapters) or jump chapter to chapter, with an optional loop. Keyboard: Space, arrows, Shift plus arrows, a chapter number plus Enter, G, L, W, F, Escape. A title card opens the show and a closing card ends it.
- **Chapters that set the map up.** A chapter pins a date and can carry a title, text, a picture, speaker notes, a place (with scale and rotation), a flight or a cut, its own hold time, layers to turn on and off, a basemap (well known id or portal item), and a feature to open the popup on. Everything is put back when the presentation ends.
- **Presenter window.** A second window with the speaker notes, what comes next, a running clock, a chapter list and the controls, kept in step with the map over a BroadcastChannel. Laptop screen for the presenter, projector for the map.
- **On stage.** Draw on the map (D, C clears), black screen (B) as in PowerPoint, read the chapter aloud (V, browser voice), clean stage, a slow zoom while a chapter holds, a next in countdown and a timeline strip on the banner.
- **Your brand on stage.** Colors, font, date size, corner radius and a logo for the banner, the presenter window, the slideshow and the video, set once in the builder with a live preview and a contrast check. Empty fields follow the app theme.
- **Pace and rehearsal.** Give the talk a planned length and the presenter window says ahead, behind or on pace with the time left, and keeps how long you spent on each chapter.
- **Chapter grid and spotlight.** A tiled view of the chapters with map thumbnails taken as each is visited, and a spotlight pointer that darkens the map except a circle around the mouse.
- **Story chapters from the map.** Anyone can press Add chapter from this view: the date, view, layers and basemap are captured, text and notes are typed in the panel, and the chapters present at once. Copy XML for the builder hands them to the app editor. Hidden keeps a chapter out of the show; Use rehearsed timings turns the time spent on each chapter in the last run into its hold time. They live in the browser until cleared.
- **Web slideshow.** One click turns the chapters into a one file slideshow (.html: arrows, S for notes, P to print to PDF) with a picture of the map on every slide. The map walks through the chapters to take the pictures and is put back after.
- **Video.** The whole timeline as a WebM film with the date and chapter on a caption strip, recorded in the browser (no library, no server).
- **What changed.** Step forward and the features that appeared since the previous position glow for a moment. A date stamp sits in a corner of the map (builder's choice, top right by default so it stays clear of the Esri credit strip).
- **Chapters from the data.** The busiest N years or months, or one every N, become chapters with the counts in the text and the per layer breakdown in the notes. Edit, present, export.
- **Kiosk links.** A link copied while presenting opens the app straight into the presentation (`&tmp=1`, or `&tmp=play` to start playing).
- **Copy link.** One click copies a link that opens the app on the same date, range or comparison (`?tm=2019-06-01`, `?tm=2019-01-01..2019-12-31`, `?tm=2015-06-01~2023-06-01`).
- **Set the date from another widget.** A message action lets a List, Table, Feature Info or Button widget move the slider to a selected record's date.
- **Feature counts** beside each layer for the current date, and an option to remember the last date per browser.
- **Builder settings** for range, step, modes, a layer picker read from the map (every dated layer, or only the ones you tick, grouped the way the map groups them with a checkbox per group, a search box, Tick all and Clear all, and a date field per layer), rules, year sets, presentation and chapters, panel options and XML import/export.
- **In-widget help guide** with search and a first-run hint. Theme aware, keyboard and screen reader friendly.

## Requirements

- ArcGIS Experience Builder Developer Edition 1.19 or later (tested on 1.21). EB 1.18 and earlier run React 18 and are not supported.
- The widget declares no third-party dependencies. `arcgis-map-components` (for the Compare divider), `calcite-components`, `jimu-*` and `esri/*` are supplied by Experience Builder.

## Install

1. Download `time-machine.zip` from the latest release and extract it.
2. Copy the `time-machine` folder into `client\your-extensions\widgets\` so that `manifest.json` sits **directly inside** `client\your-extensions\widgets\time-machine\`. Do not nest it a second level deep (`widgets\time-machine\time-machine` will not register).
3. Install dependencies in the `client` folder (`npm install` on Experience Builder 1.20 and earlier; `pnpm install` on 1.21 and later) and restart the client (`npm start` / `pnpm start`).
4. In the builder, add **Time Machine** to an experience and select the map widget it drives.

The zip is the widget only. The Visual Studio type shims in the repo (`time-machine/src/exb-editor-shims.d.ts`, `time-machine/src/vendor-shims.d.ts`, `time-machine/src/runtime/esri.d.ts`) are left out on purpose: their ambient `declare module` blocks are not file-scoped and would rewrite the react, jimu and esri types for every other widget in your `your-extensions` folder. If you clone instead of using the zip, delete those three files before building; nothing else depends on them.

## How the filter works

For each layer the widget picks a date field (the builder's preferred names first, then a start/end pair, then the first date field; editor tracking fields such as created_date and last_edited_date are used only when nothing else is dated, and created plus closed becomes a span) and sets `definitionExpression` on top of whatever filter the layer already has:

| Mode | One date field | Start and end fields |
|---|---|---|
| Date | `FIELD <= end of day` | `START <= end of day AND (END IS NULL OR END >= start of day)` |
| Range | `FIELD between from and to` | `START <= end of to AND (END IS NULL OR END >= start of from)` |
| Compare | left side as Date A, right side (a clone of the layer) as Date B | same, per side |

Dates are written as `TIMESTAMP 'yyyy-mm-dd hh:mm:ss'` in UTC, which every ArcGIS service accepts under standardized queries. Field names are checked against a plain-identifier pattern before they reach a query. In Compare, a map service is copied once as a whole for the right side (every visible sublayer, date B on the dated ones), so a large service may take a moment to appear.

## Presentation mode

Present adds a banner over the map (bottom or top, builder's choice): the date in large type, a progress bar with a tick per chapter, the current chapter's title, text and picture, and play, previous, next, chapter grid, spotlight, presenter window, full screen and exit buttons. The widget panel keeps working underneath. Chapters come from the settings and from the Story chapters section in the widget. While playing, reaching a chapter pauses for its hold time; in "chapter to chapter" mode play jumps straight between chapters. Layer visibility and the basemap changed by chapters are restored on exit. Presentation follows the app's theme colors. Keys: Space, arrows, Shift plus arrows, plus and minus for speed, digits plus Enter to jump to a chapter, G grid, L spotlight, D draw, Z undo a stroke, C clear, B or full stop black, comma white, V voice, W presenter, F full screen, Escape. Chapters can be hidden from the show without being removed, and the presenter window shows the map picture of the current and the next chapter.

How it compares: ArcGIS Pro's presenter mode needs Pro and a second monitor for notes; web scene slides hold a viewpoint, layers and basemap but no timeline, notes or autoplay; the retired Story Map Series had text panels but no date slider. Time Machine puts all of that on any Experience Builder map with the timeline as the spine.

## Driving the slider from other widgets

Add the **Set the Time Machine date** action to a List, Table, Feature Info or Button widget (Action tab, on record selection). The first selected record's date moves the slider; a start and end pair sets a range when Range mode is active. The builder can name the attribute to read (Panel, Message action date field); otherwise the first date-looking value is used.

## Settings

- **Time range**: opening slider step (day, month, year), units per notch, whether people may switch them, start, end, opening date, whether to grow the range to the data, and the earliest and latest year the data may push it to.
- **Modes**: which of Date, Range and Compare are offered, the opening mode, and the Play speed.
- **Layers**: every dated layer or only the ones you choose; Load layers from the map lists the map's dated layers with a checkbox and a date field drop down (aliases as published); preferred field names; rules (one field, start and end, or leave alone) matched by layer id or title; snapshot groups; restore on close.
- **Presentation**: Present button, play by step or by chapter, hold time, loop, progress bar, banner position, flight time, chapter grid, spotlight, presenter window, story chapters from the map, web slideshow export with a title and credit line, draw on the map, read aloud, clean stage, camera move, planned length, presentation look (colors, font, logo), and the chapters themselves with all their fields.
- **Panel**: layer list and counts, date stamp on the map, highlight what changed, activity bars with Next change, typed date boxes, Copy link and URL parameter, remember last date, message action field, Help button.
- **Import and export**: the whole configuration as XML, to move between apps.

## Troubleshooting

- **`time-machine is duplicated`** when the client starts: the same widget is registered twice. Check for a nested `widgets\time-machine\time-machine` folder, a leftover copy under another name, or a stale build in `client\dist\widgets\time-machine` (stop the client, delete that folder, start again).
- **A layer does not change**: it is turned off in the map (only layers turned on are listed and driven), it has no exposed date field, or a different date field is in use. Pick the field in the panel's drop down, or fix it in the settings layer picker.
- **The slider runs to the year 2999**: a placeholder date in the data. Those are ignored by default (1800 to next year); widen or narrow the window under Time range, Years the data may reach.
- **Load layers from the map finds nothing**: select the map first and save the app; a layer whose fields are not published (no popup, no fields in the service) has nothing to read.
- **Compare will not start**: the shared `arcgis-map-components` bundle did not register `arcgis-swipe`. Reload the page. If it persists, the app's Experience Builder build is older than 1.21.
- **Presenter window does not open**: the browser blocked a pop up. Allow pop ups for the app's site. The window and the map talk over a BroadcastChannel, so both must be on the same site.
- **Present button does nothing in the builder**: the banner is added through `view.ui`, which the builder's design view does not render. Preview or publish the app.
- **Settings panel is blank** in the builder: nothing under `src/setting/` may import `esri/*`. The shipped settings do not; check any local edits.

## Known limits

- Tested on Experience Builder 1.21 with Maps SDK 5.x, in Chrome and Edge, against hosted feature layers, feature layers from map services and map image layers with dated sublayers. Tile layers and imagery are driven only through year sets (group layers whose children are named by year).
- A map service draws one picture per change, so on a slow service Play shows fewer pictures than steps; the date keeps its pace and the map shows the newest date it can.
- Client side mode reads up to the builder's cap of features per layer (50,000 by default); larger layers fall back to server statistics for the range.
- Read aloud uses the browser's own voices and needs one click on the page first. Video export produces WebM (no MP4). The presenter window needs pop ups allowed for the app's site.
- Chapters from the data need the activity chart on. Story chapters made at run time live in the browser until cleared.

## Developer checks

From the widget folder, with the client's TypeScript on the path (it is, once `pnpm install` has run in `client`):

```
npx tsc -p .                     # editor type check, must print nothing
node tests/transpile.js          # syntax and emit of every source file
node --test tests/*.test.js      # 80 tests over the date logic, the layer engine, compare, presentation, the help guide and the XML codec
```

## Usage telemetry

The widget carries the GIS Division's shared `beacon.ts` module. On page load it looks for a public portal item tagged `exb-beacon-sink` in the app's portal and, only if one exists, posts anonymous usage counts (widget name, version, action names, browser family). Nothing personal, no coordinates, no attribute values and no URLs with query strings are sent. Turn it off with the **Usage telemetry** switch in the settings, browser Do Not Track, or `window.__exbBeaconDisabled = true`. A downstream install sends nothing unless that organization publishes its own sink.

## Feedback

Issues and pull requests: https://github.com/brianmcleer/time-machine-widget

Esri Community post (discussion and downloads): https://community.esri.com/en/discussion/1721122/time-machine-widget

## License

Apache-2.0. Copyright City of Grand Junction, CO.
