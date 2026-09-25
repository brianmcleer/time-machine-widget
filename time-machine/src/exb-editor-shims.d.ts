/// <reference lib="es2020" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

// exb-editor-shims.d.ts
// City of Grand Junction GIS Division
//
// Editor-only declarations for Visual Studio under Experience Builder 1.21
// (pnpm layout). Emits no JavaScript, changes no widget behavior. The EB
// webpack build resolves the real packages and never reads this file.
//
// Why this file exists: on this EB install Visual Studio cannot read ANY file
// under client\node_modules (IDE1100 "Access to the path is denied" on the
// pnpm junctions: @types\react, @arcgis\core, react-intl, ...). Every module
// the widget needs is therefore declared here, ambiently, and tsconfig.json
// has no "paths" and "types": [] so VS never tries to open node_modules or
// client\jimu-core\lib at all. Ambient `declare module` names are consulted
// before path/node_modules resolution, so these win unconditionally.
//
// Fidelity: React's component/event/style types are declared closely enough
// to type-check this widget with real props/state types. jimu-core and
// jimu-arcgis expose the members this widget uses (React, AllWidgetProps,
// ImmutableObject, JimuMapView, JimuMapViewComponent) plus common extras as
// `any`. When editing under VS, treat jimu members not listed here as `any`
// and let the EB build be the type authority.
//
// Location: src/exb-editor-shims.d.ts (picked up by tsconfig "include").

// ───────────────────────────── React (minimal) ─────────────────────────────

declare module 'react' {
    export type Key = string | number | bigint
    export type ReactNode = any
    export interface ReactElement<P = any, T = any> { type: T; props: P; key: Key | null }
    export type ReactChild = ReactElement | string | number
    export type FC<P = {}> = (props: P & { children?: ReactNode }) => ReactElement | null
    export type FunctionComponent<P = {}> = FC<P>
    export type ComponentType<P = {}> = FC<P> | (new (props: P) => Component<P, any>)
    export type PropsWithChildren<P = unknown> = P & { children?: ReactNode }
    export type Ref<T> = RefObject<T> | ((instance: T | null) => void) | null
    export interface RefObject<T> { current: T | null }
    export interface MutableRefObject<T> { current: T }
    export function createRef<T>(): RefObject<T>
    export function createElement(type: any, props?: any, ...children: any[]): ReactElement
    export function cloneElement(element: ReactElement, props?: any, ...children: any[]): ReactElement
    export function isValidElement(object: any): object is ReactElement
    export function memo<T>(component: T, propsAreEqual?: (prev: any, next: any) => boolean): T
    export function forwardRef<T, P = {}>(render: (props: P, ref: Ref<T>) => ReactElement | null): FC<P & { ref?: Ref<T> }>
    export const Fragment: any
    export const StrictMode: any
    export const Suspense: any
    export const Children: {
        map<T>(children: any, fn: (child: any, index: number) => T): T[]
        forEach(children: any, fn: (child: any, index: number) => void): void
        count(children: any): number
        only(children: any): ReactElement
        toArray(children: any): any[]
    }

    // Hooks (class widget today; declared so future edits type-check)
    export type Dispatch<A> = (value: A) => void
    export type SetStateAction<S> = S | ((prevState: S) => S)
    export type DependencyList = ReadonlyArray<any>
    export type EffectCallback = () => void | (() => void)
    export function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>]
    export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>]
    export function useEffect(effect: EffectCallback, deps?: DependencyList): void
    export function useLayoutEffect(effect: EffectCallback, deps?: DependencyList): void
    export function useRef<T>(initialValue: T): MutableRefObject<T>
    export function useRef<T>(initialValue: T | null): RefObject<T>
    export function useRef<T = undefined>(): MutableRefObject<T | undefined>
    export function useMemo<T>(factory: () => T, deps: DependencyList): T
    export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: DependencyList): T
    export function useReducer(reducer: any, initialArg: any, init?: any): [any, Dispatch<any>]
    export function useContext<T>(context: Context<T>): T
    export function useId(): string
    export interface Context<T> { Provider: any; Consumer: any; displayName?: string }
    export function createContext<T>(defaultValue: T): Context<T>

    // Styles: open map; every CSS property name is accepted.
    export interface CSSProperties { [property: string]: string | number | undefined | null }

    // Events, backed by the DOM lib types.
    export interface SyntheticEvent<T = Element, E = Event> {
        nativeEvent: E
        currentTarget: EventTarget & T
        target: EventTarget & T
        type: string
        bubbles: boolean
        cancelable: boolean
        defaultPrevented: boolean
        eventPhase: number
        isTrusted: boolean
        timeStamp: number
        preventDefault(): void
        isDefaultPrevented(): boolean
        stopPropagation(): void
        isPropagationStopped(): boolean
        persist(): void
    }
    export interface UIEvent<T = Element, E = globalThis.UIEvent> extends SyntheticEvent<T, E> { detail: number; view: any }
    export interface ChangeEvent<T = Element> extends SyntheticEvent<T> { target: EventTarget & T }
    export interface FormEvent<T = Element> extends SyntheticEvent<T> {}
    export interface FocusEvent<T = Element, R = Element> extends SyntheticEvent<T, globalThis.FocusEvent> { relatedTarget: (EventTarget & R) | null }
    export interface KeyboardEvent<T = Element> extends UIEvent<T, globalThis.KeyboardEvent> {
        key: string; code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean
        repeat: boolean; locale: string; location: number; getModifierState(key: string): boolean
    }
    export interface MouseEvent<T = Element, E = globalThis.MouseEvent> extends UIEvent<T, E> {
        altKey: boolean; button: number; buttons: number; clientX: number; clientY: number
        ctrlKey: boolean; metaKey: boolean; movementX: number; movementY: number
        pageX: number; pageY: number; relatedTarget: EventTarget | null
        screenX: number; screenY: number; shiftKey: boolean; getModifierState(key: string): boolean
    }
    export interface PointerEvent<T = Element> extends MouseEvent<T, globalThis.PointerEvent> {
        pointerId: number; pressure: number; width: number; height: number
        pointerType: 'mouse' | 'pen' | 'touch'; isPrimary: boolean
    }
    export interface DragEvent<T = Element> extends MouseEvent<T, globalThis.DragEvent> { dataTransfer: DataTransfer }
    export interface TouchEvent<T = Element> extends UIEvent<T, globalThis.TouchEvent> {
        altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean
        touches: TouchList; targetTouches: TouchList; changedTouches: TouchList; getModifierState(key: string): boolean
    }
    export interface WheelEvent<T = Element> extends MouseEvent<T, globalThis.WheelEvent> { deltaMode: number; deltaX: number; deltaY: number; deltaZ: number }
    export interface ClipboardEvent<T = Element> extends SyntheticEvent<T, globalThis.ClipboardEvent> { clipboardData: DataTransfer }

    export type EventHandler<E> = (event: E) => void
    export type ChangeEventHandler<T = Element> = EventHandler<ChangeEvent<T>>
    export type MouseEventHandler<T = Element> = EventHandler<MouseEvent<T>>
    export type KeyboardEventHandler<T = Element> = EventHandler<KeyboardEvent<T>>

    // Class components
    export interface ErrorInfo { componentStack?: string | null }
    export class Component<P = {}, S = {}, SS = any> {
        constructor(props: P)
        readonly props: Readonly<P> & Readonly<{ children?: ReactNode }>
        state: Readonly<S>
        context: any
        refs: { [key: string]: any }
        static contextType?: Context<any>
        static defaultProps?: any
        static displayName?: string
        setState<K extends keyof S>(
            state: ((prevState: Readonly<S>, props: Readonly<P>) => Pick<S, K> | S | null) | (Pick<S, K> | S | null),
            callback?: () => void
        ): void
        forceUpdate(callback?: () => void): void
        render(): ReactNode
        componentDidMount?(): void
        shouldComponentUpdate?(nextProps: Readonly<P>, nextState: Readonly<S>, nextContext: any): boolean
        componentWillUnmount?(): void
        componentDidCatch?(error: Error, errorInfo: ErrorInfo): void
        getSnapshotBeforeUpdate?(prevProps: Readonly<P>, prevState: Readonly<S>): SS | null
        componentDidUpdate?(prevProps: Readonly<P>, prevState: Readonly<S>, snapshot?: SS): void
    }
    export class PureComponent<P = {}, S = {}, SS = any> extends Component<P, S, SS> {}

    // JSX namespace. IntrinsicElements is open: any tag, any attribute.
    export namespace JSX {
        type ElementType = any
        interface Element extends ReactElement<any, any> {}
        interface ElementClass { render(): ReactNode }
        interface ElementAttributesProperty { props: {} }
        interface ElementChildrenAttribute { children: {} }
        interface IntrinsicAttributes { key?: Key | null }
        interface IntrinsicClassAttributes<T> { ref?: Ref<T> }
        interface IntrinsicElements { [elemName: string]: any }
    }
}

declare module 'react/jsx-runtime' {
    export { JSX } from 'react'
    export const jsx: any
    export const jsxs: any
    export const Fragment: any
}

declare module 'react/jsx-dev-runtime' {
    export { JSX } from 'react'
    export const jsxDEV: any
    export const Fragment: any
}

// EB compiles widgets with jsx "react-jsx" + jsxImportSource "@emotion/react",
// so every JSX tag takes its types from @emotion/react/jsx-runtime.
declare module '@emotion/react/jsx-runtime' {
    export * from 'react/jsx-runtime'
}

declare module '@emotion/react/jsx-dev-runtime' {
    export * from 'react/jsx-dev-runtime'
}

declare module 'react-dom' {
    export function render(element: any, container: Element | DocumentFragment | null): void
    export function unmountComponentAtNode(container: Element | DocumentFragment): boolean
    export function createPortal(children: any, container: Element | DocumentFragment, key?: string | null): any
    export function flushSync<R>(fn: () => R): R
    export function findDOMNode(instance: any): Element | Text | null
}

// ───────────────────────────── Experience Builder ──────────────────────────

declare module 'jimu-core' {
    import * as ReactNS from 'react'
    export { ReactNS as React }
    export * as ReactDOM from 'react-dom'

    // Emotion helpers re-exported by jimu-core
    export const jsx: any
    export const css: any
    export const keyframes: any
    export const Global: any
    export const ThemeProvider: any
    export const polished: any
    export const classNames: (...args: any[]) => string
    export const lodash: any
    export const moment: any
    export const esri: any

    // seamless-immutable
    export type ImmutableObject<T> = { readonly [K in keyof T]: T[K] } & {
        set<K extends keyof T>(key: K, value: T[K]): ImmutableObject<T>
        setIn(path: Array<string | number>, value: any): ImmutableObject<T>
        getIn(path: Array<string | number>, defaultValue?: any): any
        merge(other: Partial<T> | Array<Partial<T>>, options?: { deep?: boolean; merger?: any }): ImmutableObject<T>
        update<K extends keyof T>(key: K, updater: (value: T[K]) => T[K]): ImmutableObject<T>
        updateIn(path: Array<string | number>, updater: (value: any) => any): ImmutableObject<T>
        without(...keys: Array<keyof T | Array<keyof T>>): ImmutableObject<T>
        asMutable(options?: { deep?: boolean }): T
        replace(value: T, options?: { deep?: boolean }): ImmutableObject<T>
    }
    export type ImmutableArray<T> = ReadonlyArray<T> & {
        set(index: number, value: T): ImmutableArray<T>
        setIn(path: Array<string | number>, value: any): ImmutableArray<T>
        getIn(path: Array<string | number>, defaultValue?: any): any
        asMutable(options?: { deep?: boolean }): T[]
        flatMap(fn: (value: T, index: number) => any): ImmutableArray<any>
    }
    export type Immutable<T> = T extends Array<infer U> ? ImmutableArray<U> : ImmutableObject<T>
    export const Immutable: (<T>(value: T, options?: any) => Immutable<T>) & {
        isImmutable(value: any): boolean
        from<T>(value: T): Immutable<T>
        asMutable<T>(value: any, options?: { deep?: boolean }): T
    }

    // Widget props (subset of the real AllWidgetProps; extra members are open)
    export interface UseDataSource { dataSourceId: string; mainDataSourceId: string; dataViewId?: string; rootDataSourceId?: string; fields?: string[]; [key: string]: any }
    export type IMUseDataSource = ImmutableObject<UseDataSource>
    export interface AllWidgetProps<C = any> {
        id: string
        widgetId?: string
        label?: string
        manifest?: any
        config: C
        theme: any
        theme2?: any
        intl: any
        locale?: string
        portalUrl?: string
        portalSelf?: any
        user?: any
        token?: string
        useMapWidgetIds?: string[] | ImmutableArray<string>
        useDataSources?: ImmutableArray<IMUseDataSource>
        useDataSourcesEnabled?: boolean
        outputDataSources?: string[]
        enableDataAction?: boolean
        stateProps?: any
        dispatch?: (action: any) => any
        state?: any
        autoWidth?: boolean
        autoHeight?: boolean
        layoutId?: string
        layoutItemId?: string
        controllerWidgetId?: string
        mutableStateProps?: any
        mutableStatePropsVersion?: any
        queryObject?: any
        appMode?: any
        onInitResizeHandler?: any
        onInitDragHandler?: any
        [key: string]: any
    }
    export type AllWidgetSettingProps<C = any> = AllWidgetProps<C> & { onSettingChange: (settings: any, outputDataSources?: any) => void; [key: string]: any }
    export type IMThemeVariables = any
    export type ThemeVariables = any
    export type IMState = any
    export type IMAppConfig = any
    export type IMWidgetJson = any
    export type IMSizeModeLayoutJson = any

    // Data sources (any-typed)
    export type DataSource = any
    export type QueriableDataSource = any
    export type FeatureLayerDataSource = any
    export type DataRecord = any
    export type FeatureDataRecord = any
    export type DataSourceJson = any
    export type IMDataSourceJson = any
    export type DataSourceInfo = any
    export type IMDataSourceInfo = any
    export type QueryParams = any
    export const DataSourceManager: any
    export const DataSourceComponent: any
    export const DataSourceStatus: any
    export const DataSourceTypes: any
    export const DataRecordSetChangeType: any
    export const MessageManager: any
    export const MessageType: any
    export const WidgetState: any
    export const WidgetManager: any
    export const SessionManager: any
    export const ServiceManager: any
    export const appActions: any
    export const appConfigUtils: any
    export const dataSourceUtils: any
    export const dateUtils: any
    export const expressionUtils: any
    export const focusElementInKeyboardMode: any
    export const getAppStore: () => any
    export const hooks: any
    export const i18n: any
    export const loadArcGISJSAPIModule: (moduleId: string) => Promise<any>
    export const loadArcGISJSAPIModules: (moduleIds: string[]) => Promise<any[]>
    export const portalUrlUtils: any
    export const privilegeUtils: any
    export const proxyUtils: any
    export const requestUtils: any
    export const urlUtils: any
    export const utils: any
    export const uuidv1: () => string
    export const defaultMessages: any
    export const injectIntl: any
    export const FormattedMessage: any
    export const BaseVersionManager: any
    export const WidgetVersionManager: any
    export const AppMode: any
    export const BrowserSizeMode: any
    export const LayoutType: any
    export const ReactRedux: any
    export const ReactResizeDetector: any
    export const Redux: any
    export const ReduxSaga: any
    export const RepeatedDataSourceProvider: any
    export const getRequestUrls: any
    export const getUrlParams: any
    export const indexedDBUtils: any
    export const lodashUtils: any
    export const version: string
}

declare module 'jimu-arcgis' {
    import * as ReactNS from 'react'
    export interface JimuMapView {
        id: string
        mapWidgetId: string
        dataSourceId?: string
        view: __esri.MapView
        status?: any
        isActive?: boolean
        jimuLayerViews?: { [layerViewId: string]: any }
        jimuTables?: { [tableId: string]: any }
        whenJimuMapViewLoaded(): Promise<JimuMapView>
        whenAllJimuLayerViewLoaded(): Promise<{ [id: string]: any }>
        getMapDataSource(): any
        getJimuLayerViewById(id: string): any
        addLayerToMap?(layer: any, ...rest: any[]): any
        removeLayerFromMap?(layer: any, ...rest: any[]): any
        [key: string]: any
    }
    export type JimuLayerView = any
    export type JimuFeatureLayerView = any
    export type JimuMapViewGroup = any
    export interface JimuMapViewComponentProps {
        useMapWidgetId?: string
        useMapWidgetIds?: string[] | ReadonlyArray<string>
        onActiveViewChange?: (jimuMapView: JimuMapView) => void
        onViewsCreate?: (views: { [viewId: string]: JimuMapView }) => void
        onViewGroupCreate?: (viewGroup: JimuMapViewGroup) => void
        children?: any
    }
    export class JimuMapViewComponent extends ReactNS.Component<JimuMapViewComponentProps, any> {
        render(): any
    }
    export const MapViewManager: any
    export const loadArcGISJSAPIModule: (moduleId: string) => Promise<any>
    export const loadArcGISJSAPIModules: (moduleIds: string[]) => Promise<any[]>
    export const ArcGISDataSourceTypes: any
    export const geometryUtils: any
    export const zoomToUtils: any
    export type ArcGISDataSource = any
    export type FeatureLayerDataSource = any
    export type MapDataSource = any
    export type WebMapDataSource = any
}

// Other EB packages: shorthand modules, every import typed `any`.
// (setting.tsx is // @ts-nocheck and imports from these.)
declare module 'jimu-ui';
declare module 'jimu-ui/*';
declare module 'jimu-for-builder';
declare module 'jimu-for-builder/*';
declare module 'jimu-theme';
declare module 'jimu-layouts/*';
declare module 'jimu-for-test';
declare module 'jimu-icons/*';

// ArcGIS Maps SDK module imports (none in this widget today; covers future
// `import X from 'esri/...'` lines with a default `any` export).
declare module 'esri/*' {
    const mod: any
    export default mod
    export const __esModule: boolean
}

// ────────────────── ES2016+ fallbacks (VS fallback analysis mode) ──────────

interface Array<T> {
    includes(searchElement: T, fromIndex?: number): boolean
}

interface ReadonlyArray<T> {
    includes(searchElement: T, fromIndex?: number): boolean
}

interface ObjectConstructor {
    entries(value: any): Array<[string, any]>
    values<T>(value: { [key: string]: T } | ArrayLike<T>): T[]
    values(value: any): any[]
}

interface String {
    padStart(maxLength: number, fillString?: string): string
    padEnd(maxLength: number, fillString?: string): string
}
