export type SyncOperation = { id: string; type: 'set' | 'delete' | 'create' | 'increment' | 'append' | 'member-add' | 'member-remove' | 'order' | 'restore'; path: string[]; value?: unknown }
export function copy<T>(value: T): T
export function equal(a: unknown, b: unknown): boolean
export function pathKey(path: string[]): string
export function valueAt(state: unknown, path: string[]): unknown
export function validateOperation(op: SyncOperation): void
export function applyOperation<T>(state: T, op: SyncOperation, tombstones?: Set<string>): T
export function applyOperations<T>(state: T, operations: SyncOperation[], tombstones?: Set<string>): T
export function diffOperations(previous: object, next: object, makeId?: () => string): SyncOperation[]
