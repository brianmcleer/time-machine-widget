# Time Machine: troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| A layer never changes | No date field, or the field chosen is not the one wanted | The panel lists the field. Add a rule (Layers, Layer rules) with the right field, or rename the preferred fields list. |
| Slider range is enormous | One record with a bad date (1900, 2099) stretched the data range | Set Start and End in the settings; turn off Grow the range to fit the data. |
| Map slow while dragging | Many large layers redrawing | Untick layers in the panel, or set the slider step to month or year. |
| Compare does nothing, panel drops back to Date | `arcgis-swipe` not registered | Reload. Check the console for `arcgis-swipe is not registered`; the app's EB build must be 1.21 or later. |
| Compare shows a sublayer identical on both sides | Map image sublayers cannot be cloned | Expected. Publish the layer as a feature layer if a true compare is needed. |
| Filter stays after the widget closes | Put layers back when the widget closes is off | Turn it on, or open the widget and press Today. |
| Two copies of the widget fight | Both in one app on one map | Each keeps its own original filter per widget id, but the last one to apply wins on screen. Use one per map. |
| Settings panel blank | An `esri/*` import reached `src/setting` | Keep settings esri-free (handoff 12.1). |
| `npx tsc -p .` errors mention jimu-core files | A `paths` entry crept into `tsconfig.json` | Mode B has no `baseUrl` or `paths`. Copy the tsconfig from Print Advanced. |
