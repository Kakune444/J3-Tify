import assert from "node:assert/strict";
import test from "node:test";
import { activeLyric, lyricsTrack, LyricsLoader, type Lyrics, type LyricsState } from "./lyrics.ts";

const sample: Lyrics = {
  synchronized: true, provider: "Example", background: null, rightToLeft: false,
  lines: [1000, 4000, 10000].map((startMs) => ({ text: "Sample", startMs })),
};
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("line boundaries follow progress and backwards seeks", () => {
  assert.deepEqual([0, 1000, 4000, 20000, 3999].map(ms => activeLyric(sample.lines, ms)), [-1, 0, 1, 2, 0]);
  assert.equal(activeLyric([{ text: "Plain", startMs: null }], 12345), -1);
  assert.equal(lyricsTrack("spotify:episode:0000000000000000000000"), null);
  assert.equal(lyricsTrack("spotify:track:0000000000000000000000"), "spotify:track:0000000000000000000000");
});

test("an older response is ignored and only the latest queued track is fetched", async () => {
  let finish!: (value: Lyrics) => void;
  const requested: string[] = [];
  const states: LyricsState[] = [];
  const loader = new LyricsLoader((uri) => {
    requested.push(uri);
    return uri === "playing" ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(null);
  }, state => states.push(state));
  loader.select("hidden");
  assert.deepEqual(requested, []);
  loader.open("playing");
  loader.select("skip-me");
  loader.select("latest");
  finish(sample);
  await settle();
  assert.deepEqual(requested, ["playing", "latest"]);
  assert.equal(states.at(-1)?.kind, "missing");
  assert.ok(!states.some(state => state.kind === "ready"));
});

test("reopening uses the memory cache and changing accounts clears it", async () => {
  let reads = 0;
  const states: LyricsState[] = [];
  const loader = new LyricsLoader(async () => { ++reads; return sample; }, state => states.push(state));
  loader.open("track");
  await settle();
  loader.close();
  loader.open("track");
  assert.equal(states.at(-1)?.kind, "ready");
  assert.equal(reads, 1);
  loader.reset();
  loader.open("track");
  await settle();
  assert.equal(reads, 2);
});
