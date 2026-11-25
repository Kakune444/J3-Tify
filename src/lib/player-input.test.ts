import assert from "node:assert/strict";
import test from "node:test";
import { PlayerInputs, type PlayerInput } from "./player-input.ts";

const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test("the next slider sample can reach the local mixer after 16 ms", async t => {
  let now = 1000;
  t.mock.method(performance, "now", () => now);
  for (const local of [true, false]) {
    const values: number[] = [];
    const player = new PlayerInputs(async input => {
      if (input.kind === "volume") values.push(input.value);
    }, error => assert.fail(String(error)), () => local);
    player.push({ kind: "volume", value: 50 });
    await settle();
    now += 16;
    player.push({ kind: "volume", value: 30 });
    assert.deepEqual(values, local ? [50, 30] : [50]);
    now += 84;
    player.push({ kind: "volume", value: 20 });
    await settle();
    assert.equal(values.at(-1), 20);
    player.reset();
  }
});

test("volume starts on input and skips survive a slow acknowledgement", async () => {
  const writes: PlayerInput[] = [];
  let finish!: () => void;
  const player = new PlayerInputs(async input => {
    writes.push(input);
    if (writes.length === 1) await new Promise<void>(resolve => { finish = resolve; });
  }, error => assert.fail(String(error)));
  player.push({ kind: "volume", value: 50 });
  assert.equal(writes.length, 1);
  player.push({ kind: "volume", value: 40 });
  player.push({ kind: "volume", value: 30 });
  player.push({ kind: "next" });
  player.push({ kind: "next" });
  player.push({ kind: "previous" });
  finish();
  await settle();
  assert.deepEqual(writes, [
    { kind: "volume", value: 50 }, { kind: "volume", value: 30 },
    { kind: "next" }, { kind: "next" }, { kind: "previous" },
  ]);
});

test("switching devices discards waiting gestures and stale errors", async () => {
  let reject!: () => void;
  const writes: PlayerInput[] = [];
  const player = new PlayerInputs(async input => {
    writes.push(input);
    if (writes.length === 1) await new Promise<void>((_, fail) => { reject = () => fail(Error()); });
  }, error => assert.fail(String(error)));
  player.push({ kind: "next" });
  player.push({ kind: "previous" });
  player.reset();
  player.push({ kind: "volume", value: 15 });
  reject();
  await settle();
  assert.deepEqual(writes, [{ kind: "next" }, { kind: "volume", value: 15 }]);
});
