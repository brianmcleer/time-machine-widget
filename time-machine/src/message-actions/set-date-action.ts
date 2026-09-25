/**
 * Time Machine - "Set the date" message action.
 *
 * Lets a List, Table, Feature Info or Button widget drive the slider with no public
 * API: when records are selected, the first record's date is read and handed to the
 * widget through widgetStatePropChange (handoff Section 12, item 4). A string
 * selection message (a Button carrying a date) works the same way.
 *
 * The widget reads props.stateProps.request = { date, dateEnd?, nonce }. The nonce is
 * what makes the same date twice still fire.
 */
import { AbstractMessageAction, MessageType, getAppStore, appActions, type Message } from 'jimu-core'
import { readDateFromRecord } from '../runtime/lib/timeMath'

export default class SetDateAction extends AbstractMessageAction {
  filterMessageType (messageType: any): boolean {
    return [MessageType.DataRecordsSelectionChange, MessageType.DataRecordSetChange, MessageType.StringSelectionChange].indexOf(messageType) >= 0
  }

  filterMessage (_message: Message): boolean { return true }

  onExecute (message: Message): boolean {
    try {
      const msg: any = message
      let date: number = NaN
      let dateEnd: number = NaN
      if (msg.type === MessageType.StringSelectionChange) {
        const r = readDateFromRecord({ attributes: { value: msg.str } }, null)
        date = r.start; dateEnd = r.end
      } else {
        const records: any[] = msg.records || (msg.dataRecordSets && msg.dataRecordSets[0] && msg.dataRecordSets[0].records) || []
        const rec = records[0]
        if (!rec) return false
        const feature = typeof rec.getData === 'function' ? { attributes: rec.getData() } : (rec.feature || rec)
        const cfg: any = this.widgetConfig()
        const r = readDateFromRecord(feature, cfg && cfg.messageDateField ? String(cfg.messageDateField) : null)
        date = r.start; dateEnd = r.end
      }
      if (!isFinite(date)) return false
      getAppStore().dispatch(appActions.widgetStatePropChange(this.widgetId, 'request', {
        date, dateEnd: isFinite(dateEnd) ? dateEnd : undefined, nonce: Date.now() + Math.random()
      }))
      return true
    } catch (e) {
      return false
    }
  }

  private widgetConfig (): any {
    try {
      const w = getAppStore().getState().appConfig.widgets[this.widgetId]
      const c = w && w.config
      return c && typeof c.asMutable === 'function' ? c.asMutable({ deep: true }) : c
    } catch (e) { return null }
  }
}
