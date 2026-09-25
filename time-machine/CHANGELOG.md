# Changelog

All notable changes to the Time Machine widget. Newest first. Every release bumps `manifest.json` and `package.json` together.

## 1.0.1 (2026-09-25)

Fixed
- CodeQL findings from the first scan: the presentation look preview only shows a logo address with no markup characters; the end date field name pattern lost a stray anchor (`to_date` and `todate` still match); the test transpiler reads directory entries with their types instead of a separate stat call.

## 1.0.0 (2026-09-25)

First public release. Internal builds 1.1 to 1.7 (September 2026) are folded into this version; their notes are kept below for reference.

Added
- One date slider that drives every dated layer in the map: feature layers, hosted layers and map service sublayers. The date field is picked per layer (builder's preferred names, then start and end pairs, then the first date field; editor tracking fields only as a last resort). Dates before 1970 and placeholder dates (2999, 9999) are handled.
- As of, Range and Compare (two dates behind a drag divider) modes. Step by day, month or year, with an Advanced option for every N steps. Play with speed, loop, Reset, Today, Previous change and Next change.
- Range read from the data: the slider fits the oldest and newest dates of the layers that are on, and refits when layers are turned on or off.
- Activity chart with x and y axes (features per year or month) and a jump to the busiest bar.
- Client side mode (default): each feature layer's dates are read once, then range, counts, activity and the change glow need no requests. Feature layers filter on the layer view; map services refresh once per change and never pile up requests.
- Layer list with per layer on and off, date field shown, skipped layers explained, counts, what changed glow, date stamp on the map (corner is a setting).
- Presentation mode: banner with the date, progress bar, chapter grid, thumbnails, spotlight, drawing (undo, clear), black and white screen, read aloud, presenter window with notes, next up, pace and dwell, speed button, keyboard shortcuts (digits plus Enter jump to a chapter, plus and minus for speed), title and end cards, kiosk links, clean stage.
- Chapters that set the map up: date, title, text, picture, notes, place, flight or cut, hold time, layers on and off, basemap, feature popup, camera move, hidden.
- Story chapters made at run time (capture the view, chapters from the data, rehearsed timings, XML export for the builder), web slideshow export and video export (WebM).
- Presentation look: colors, font, date size, corner radius and logo set in the builder with a live preview and contrast check.
- Settings: layer picker read from the map (group layers as headings with a group checkbox, search, tick all, per layer date field), rules, year sets, performance, presentation, branding, XML import and export.
- In-widget help guide (twelve sections, every line gated by the settings), first run hint, WCAG 2.1 AA pass (labels, live regions, focus, reduced motion, contrast, 44 px touch targets on stage).
- Copy link, URL parameter, remember last date, Set the date message action.
- 80 node tests over the date logic, the layer engine, compare, presentation, story, stage, the help guide, branding, the date cache and the XML codec.

## Internal build notes (folded into 1.0.0)

### 1.7.0

- Play keeps its speed on a map service: the date moves at the chosen speed, one refresh is kept pending per service and sent the moment the picture in flight lands, so the server never piles up requests (a fast play used to queue seconds of exports and freeze the map) and the map always shows the newest date it can.

- Play speed on stage: a speed button on the banner (0.25x to 6.7x) and the plus and minus keys, with the change announced. Present, play and the presenter window keep the widget's speed.

- Map services (map image layers with dated sublayers) only redrew on the first filter change; every later slider move, and the whole of Play and Present, left the old picture on the map. The widget now asks the service for a fresh picture after each change (once per service), in Compare too, and Play waits for that picture before the next step.

- Presentation with data: when the picked layers are not in the map on screen (a map widget with several maps), every dated layer of that map follows the slider and the panel says so, instead of nothing filtering. Present moves the slider to the first chapter, or the oldest date, when it was sitting at today, so the story starts at the start.

- Turning a dated layer or group on in the map now refits the slider range to the layers that are on, and a widget that found no layers reads the map again when the visibility changes. The picked layers message says what to do. In a map widget with several maps, the settings picker heads the list with the map name.

- The map reader in the settings walks the map's data source tree (group layers, map services with sublayers, feature services) and falls back to the rendered map's layer parents, so group layers show as headings whichever way the builder created the layers. A picked layer keeps its rule when the map gives it a new id: rules match by id first, then by title.

- Settings layer picker rebuilt: one clean list instead of wrapped cards, group layers from the map as headings with a checkbox that takes the whole group (part ticked shows as mixed), open and close per group, a search box, Tick all and Clear all, a count of how many dated layers follow the slider, and Read the map again. The chapter layer picker shows the group in front of each layer name.

- Date stamp corner: a new setting (top right by default) so the stamp does not sit on the Esri credit strip; a bottom corner is lifted above the strip. Existing apps move to top right unless the builder picks a corner.

- Presentation deep dive (better than PowerPoint round). Keys: type a chapter number and press Enter to jump to it; a full stop blacks the screen, a comma whites it; Z removes the last stroke of the drawing. Banner: title card when the show opens and a closing card at the end, Back and Step buttons, a Clear the drawing button, buttons wrap and grow to 44 px on touch screens, a progress bar the screen reader can read. Presenter window: the map picture of the current chapter beside the notes and of the next chapter beside Up next. Story draft: chapters can be hidden from the show without being removed; Use rehearsed timings turns the time spent on each chapter in the last run into its hold time. Settings: Hidden checkbox per chapter. Drawing clears itself when the next chapter starts. Read aloud on a kiosk explains that the page needs one click before the voice can start.

- Fixed: the y axis labels of the activity chart were clipped by the chart's overflow rule and showed nothing (the bars now sit in their own scrolling box); a stale chapter flight could land after exit; hold and drift started before the flight arrived; the popup of the previous chapter stayed open on a chapter with no feature; exiting the show put the wrong mode back and kept play running; Escape closed the show before the open chapter grid; exports could start while presenting; the grid did not follow chapter edits; when two chapters share a date the later one wins; play past the last chapter stops instead of drifting; kiosk play respects the play switch; presenter window closes with the page; the banner only re-renders its tokens when they change.

### 1.6.0

- Presenting with the panel collapsed: closing the panel no longer ends the show or puts the layers back; the banner and keys keep driving the map, and the close rules apply when you exit. While the dates of a layer are still loading into the browser, nothing is asked of the server for that layer (no double load).

- Audit of the client side and branding code: placeholder dates no longer collapse a cached range; a filter set by another widget is adopted instead of overwritten; a layer removed and re-added gets a fresh layer view; a late layer view applies the date the slider is on now; the cache is dropped on a map switch; services that ignore paging are refused; accent text picks black or white at the right luminance; keyword colors like transparent are refused; unbalanced quotes in a font name are refused; the settings warn about accent contrast and only compare colors the builder set; the color picker explains a non hex value; play waits on the driven layers only.

- Presentation look: the builder sets card, text, secondary text and accent colors, a font (a list or a typed family), the date size, corner radius and a logo. Applied to the banner, the chapter grid, the presenter window, the web slideshow, the video caption strip and the ink color. Empty means the app theme. The settings show a live preview and warn when text on the card reads under 4.5 to 1.

### 1.5.1

- PowerPoint export removed (presentation mode and the web slideshow cover it); `lib/zip.ts` gone with it.

- Client side mode (Performance section, on by default): the dates of each feature layer are read once when the widget opens (object id and date fields, no geometry, paged, up to a builder cap of 50,000), and from then on the range, the activity bars, the counts and the change glow are computed in the browser with no requests. The range is exact the moment the read lands.

- Feature layers are now filtered on the layer view (client side), so the map changes the instant the slider moves, with no request and no redraw wait; map service sublayers still use the server. Play never runs ahead of the map: it waits for the last step to draw (two ticks at most). The filter is applied at once while playing instead of after a short debounce.

Audit pass: bugs, accessibility, help guide.
- Fixed: leaving the page or switching maps while presenting left the map without its buttons and with the story's layers and basemap; exports did not put Range or Compare back; a slow Compare start could leave an orphan divider; a step change after a layer was added misplaced the handle; kiosk links did not play; chapter flights kept running after exit; the glow and screenshots fought each other during exports; closing the panel could bring the filter back; per chapter hold was ignored in chapter to chapter play; date only fields got TIMESTAMP literals (now DATE); rule field names are checked; two tabs no longer drive each other's presenter.
- Accessibility: shortcuts never swallow browser shortcuts or a focused control's keys; the banner announces only chapter changes; slider handles read the date; map status is announced once a drag settles; chapter grid tiles are buttons with focus return; Present and Exit move focus; the black screen is a button; the spotlight moves with the arrow keys; animations respect reduced motion; secondary text no longer relies on opacity; presenter pace colours follow the theme; date boxes are named as labelled; playback is a group; icon buttons in the presenter window are named; generated pages carry the app language; alt text on chapter and slide pictures; settings hints are tied to their switches and every settings field is labelled.
- Guide: twelve sections (start, modes, play, layers, present, stage, story, export, share, keep, trouble, tips), every control named as the UI spells it, gating fixed for black screen, read aloud, clean stage, chapter grid, slides, video and chapters from the data, new troubleshooting lines for the presenter window, video, downloads, clipboard and the range read, first run hint in one sentence.
- Panel: Reset has a label, Remove all asks first, story chapters show formatted dates, the skipped layers list sits at the end of the layer list in plain words, the keys line points to the guide.

### 1.5.0

- Video export: the whole timeline as a WebM film (MediaRecorder, no library) with the date and chapter on a caption strip; builder sets the length.
- What changed: features that appeared since the previous slider position glow for a moment (layer view highlight, capped at 2,500 features).
- Date stamp on the map (bottom left) so the date is on screen with the panel closed; hidden while presenting.
- Settings: pick layers from the map for each chapter (turn on, turn off, leave as is) instead of typing ids.

### 1.4.0

- On stage: draw on the map (D, C clears, pen pressure aware), black screen (B), read the chapter aloud with the browser voice (V), clean stage (map buttons step aside), a slow zoom while a chapter holds (builder default, per chapter override), "Next in N s" countdown and a timeline strip in the banner, chapter text fades in.
- Presenter window: pace against a planned length (ahead, behind, on pace, time left) and rehearsal timings per chapter.
- Slides export: pictures are taken at the view's own aspect ratio, after the map has really finished drawing (basemap swaps included), and fitted on the slide without stretching.
- Play can start over at the end (Advanced). Feature total beside the date. Find box in the layer list when there are many layers.
- Reset beside Today; five play speeds.

### 1.3.0

- Presentation 2.0: chapters can set the map up (layers on and off, basemap, feature popup, rotation, flight or cut, own hold time, picture, speaker notes); the map is put back on exit.
- Presenter window (key W) with speaker notes, what is next, a clock, a chapter list and the controls, in step with the map over a BroadcastChannel.
- Chapter grid (key G) with map thumbnails, and a spotlight pointer (key L).
- Story chapters: Add chapter from this view captures the date, view, layers and basemap at run time; chapters are kept in the browser, present at once, and export as XML for the builder.
- Slides export: PowerPoint (.pptx written as OOXML parts and zipped in the browser, picture per slide, speaker notes) and a one file web slideshow (.html with notes view and print to PDF). The map walks the chapters for the pictures.
- Chapters from the data: busiest N periods or one every N, with counts in the text and per layer counts in the notes.
- Kiosk links: a link copied while presenting opens the presentation (`tmp=1` or `tmp=play`).
- The slider range now follows the layers that are on: it refits to their oldest and newest dates whenever that set changes, unless the builder fixed the start or the end.
- The layer list always names the date field in use (its published alias).
- Step by Day, Month or Year buttons above the slider (builder switch to hide them); the date in view is kept on switch and remembered with the date.
- Statistics read is case tolerant and falls back to two ordered reads when a service has no statistics; a line under the slider says where the range came from.
- Download counts removed (not worth the button).
- Editor tracking dates (created_date, last_edited_date, editFieldsInfo) are no longer the first choice; a real story date wins, created plus closed becomes a span, and the builder's exact preferred name still wins.
- The layer list explains why a dated layer cannot follow the slider. Field reads go through esri/request so secured services answer.
- Dates before 1970 (negative epoch values) were dropped from the range and from records; fixed, so 1880s annexations set the start.
- Activity chart has a real y axis (count scale, gridlines, caption) and x gridlines at the tick dates; tick labels sit at their dates. The one handle mode is called As of.
- Advanced: one notch can move several units (every 5 years, every 3 months); builder default Units per notch, user changes it beside the Step buttons. Play, arrows and the slider follow it.
- Reset button beside Today: opening date, step and mode, every layer ticked, nothing playing, remembered date cleared.
- New icon.

### 1.2.0

- Layer list shows only layers turned on in the map, and follows the map's layer list live.
- A layer with more than one date field is listed once with a drop down of the published aliases; only fields exposed by the map service or web map are offered.
- Settings: choose every dated layer or only the ones you tick; Load layers from the map reads the selected map through the data source manager and writes one rule per ticked layer.
- Settings: earliest and latest year the data may reach. Placeholder dates (2999, 9999, 1899) no longer stretch the slider; statistics are re-asked inside the window.
- Faster open: the panel shows at once on a provisional range and grows it from the statistics in the background, visible layers first, with a timeout per request. Field reads run in parallel, one request per map service.
- Activity bars above the slider (grouped count per year or month per layer, bucket count fallback), Next change and Previous change jumps. Panel switch to turn it off.
- New icon: a clock inside a map pin with a rewind arrow.
- Plain language explainer under the date for each mode. Help guide and XML import and export updated.

### 1.1.0 internal (2026-09-24)

### Added
- Presentation mode: on-map banner (date, progress bar with chapter ticks, chapter title and text, play, previous, next, full screen, exit), chapters in the settings with an optional place to fly to, hold on chapter, chapter-to-chapter play, loop, keyboard control, theme tokens throughout.
- Copy link button and `?tm=` URL parameter (single, `..` range, `~` compare) that opens the app on a date.
- "Set the Time Machine date" message action for List, Table, Feature Info and Button widgets; builder-named attribute or the first date-looking value.
- Feature counts beside each layer at the current date.
- Remember the last date per browser (off by default).
- Compare now copies map services for the right side, so map image sublayers compare properly.

### Changed
- Re-discovery after a layer is added keeps the slider where it was.

### 1.0.0 internal (2026-09-24)

### Added
- Date slider that filters every dated layer in the map client side: feature, hosted, GeoJSON, CSV and map image sublayers, through group and nested group layers.
- Date, Range and Compare modes. Compare clones feature-type layers for the second date and hangs an `arcgis-swipe` divider on the view; map image sublayers follow the left date on both sides.
- Play with three speeds, step and jump buttons, Today and Whole range.
- Automatic date field choice: preferred names, then start/end pairs, then the first date field. Builder rules override per layer by id or title.
- Snapshot groups by year (aerials, archived layers) switch to the latest year on or before the slider date.
- Slider range from the data through one min/max statistics request per layer.
- Typed date boxes accepting yyyy, yyyy-mm or yyyy-mm-dd.
- Layer list with per-layer on/off, All on, All off.
- Every layer's own filter is remembered and restored on close (optional).
- Builder settings with XML import and export.
- In-widget help guide (Section 10 pattern), first-run hint, theme tokens, live status region, keyboard-reachable controls.
- Beacon usage telemetry (shared module, off by default outside a portal with a sink).
- Mode B Visual Studio tsconfig and shims; test suite runnable with plain Node.
