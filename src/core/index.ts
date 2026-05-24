export { type Config, DEFAULT_CONFIG } from './config';
export {
  SELECTORS,
  SELECTOR_DEFS,
  queryOne,
  queryAll,
  type SelectorDef,
  DELETE_KEYWORDS,
  CANCEL_KEYWORDS,
  normalizeText,
  containsAnyKeyword,
  getButtonTextCandidates,
  scoreActionButton,
  findDeleteToolbarButton,
  findConfirmDialog,
  findConfirmButton,
  findEmptyTrashButton,
  EMPTY_TRASH_PHRASES,
} from './selectors';
export { DeleteEngine, type Progress, type ProgressCallback, type EngineStatus, type EngineEvents } from './delete-engine';
export { sleep, waitUntil, $, $$, formatElapsed, formatEta, retryWithBackoff } from './utils';
export { EventEmitter } from './event-emitter';
export { DeletionLog, type DeletionEntry } from './deletion-log';
