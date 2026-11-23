import { describe, expect, it, vi } from "vitest";
import type { TodoStatus } from "@/domain/types";
import { MoveQueue, type MoveConfirmedEvent, type MoveFailedEvent } from "./move-queue";

interface Call {
  id: string;
  status: TodoStatus;
  resolve: (value: string) => void;
  reject: (error: unknown) => void;
}

function setup() {
  const calls: Call[] = [];
  const confirmed: MoveConfirmedEvent<string>[] = [];
  const failed: MoveFailedEvent[] = [];
  const onIdle = vi.fn();
  const queue = new MoveQueue<string>({
    send: (id, status) =>
      new Promise<string>((resolve, reject) => {
        calls.push({ id, status, resolve, reject });
      }),
    onConfirmed: (e) => confirmed.push(e),
    onFailed: (e) => failed.push(e),
    onIdle,
  });
  return { queue, calls, confirmed, failed, onIdle };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("MoveQueue", () => {
  it("same-column drop is a no-op: no request, no state change", () => {
    const { queue, calls } = setup();
    const before = queue.getSnapshot();
    expect(queue.move("a", "todo", "todo")).toBe(false);
    expect(calls).toHaveLength(0);
    expect(queue.getSnapshot()).toBe(before);
    expect(queue.getSnapshot().size).toBe(0);
  });

  it("moves optimistically, sends one request, then clears the overlay", async () => {
    const { queue, calls, confirmed, onIdle } = setup();
    expect(queue.move("a", "todo", "doing")).toBe(true);
    expect(queue.getSnapshot().get("a")).toBe("doing");
    expect(calls).toEqual([expect.objectContaining({ id: "a", status: "doing" })]);

    calls[0].resolve("ok");
    await tick();
    expect(confirmed).toEqual([{ id: "a", status: "doing", result: "ok", superseded: false }]);
    expect(queue.getSnapshot().size).toBe(0);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("restores the original column and reports failure when the request fails", async () => {
    const { queue, calls, failed, onIdle } = setup();
    queue.move("a", "todo", "done");
    calls[0].reject(new Error("boom"));
    await tick();
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ id: "a", attempted: "done", restoredTo: "todo" });
    expect(queue.getSnapshot().size).toBe(0);
    expect(calls).toHaveLength(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("serializes rapid drags per card and ends in the last chosen state", async () => {
    const { queue, calls, confirmed } = setup();
    queue.move("a", "todo", "doing");
    queue.move("a", "todo", "done"); // serverStatus is ignored while work is pending
    queue.move("a", "todo", "doing");
    queue.move("a", "todo", "done");
    // Only one request in flight; the rest are coalesced.
    expect(calls).toHaveLength(1);
    expect(queue.getSnapshot().get("a")).toBe("done");

    calls[0].resolve("r1");
    await tick();
    expect(confirmed[0]).toMatchObject({ status: "doing", superseded: true });
    expect(calls).toHaveLength(2);
    expect(calls[1].status).toBe("done");
    expect(queue.getSnapshot().get("a")).toBe("done");

    calls[1].resolve("r2");
    await tick();
    expect(confirmed[1]).toMatchObject({ status: "done", superseded: false });
    expect(queue.getSnapshot().size).toBe(0);
    expect(calls).toHaveLength(2);
  });

  it("does not roll back over a newer choice when an older request fails", async () => {
    const { queue, calls, failed } = setup();
    queue.move("a", "todo", "doing");
    queue.move("a", "todo", "done");
    calls[0].reject(new Error("boom"));
    await tick();

    expect(failed[0]).toMatchObject({ attempted: "doing", restoredTo: null });
    // The newer choice stays displayed and is sent next, relative to the confirmed status.
    expect(queue.getSnapshot().get("a")).toBe("done");
    expect(calls).toHaveLength(2);
    expect(calls[1].status).toBe("done");

    calls[1].resolve("ok");
    await tick();
    expect(queue.getSnapshot().size).toBe(0);
  });

  it("rolls back to the last confirmed status, not the original one", async () => {
    const { queue, calls, failed } = setup();
    queue.move("a", "todo", "doing");
    queue.move("a", "todo", "done");
    calls[0].resolve("ok"); // doing confirmed
    await tick();
    calls[1].reject(new Error("boom")); // done fails
    await tick();

    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ attempted: "done", restoredTo: "doing" });
    expect(queue.getSnapshot().size).toBe(0);
  });

  it("sends nothing more when the user moves back to the confirmed status during a failure", async () => {
    const { queue, calls, failed } = setup();
    queue.move("a", "todo", "doing");
    queue.move("a", "todo", "todo"); // back to the confirmed status while in flight
    expect(queue.getSnapshot().get("a")).toBe("todo");
    calls[0].reject(new Error("boom"));
    await tick();
    expect(failed[0]).toMatchObject({ restoredTo: null });
    expect(calls).toHaveLength(1);
    expect(queue.getSnapshot().size).toBe(0);
  });

  it("sends the confirmed status back if the user returns after a successful in-flight move", async () => {
    const { queue, calls } = setup();
    queue.move("a", "todo", "doing");
    queue.move("a", "todo", "todo");
    calls[0].resolve("ok"); // server now says doing, user wants todo
    await tick();
    expect(calls).toHaveLength(2);
    expect(calls[1].status).toBe("todo");
    calls[1].resolve("ok");
    await tick();
    expect(queue.getSnapshot().size).toBe(0);
  });

  it("runs different cards independently and fires idle once at the end", async () => {
    const { queue, calls, onIdle } = setup();
    queue.move("a", "todo", "doing");
    queue.move("b", "todo", "done");
    expect(calls.map((c) => c.id)).toEqual(["a", "b"]);
    expect(queue.getSnapshot().get("a")).toBe("doing");
    expect(queue.getSnapshot().get("b")).toBe("done");

    calls[1].reject(new Error("boom"));
    await tick();
    expect(queue.getSnapshot().get("b")).toBeUndefined();
    expect(queue.getSnapshot().get("a")).toBe("doing"); // unaffected by b's failure
    expect(onIdle).not.toHaveBeenCalled();

    calls[0].resolve("ok");
    await tick();
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("notifies subscribers with a new snapshot object on each change", () => {
    const { queue } = setup();
    const listener = vi.fn();
    const unsubscribe = queue.subscribe(listener);
    const s0 = queue.getSnapshot();
    queue.move("a", "todo", "doing");
    expect(listener).toHaveBeenCalled();
    expect(queue.getSnapshot()).not.toBe(s0);
    unsubscribe();
    listener.mockClear();
    queue.move("a", "todo", "done");
    expect(listener).not.toHaveBeenCalled();
  });

  it("forget() drops pending work and ignores the late result", async () => {
    const { queue, calls, confirmed, failed } = setup();
    queue.move("a", "todo", "doing");
    queue.forget("a");
    expect(queue.getSnapshot().size).toBe(0);
    calls[0].resolve("late");
    await tick();
    expect(confirmed).toHaveLength(0);
    expect(failed).toHaveLength(0);
  });

  it("keeps working when a handler throws", async () => {
    const calls: Call[] = [];
    const queue = new MoveQueue<string>({
      send: (id, status) =>
        new Promise<string>((resolve, reject) => calls.push({ id, status, resolve, reject })),
      onConfirmed: () => {
        throw new Error("handler bug");
      },
    });
    queue.move("a", "todo", "doing");
    calls[0].resolve("ok");
    await tick();
    expect(queue.getSnapshot().size).toBe(0);
    expect(queue.move("a", "doing", "done")).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("displayStatus reflects pending choice, else the server status", () => {
    const { queue } = setup();
    expect(queue.displayStatus("a", "todo")).toBe("todo");
    queue.move("a", "todo", "done");
    expect(queue.displayStatus("a", "todo")).toBe("done");
  });
});

describe('MoveQueue.settle', () => {
  it('resolves immediately when the card has no pending work', async () => {
    const { queue } = setup();
    await queue.settle('a');
  });

  it('discards unsent choices and waits for the in-flight request', async () => {
    const { queue, calls, confirmed } = setup();
    queue.move('a', 'todo', 'doing');
    queue.move('a', 'todo', 'done'); // unsent choice
    let settled = false;
    const p = queue.settle('a').then(() => {
      settled = true;
    });
    await tick();
    expect(settled).toBe(false); // still waiting for the in-flight request
    expect(queue.getSnapshot().get('a')).toBe('doing'); // overlay shows what is being sent

    calls[0].resolve('ok');
    await p;
    expect(settled).toBe(true);
    expect(calls).toHaveLength(1); // 'done' was never sent
    expect(confirmed).toEqual([{ id: 'a', status: 'doing', result: 'ok', superseded: false }]);
    expect(queue.getSnapshot().size).toBe(0);
  });

  it('settles after a failing in-flight request and restores the confirmed status', async () => {
    const { queue, calls, failed } = setup();
    queue.move('a', 'todo', 'doing');
    const p = queue.settle('a');
    calls[0].reject(new Error('boom'));
    await p;
    expect(failed[0]).toMatchObject({ attempted: 'doing', restoredTo: 'todo' });
    expect(queue.getSnapshot().size).toBe(0);
  });

  it('ignores moves made while settling', async () => {
    const { queue, calls } = setup();
    queue.move('a', 'todo', 'doing');
    const p = queue.settle('a');
    expect(queue.move('a', 'todo', 'done')).toBe(false);
    calls[0].resolve('ok');
    await p;
    expect(calls).toHaveLength(1);
  });

  it('failed DELETE then a new drag: no concurrent requests and the right final status', async () => {
    const { queue, calls, confirmed } = setup();
    queue.move('a', 'todo', 'doing');
    queue.move('a', 'todo', 'done');
    // Delete flow: settle first, then DELETE (simulated as failing), card is kept.
    const settling = queue.settle('a');
    calls[0].resolve('r1');
    await settling;
    expect(calls).toHaveLength(1);

    // The user drags again after the failed DELETE; the server status is now 'doing'.
    expect(queue.move('a', 'doing', 'done')).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1].status).toBe('done');
    expect(queue.move('a', 'doing', 'todo')).toBe(true);
    expect(calls).toHaveLength(2); // still one request in flight
    calls[1].resolve('r2');
    await tick();
    expect(calls).toHaveLength(3);
    expect(calls[2].status).toBe('todo');
    calls[2].resolve('r3');
    await tick();
    expect(confirmed.at(-1)).toMatchObject({ status: 'todo', superseded: false });
    expect(queue.getSnapshot().size).toBe(0);
  });
});
