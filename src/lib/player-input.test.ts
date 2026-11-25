import assert from "node:assert/strict";
import test from "node:test";
import { PlayerInputs, type PlayerInput } from "./player-input.ts";

const settle = () => new Promise<void>(resolve => setImmediate(resolve));

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
