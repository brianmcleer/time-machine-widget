/** @jsx jsx */
/**
 * FirstRunHint - the tinted banner that points a first-time user at the help
 * guide, shown until they dismiss it once.
 *
 * Markup is the widget handoff Section 10.5 recipe, and the colors are the
 * Section 11.2 banner recipe: `tokens.infoBg` background, `tokens.text`
 * foreground, a 3px `tokens.primary` bar on the left, `tokens.radius` corners.
 *
 * It exists as its own function component for one reason: `useTokens()` is a
 * hook and the Print Advanced widget is a class component, so the class cannot
 * call it. Same arrangement as HelpPopup. Strings and callbacks come in as
 * props so the file needs no translate hook of its own.
 *
 * WHY NOT CSS VARIABLES: this banner was first written with
 * `background: var(--sys-color-info-light, ...)`, which is exactly what the
 * handoff's contrast lesson forbids. Some Experience themes define the "light"
 * variants as saturated colors, and this one rendered a solid blue block with
 * white text instead of a quiet tinted note. `tokens.infoBg` mixes the primary
 * into the surface color at 10 percent, so it is tinted in every theme, and
 * the text color is set explicitly rather than inherited.
 */
import { React, jsx } from 'jimu-core'
import { Button } from 'jimu-ui'
import { CalciteIcon } from 'calcite-components'
import { useTokens } from '../theme'

export interface FirstRunHintProps {
  title: string
  body: string
  linkLabel: string
  dismissLabel: string
  onOpenHelp: () => void
  onDismiss: () => void
}

const FirstRunHint: React.FC<FirstRunHintProps> = ({
  title, body, linkLabel, dismissLabel, onOpenHelp, onDismiss
}) => {
  const tokens = useTokens()
  return (
    <div
      role='note'
      style={{
        // The panel already carries its own padding, so this sits flush
        // rather than using the reference widget's 14px side margins.
        margin: '0 0 10px 0',
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        background: tokens.infoBg,
        color: tokens.text,
        border: `1px solid ${tokens.divider}`,
        borderLeft: `3px solid ${tokens.primary}`,
        borderRadius: tokens.radius,
        fontSize: '12px',
        lineHeight: 1.5
      }}
    >
      <span style={{ color: tokens.primary, marginTop: '1px' }} aria-hidden='true'>
        <CalciteIcon icon='lightbulb' scale='s' />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block', marginBottom: '2px' }}>{title}</strong>
        {body}
        {' '}
        <button
          type='button'
          onClick={onOpenHelp}
          style={{ border: 'none', background: 'transparent', padding: 0, color: tokens.primary, cursor: 'pointer', textDecoration: 'underline', font: 'inherit', outlineOffset: 2 }}
          onFocus={(e: any) => { e.currentTarget.style.outline = `2px solid ${tokens.primary}` }}
          onBlur={(e: any) => { e.currentTarget.style.outline = '' }}
        >
          {linkLabel}
        </button>
      </span>
      <Button size='sm' type='tertiary' icon onClick={onDismiss} title={dismissLabel} aria-label={dismissLabel}>
        <CalciteIcon icon='x' scale='s' />
      </Button>
    </div>
  )
}

export default FirstRunHint
