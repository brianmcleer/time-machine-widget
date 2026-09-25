/**
 * Time Machine - configuration.
 * Author: Brian McLeer, City of Grand Junction
 *
 * Everything the builder can set lives here. The runtime reads these keys through
 * small helpers at the top of widget.tsx and passes booleans down; components never
 * read the config themselves (handoff Section 12, item 7).
 */
// ImmutableObject is re-exported by jimu-core; import it from there rather
// than seamless-immutable so the editor shim resolves it (handoff 12.3).
import type { ImmutableObject } from 'jimu-core'

/** Slider step and the unit a date is rounded to. */
export type Granularity = 'day' | 'month' | 'year'

/** Which mode the widget opens in. */
export type TimeMode = 'single' | 'range' | 'compare'

/**
 * How one layer follows the slider.
 *   auto   the widget finds the best date field itself (default for every layer)
 *   field  use startField as the layer's one date ("as of" and "between" work on it)
 *   span   the layer has a start and an end field (a permit issued and expired, a
 *          project start and finish); a feature shows while the date is inside the span
 *   off    leave the layer alone
 */
export type LayerRuleMode = 'auto' | 'field' | 'span' | 'off'

export interface LayerRule {
  /** Map layer id, or "<serviceLayerId>::<sublayerId>" for a map image sublayer.
   *  A rule may also match by title when layerId is empty. */
  layerId: string
  /** Layer title, for the settings list and for title matching. */
  title?: string
  mode: LayerRuleMode
  startField?: string
  endField?: string
}

/**
 * A group layer whose children are dated snapshots (aerial imagery by year, a
 * parcel fabric archived each January). The widget shows the child whose year is
 * the latest one on or before the slider date and hides the rest.
 */
export interface YearSet {
  /** Map layer id of the group layer. Matches by title when empty. */
  groupLayerId: string
  title?: string
}

/** A story point in presentation mode, pinned to a date. */
export type ChapterTransition = 'fly' | 'jump'
export type ChapterMotion = 'none' | 'zoomIn' | 'zoomOut'

export interface Chapter {
  /** ISO date (yyyy-mm-dd, yyyy-mm or yyyy). */
  date: string
  title?: string
  text?: string
  /** Speaker notes: shown only in the presenter window, never to the audience. */
  notes?: string
  /** Optional place to fly to when the chapter starts. */
  lon?: number
  lat?: number
  scale?: number
  /** Map rotation in degrees, clockwise from north. */
  rotation?: number
  /** How the map moves there: a flight (default) or a cut. */
  transition?: ChapterTransition
  /** Hold time for this chapter while playing, overriding chapterHoldMs. */
  holdMs?: number
  /** Layer ids to turn on and off when the chapter starts. Put back when the presentation ends. */
  layersOn?: string[]
  layersOff?: string[]
  /** A well known basemap id (satellite, streets-vector) or a portal item id. */
  basemap?: string
  /** Open the popup on the first feature of this layer matching the where clause. */
  featureLayerId?: string
  featureWhere?: string
  /** Picture shown beside the text in the banner (https URL). */
  image?: string
  /** Slow camera move while the chapter holds; overrides chapterMotion. */
  motion?: ChapterMotion
  /** Kept in the list but left out of the show: one story serves two audiences. */
  hidden?: boolean
}

export interface Config {
  /* ---- Time range ---- */
  granularity?: Granularity
  /** ISO date (yyyy-mm-dd). Empty: the earliest date found in the data. */
  startDate?: string
  /** ISO date. Empty: today. */
  endDate?: string
  /** ISO date the slider opens on. Empty: the end of the range. */
  defaultDate?: string
  /** Let the user switch the slider step between day, month and year. */
  allowStepChange?: boolean
  /** Units per notch when the widget opens (5 with granularity year: every 5 years). */
  stepSize?: number
  /** Look through the filtered layers for their oldest and newest dates and grow the
   *  range to fit when startDate or endDate is empty. */
  fitRangeToData?: boolean
  /** Realistic window for dates read from the data. Years outside it (9999, 2999, 1899
   *  placeholders) are ignored when the range grows to fit. Empty: 1800 and next year. */
  minYear?: number
  maxYear?: number

  /* ---- Modes ---- */
  defaultMode?: TimeMode
  allowRange?: boolean
  allowCompare?: boolean
  allowPlay?: boolean
  /** Milliseconds between steps while playing. */
  playIntervalMs?: number

  /* ---- Layers ---- */
  /** Walk the map for layers with a date field and follow them all. */
  autoDiscover?: boolean
  /** Field names tried first, in order, when a layer has more than one date field. */
  preferredFields?: string[]
  /** Per-layer overrides. */
  rules?: LayerRule[]
  yearSets?: YearSet[]
  /** Put the filter back the way it was when the widget closes. */
  restoreOnClose?: boolean

  /* ---- Panel ---- */
  showLayerList?: boolean
  showDateInputs?: boolean
  showHelp?: boolean
  /** Feature counts per layer at the current date (one count request per layer per change). */
  showCounts?: boolean
  /** Bars above the slider showing how much happened in each year or month, with Next change and Previous change jumps and a CSV download. */
  showActivity?: boolean
  /** Copy link button and reading the date from the page URL. */
  allowShareLink?: boolean
  /** The URL query parameter that carries the date. */
  urlParam?: string
  /** Remember the last date per browser and reopen on it. */
  rememberDate?: boolean
  /** Attribute read by the "Set the date" message action. Empty: first date-looking value. */
  messageDateField?: string

  /* ---- Presentation ---- */
  allowPresent?: boolean
  /** 'unit': every slider step. 'chapters': jump chapter to chapter. */
  presentStep?: 'unit' | 'chapters'
  /** How long a chapter stays on screen before play moves on. */
  chapterHoldMs?: number
  presentLoop?: boolean
  presentProgress?: boolean
  bannerPosition?: 'bottom' | 'top'
  chapters?: Chapter[]
  /** Let people add chapters from the map at run time (kept in their browser, exported as XML). */
  allowStoryDraft?: boolean
  /** Presenter window with speaker notes and the next chapter. */
  allowPresenterWindow?: boolean
  /** Spotlight pointer while presenting (key L). */
  allowSpotlight?: boolean
  /** Chapter grid with map thumbnails while presenting (key G). */
  chapterGrid?: boolean
  /** Slides export (PowerPoint and web slideshow) in the Story chapters section. */
  allowDeck?: boolean
  /** Title and credit line on the exported slides. Empty: the widget label and nothing. */
  deckTitle?: string
  deckCredit?: string
  /** Ink: draw on the map while presenting (key D, C clears). */
  allowInk?: boolean
  /** Read each chapter aloud when it starts (key V toggles). */
  narrate?: boolean
  /** Hide the map's own buttons (zoom, compass, attribution stays) while presenting. */
  presentCleanStage?: boolean
  /** Slow camera move while a chapter holds, unless the chapter says otherwise. */
  chapterMotion?: ChapterMotion
  /** Planned length of the talk, for the pace readout in the presenter window. 0: none. */
  presentMinutes?: number
  /** A small date stamp in a corner of the map while the widget is open. */
  showMapStamp?: boolean
  /** Corner of the map for the date stamp. Top right keeps clear of the Esri attribution strip. */
  stampPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  /** Briefly highlight features that appeared since the previous slider position. */
  highlightNew?: boolean
  /** Video export (WebM) in the Story chapters section. */
  allowVideo?: boolean
  /** Length of the exported video in seconds. */
  videoSeconds?: number
  /** Read each feature layer's dates once and work in the browser from then on (range, bars, counts, glow). */
  clientSide?: boolean
  /** Layers with more features than this stay on the server. */
  clientMaxFeatures?: number
  /* ---- Presentation look (branding); empty means the app theme ---- */
  brandBackground?: string
  brandText?: string
  brandMuted?: string
  brandAccent?: string
  /** A key from FONT_CHOICES or a typed family name. */
  brandFont?: string
  brandDateSize?: number
  brandRadius?: number
  /** https URL of a logo shown on the banner, the presenter window, the slideshow and the video. */
  brandLogo?: string
  brandLogoHeight?: number
  /** Flight time in ms for a "fly" transition. */
  flyMs?: number

  /* ---- Telemetry ---- */
  telemetry?: boolean
}

export type IMConfig = ImmutableObject<Config>

export const DEFAULT_PREFERRED_FIELDS: string[] = [
  'date', 'event_date', 'incident_date', 'report_date', 'reported', 'date_reported',
  'issue_date', 'issued', 'issued_date', 'permit_date', 'start_date', 'startdate',
  'install_date', 'installed', 'annex_date', 'annexation_date', 'effective_date', 'effective',
  'adopted', 'adoption_date', 'ordinance_date', 'recorded', 'record_date', 'built', 'year_built', 'built_date'
]

export const CONFIG_DEFAULTS: Required<Omit<Config, 'startDate' | 'endDate' | 'defaultDate' | 'minYear' | 'maxYear'>> & Pick<Config, 'startDate' | 'endDate' | 'defaultDate' | 'minYear' | 'maxYear'> = {
  granularity: 'day',
  startDate: '',
  endDate: '',
  defaultDate: '',
  fitRangeToData: true,
  allowStepChange: true,
  stepSize: 1,
  defaultMode: 'single',
  allowRange: true,
  allowCompare: true,
  allowPlay: true,
  playIntervalMs: 800,
  autoDiscover: true,
  preferredFields: DEFAULT_PREFERRED_FIELDS,
  rules: [],
  yearSets: [],
  restoreOnClose: true,
  showLayerList: true,
  showDateInputs: true,
  showHelp: true,
  showCounts: true,
  showActivity: true,
  allowShareLink: true,
  urlParam: 'tm',
  rememberDate: false,
  messageDateField: '',
  allowPresent: true,
  presentStep: 'unit',
  chapterHoldMs: 4000,
  presentLoop: false,
  presentProgress: true,
  bannerPosition: 'bottom',
  chapters: [],
  allowStoryDraft: true,
  allowPresenterWindow: true,
  allowSpotlight: true,
  chapterGrid: true,
  flyMs: 1500,
  brandBackground: '',
  brandText: '',
  brandMuted: '',
  brandAccent: '',
  brandFont: '',
  brandDateSize: 30,
  brandRadius: -1,
  brandLogo: '',
  brandLogoHeight: 32,
  clientSide: true,
  clientMaxFeatures: 50000,
  showMapStamp: true,
  stampPosition: 'top-right',
  highlightNew: true,
  allowVideo: true,
  videoSeconds: 30,
  allowInk: true,
  narrate: false,
  presentCleanStage: true,
  chapterMotion: 'none',
  presentMinutes: 0,
  allowDeck: true,
  deckTitle: '',
  deckCredit: '',
  telemetry: true
}
