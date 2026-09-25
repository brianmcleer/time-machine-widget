// vendor-shims.d.ts
// City of Grand Junction GIS Division
//
// Widget-specific companion to exb-editor-shims.d.ts (the untouched master copy).
// Editor-only: emits no JavaScript and the Experience Builder webpack build never
// reads it. Listed in publish.ps1 $ReleaseOnlyExclude (src\*-shims.d.ts) so it
// stays in the repo and out of the release zip.
//
// NO IMPORTS IN THIS FILE: an import of a bare specifier inside a declare module
// block triggers real module resolution into client\node_modules (IDE1100).

// Experience Builder's React wrappers for Calcite web components (jimu-ui/calcite-components).
// Supplied by Experience Builder, so deliberately not a package.json dependency.
declare module 'calcite-components' {
  export const CalciteIcon: (props: { icon: string, scale?: 's' | 'm' | 'l', [key: string]: any }) => any
  export const CalciteSlider: (props: { [key: string]: any }) => any
  export const CalciteChip: (props: { [key: string]: any }) => any
}

// Experience Builder's shared ArcGIS Maps SDK components bundle (registers <arcgis-swipe>).
declare module 'arcgis-map-components'

declare module 'esri/request' {
  const esriRequest: (url: string, options?: any) => Promise<{ data: any }>
  export default esriRequest
}

declare module 'esri/core/Collection' {
  export default class Collection<T = any> {
    constructor (items?: T[])
    [key: string]: any
    toArray (): T[]
    removeAll (): void
  }
}

declare module 'esri/core/reactiveUtils' {
  export function watch (getValue: () => any, callback: (value: any, ...args: any[]) => void, options?: any): { remove (): void }
  export function when (getValue: () => any, callback: (value: any, ...args: any[]) => void, options?: any): { remove (): void }
  export function whenOnce (getValue: () => any, options?: any): Promise<any>
}

declare module '*.svg' {
  const content: any
  export default content
}

declare function require (moduleName: string): any

// Message action base class and message type, not in the master shim. Ambient module
// declarations with the same name merge, so this only adds to the master's 'jimu-core'.
declare module 'jimu-core' {
  export type Message = any
  export class AbstractMessageAction {
    constructor (...args: any[])
    id: string
    name: string
    widgetId: string
    filterMessageType (messageType: any, messageWidgetId?: string): boolean
    filterMessage (message: any): boolean
    onExecute (message: any, actionConfig?: any): Promise<boolean> | boolean
    onRemoveListen (messageType: any, messageWidgetId?: string): void
    destroy (): void
    [key: string]: any
  }
}
