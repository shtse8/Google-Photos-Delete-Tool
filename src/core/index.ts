export { type Config, DEFAULT_CONFIG } from './config';
export { SELECTORS, SELECTOR_DEFS, queryOne, queryAll, type SelectorDef } from './selectors';
export { DeleteEngine, type Progress, type ProgressCallback, type EngineStatus, type EngineEvents } from './delete-engine';
export { sleep, waitUntil, $, $$, formatElapsed, formatEta, retryWithBackoff } from './utils';
export { EventEmitter } from './event-emitter';
export { DeletionLog, type DeletionEntry } from './deletion-log';
