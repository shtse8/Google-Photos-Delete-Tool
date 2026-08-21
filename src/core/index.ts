export { type Config, DEFAULT_CONFIG } from './config'
export {
  SELECTOR_DEFS,
  queryOne,
  queryAll,
  type SelectorDef,
  DELETE_KEYWORDS,
  CANCEL_KEYWORDS,
  CONTEXTUAL_REMOVE_KEYWORDS,
  EMPTY_TRASH_PHRASES,
  TRASH_EMPTY_SIGNALS,
  TOOLBAR_DELETE_CANDIDATES,
  EMPTY_TRASH_CANDIDATES,
  normalizeText,
  containsAnyKeyword,
  getButtonTextCandidates,
  scoreActionButton,
  findDeleteToolbarButton,
  findConfirmDialog,
  findConfirmButton,
  findEmptyTrashButton,
  isTrashEmpty,
} from './selectors'
export { PACK_VERSION, PACK, type SelectorPack, type SelectorDef as SelectorPackSelectorDef } from './selector-pack'
export {
  DeleteEngine,
  StopRequested,
  type Progress,
  type EngineOptions,
} from './delete-engine'
export { sleep, waitUntil, formatElapsed, formatEta, describeButton } from './utils'
export { DeletionLog, type DeletionEntry } from './deletion-log'
export type { EngineDom, ClickTarget, ScrollTarget, PhotoTile } from './dom-adapter'
export { browserDom } from './browser-dom'
export type { RunStatus } from './status'
export { ACTIVE_STATUSES, TERMINAL_STATUSES } from './status'
export {
  diagnostics,
  type DiagnosticBlob,
  type SelectorMatch,
  type EngineSnapshot,
} from './diagnostics'
export {
  PHOTO_TYPES,
  classifyLabel,
  shouldSelectTile,
  labelTypeToken,
  type PhotoType,
  type PhotoFilter,
} from './photo-filter'
export {
  verifyLicense,
  importProPublicKey,
  encodeBase64Url,
  decodeBase64Url,
  PRO_PUBLIC_KEY_BASE64URL,
  type ProLicensePayload,
  type LicenseResult,
} from './license'
export {
  PENDING_EMPTY_TTL_MS,
  TRASH_PATH,
  evaluatePendingEmptyTrash,
  createLocalStorageBaton,
  type EmptyTrashBaton,
  type PendingEval,
} from './empty-trash-baton'

export {
  SUPPORTED_HOST,
  SUPPORTED_ORIGIN,
  SUPPORTED_MATCH_PATTERN,
  isSupportedPhotosUrl,
  identifyPhotosView,
  admitSurface,
  activateLocalSurface,
  describePhotosView,
  type PhotosView,
  type PhotosViewKind,
  type SurfaceAdmission,
} from './surface'
