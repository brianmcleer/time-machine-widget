/**
 * Time Machine - help guide content. The only per-widget file of the help pattern;
 * HelpPopup.tsx and theme.ts are copied unchanged (handoff Section 10).
 *
 * Sections: start, modes, play, layers, present, stage, story, export, share, keep,
 * trouble, tips. Every line is gated by the same config reads the UI uses, so the guide
 * never describes a button that is not there.
 */
import type { HelpSection } from './components/HelpPopup'

/** Flags computed by the widget from the same config reads the UI uses. */
export interface HelpFeatures {
  range: boolean
  compare: boolean
  play: boolean
  dateInputs: boolean
  layerList: boolean
  yearSets: boolean
  sublayers: boolean
  restoreOnClose: boolean
  counts: boolean
  shareLink: boolean
  messageAction: boolean
  rememberDate: boolean
  present: boolean
  chapters: boolean
  chapterJump: boolean
  loop: boolean
  activity: boolean
  step: boolean
  grid: boolean
  spotlight: boolean
  presenter: boolean
  story: boolean
  deck: boolean
  /** Draw on the map is allowed. */
  stage: boolean
  pace: boolean
  video: boolean
  highlight: boolean
  cleanStage: boolean
  stamp: boolean
  client: boolean
}

type T = (id: string, values?: Record<string, string>) => string

export function buildHelpSections (t: T, f: HelpFeatures): HelpSection[] {
  const when = (on: boolean, ...ids: string[]): string[] => (on ? ids.map((id: string) => t(id)) : [])
  const anyChapters = f.chapters || f.story

  const start = [
    f.dateInputs ? t('helpStart1') : t('helpStart1').replace(', or type a date in the box,', ''),
    t('helpStart2'),
    t('helpStart3')
  ]

  const modes = f.range || f.compare || f.activity || f.step
    ? [{
        key: 'modes',
        icon: 'sliders-horizontal',
        title: t('helpModesTitle'),
        intro: t('helpModesIntro'),
        body: [...when(f.step, 'helpStep'), t('helpModesSingle'), ...when(f.range, 'helpModesRange'), ...when(f.compare, 'helpModesCompare'), ...when(f.range || f.compare, 'helpModesWhole'), ...when(f.compare && f.sublayers, 'helpModesCompareSub'), ...when(f.activity, 'helpActivity')]
      }]
    : []

  const play = f.play
    ? [{ key: 'play', icon: 'play', title: t('helpPlayTitle'), body: [t('helpPlay1'), t('helpPlay2'), t('helpPlay3'), ...when(f.step, 'helpPlayLoop'), ...when(f.compare, 'helpPlayCompare')] }]
    : []

  const layers = f.layerList
    ? [{
        key: 'layers',
        icon: 'layers',
        title: t('helpLayersTitle'),
        intro: t('helpLayersIntro'),
        body: [t('helpLayers1'), t('helpLayersField'), t('helpLayersSkipped'), ...when(f.highlight, 'helpHighlight'), ...when(f.stamp, 'helpStamp'), t('helpLayers2'), ...when(f.yearSets, 'helpLayersSets'), ...when(f.counts, 'helpLayersCounts'), t('helpLayers3'), t('helpLayersFind')]
      }]
    : []

  const present = f.present
    ? [{
        key: 'present',
        icon: 'presentation',
        title: t('helpPresentTitle'),
        intro: t('helpPresentIntro'),
        body: [t('helpPresent1'), anyChapters ? t('helpPresentKeys') : t('helpPresentKeysNoChapters'), ...when(anyChapters, 'helpPresentChapters'), ...when(f.chapters && f.chapterJump, 'helpPresentChaptersJump'), ...when(f.loop, 'helpPresentLoop'), ...when(f.shareLink, 'helpPresentKiosk')]
      }]
    : []

  const stage = f.present
    ? [{
        key: 'stage',
        icon: 'pencil',
        title: t('helpStageTitle'),
        intro: t('helpStageIntro'),
        body: [...when(f.grid && anyChapters, 'helpPresentGrid'), ...when(f.spotlight, 'helpPresentSpotlight'), ...when(f.stage, 'helpPresentInk'), t('helpPresentBlack'), t('helpPresentVoice'), ...when(f.presenter, 'helpPresentPresenter'), ...when(f.presenter && f.pace, 'helpPresentPace'), ...when(f.cleanStage, 'helpPresentClean')]
      }]
    : []

  const story = f.present && f.story
    ? [{
        key: 'story',
        icon: 'book',
        title: t('helpStoryTitle'),
        intro: t('helpStoryIntro'),
        body: [t('helpPresentStory'), t('helpStoryButtons'), ...when(f.activity, 'helpPresentAuto'), t('helpStoryXml')]
      }]
    : []

  const exp = f.present && f.story && f.deck
    ? [{
        key: 'export',
        icon: 'download',
        title: t('helpExportTitle'),
        body: [t('helpPresentDeck'), ...when(f.video, 'helpPresentVideo')]
      }]
    : []

  const share = f.shareLink || f.messageAction || f.rememberDate
    ? [{
        key: 'share',
        icon: 'link',
        title: t('helpShareTitle'),
        body: [...when(f.shareLink, 'helpShare1', 'helpShare2'), ...when(f.messageAction, 'helpShareMessage'), ...when(f.rememberDate, 'helpShareRemember')]
      }]
    : []

  return [
    { key: 'start', icon: 'clock', title: t('helpStartTitle'), ordered: true, body: start },
    ...modes,
    ...play,
    ...layers,
    ...present,
    ...stage,
    ...story,
    ...exp,
    ...share,
    { key: 'keep', icon: 'folder', title: t('helpKeepTitle'), body: [t('helpKeep1'), ...when(f.client, 'helpKeepClient'), t('helpReset'), f.restoreOnClose ? t('helpKeepRestore') : t('helpKeepStay')] },
    {
      key: 'trouble',
      icon: 'exclamation-mark-triangle',
      title: t('helpTroubleTitle'),
      body: [
        t('helpTrouble1'), t('helpTrouble2'), ...when(f.compare, 'helpTrouble3'), ...when(f.present, 'helpTroublePresent'),
        t('helpTrouble4'), t('helpTroubleRange'), ...when(f.present && f.presenter, 'helpTroublePresenter'), ...when(f.present, 'helpTroubleVoice'),
        ...when(f.present && f.story && f.deck && f.video, 'helpTroubleVideo'), ...when(f.present && f.story && f.deck, 'helpTroubleDownload'),
        ...when(f.shareLink || (f.present && f.story), 'helpTroubleCopy'), t('helpTroubleContact')
      ]
    },
    { key: 'tips', icon: 'lightbulb', title: t('helpTipsTitle'), body: [t('helpTips1'), ...when(f.dateInputs, 'helpTips2')] }
  ]
}
