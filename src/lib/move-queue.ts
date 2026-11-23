import type { TodoStatus } from "@/domain/types";

/**
 * Per-card serialized move queue (pure: no React, no fetch).
 *
 * Invariants:
 * - At most one request per card is in flight; requests for different cards run in parallel.
 * - `desired` is the user's latest choice. Only the latest choice is sent after the in-flight
 *   request settles (intermediate choices are coalesced), so the last drop always wins.
 * - A failed request restores the last server-confirmed status only if the user has not chosen
 *   something newer meanwhile; otherwise the newer choice stays and is sent next.
 * - A same-status drop is a no-op: no request, no state change.
 * - The snapshot (id to desired status) is an overlay for display. The query cache is never
 *   written optimistically, so a failure can never corrupt it.
 */

export type PendingMoves = ReadonlyMap<string, TodoStatus>;

export interface MoveConfirmedEvent<R> {
  id: string;
  status: TodoStatus;
  result: R;
  /** The user has already chosen a newer status that is still to be sent. */
  superseded: boolean;
}

export interface MoveFailedEvent {
  id: string;
  attempted: TodoStatus;
  error: unknown;
  /** Status the card was restored to, or null when a newer user choice is kept. */
  restoredTo: TodoStatus | null;
}

export interface MoveQueueHandlers<R> {
  send(id: string, status: TodoStatus): Promise<R>;
  onConfirmed?(event: MoveConfirmedEvent<R>): void;
  onFailed?(event: MoveFailedEvent): void;
  /** Fires when a card's queue drains and no other card has pending work. */
  onIdle?(): void;
}

interface Entry {
  confirmed: TodoStatus;
  desired: TodoStatus;
  running: boolean;
  /** Status of the request currently in flight, if any. */
  inFlight: TodoStatus | null;
  /** settle() was called: send nothing further and ignore new choices. */
  halted: boolean;
  done: Promise<void>;
}

export class MoveQueue<R> {
  private entries = new Map<string, Entry>();
  private snapshot: PendingMoves = new Map();
  private listeners = new Set<() => void>();

  constructor(private readonly handlers: MoveQueueHandlers<R>) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): PendingMoves => this.snapshot;

  /** Status to display: the pending choice if any, otherwise the server status. */
  displayStatus(id: string, serverStatus: TodoStatus): TodoStatus {
    return this.entries.get(id)?.desired ?? serverStatus;
  }

  /**
   * Record the user's choice for a card. `serverStatus` is the status currently known from the
   * server (used only when the card has no pending work). Returns false for a no-op drop.
   */
  move(id: string, serverStatus: TodoStatus, to: TodoStatus): boolean {
    const existing = this.entries.get(id);
    const current = existing ? existing.desired : serverStatus;
    if (current === to) return false;

    if (existing) {
      if (existing.halted) return false;
      existing.desired = to;
      this.publish();
      return true;
    }
    const entry: Entry = {
      confirmed: serverStatus,
      desired: to,
      running: false,
      inFlight: null,
      halted: false,
      done: Promise.resolve(),
    };
    this.entries.set(id, entry);
    this.publish();
    entry.done = this.pump(id);
    return true;
  }

  /**
   * Discard unsent choices for a card and wait for its in-flight request (if any) to settle.
   * Call before an operation that must not race with a status PATCH (e.g. DELETE). Choices made
   * while settling are ignored; afterwards the card has no pending work.
   */
  async settle(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.halted = true;
    if (entry.inFlight && entry.desired !== entry.inFlight) {
      entry.desired = entry.inFlight;
      this.publish();
    }
    await entry.done;
  }

  /** Drop all pending work for a card (e.g. it was deleted). An in-flight request still settles. */
  forget(id: string): void {
    if (!this.entries.delete(id)) return;
    this.publish();
    if (this.entries.size === 0) this.safe(() => this.handlers.onIdle?.());
  }

  private publish(): void {
    this.snapshot = new Map([...this.entries].map(([id, e]) => [id, e.desired]));
    for (const l of [...this.listeners]) l();
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch {
      // A throwing handler must never wedge the queue.
    }
  }

  private async pump(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry || entry.running) return;
    entry.running = true;
    try {
      while (
        this.entries.get(id) === entry &&
        !entry.halted &&
        entry.desired !== entry.confirmed
      ) {
        const target = entry.desired;
        let result: R;
        entry.inFlight = target;
        try {
          result = await this.handlers.send(id, target);
        } catch (error) {
          entry.inFlight = null;
          if (this.entries.get(id) !== entry) return;
          if (entry.desired === target) {
            entry.desired = entry.confirmed;
            this.publish();
            this.safe(() =>
              this.handlers.onFailed?.({ id, attempted: target, error, restoredTo: entry.confirmed }),
            );
          } else {
            this.safe(() =>
              this.handlers.onFailed?.({ id, attempted: target, error, restoredTo: null }),
            );
          }
          continue;
        }
        entry.inFlight = null;
        if (this.entries.get(id) !== entry) return;
        entry.confirmed = target;
        this.safe(() =>
          this.handlers.onConfirmed?.({
            id,
            status: target,
            result,
            superseded: entry.desired !== target,
          }),
        );
      }
    } finally {
      entry.running = false;
      if (this.entries.get(id) === entry) {
        this.entries.delete(id);
        this.publish();
        if (this.entries.size === 0) this.safe(() => this.handlers.onIdle?.());
      }
    }
  }
}
