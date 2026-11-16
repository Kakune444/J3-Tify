export type LyricsLine = { text: string; startMs: number | null };
export type Lyrics = {
  lines: LyricsLine[];
  synchronized: boolean;
  provider: string;
  background: number | null;
  rightToLeft: boolean;
};

export function lyricsTrack(uri?: string): string | null {
  return uri && /^spotify:track:[A-Za-z0-9]{22}$/.test(uri) ? uri : null;
}

export function activeLyric(lines: LyricsLine[], positionMs: number): number {
  let first = 0, end = lines.length;
  while (first < end) {
    const mid = (first + end) >>> 1;
    if ((lines[mid].startMs ?? Infinity) <= positionMs) first = mid + 1;
    else end = mid;
  }
  return first - 1;
}

export type LyricsState =
  | { kind: "closed" | "no-track" | "loading" | "missing" }
  | { kind: "ready"; lyrics: Lyrics }
  | { kind: "error"; message: string };

/** One request in flight; a newer selection replaces any waiting selection. */
export class LyricsLoader {
  private version = 0;
  private uri: string | null = null;
  private visible = false;
  private running = false;
  private state: LyricsState = { kind: "closed" };
  private cache = new Map<string, Lyrics | null>();
  private fetch: (uri: string) => Promise<Lyrics | null>;
  private changed: (state: LyricsState) => void;

  constructor(fetch: (uri: string) => Promise<Lyrics | null>, changed: (state: LyricsState) => void) {
    this.fetch = fetch;
    this.changed = changed;
  }

  open(uri: string | null): void { this.visible = true; this.select(uri); }
  select(uri: string | null): void {
    if (!this.visible || (this.uri === uri && this.state.kind !== "closed")) return;
    this.uri = uri;
    this.refresh();
  }
  retry(): void { if (this.visible && this.state.kind === "error") this.refresh(); }
  close(): void {
    this.visible = false;
    this.uri = null;
    ++this.version;
    this.set({ kind: "closed" });
  }
  reset(): void { this.cache.clear(); this.close(); }

  private set(state: LyricsState): void { this.state = state; this.changed(state); }
  private result(lyrics: Lyrics | null): void {
    this.set(lyrics ? { kind: "ready", lyrics } : { kind: "missing" });
  }
  private refresh(): void {
    ++this.version;
    if (!this.uri) { this.set({ kind: "no-track" }); return; }
    if (this.cache.has(this.uri)) { this.result(this.cache.get(this.uri)!); return; }
    this.set({ kind: "loading" });
    void this.run();
  }
  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.visible && this.uri && this.state.kind === "loading") {
        const uri = this.uri, version = this.version;
        try {
          const lyrics = await this.fetch(uri);
          if (version !== this.version) continue;
          if (this.cache.size >= 6) this.cache.delete(this.cache.keys().next().value!);
          this.cache.set(uri, lyrics);
          this.result(lyrics);
        } catch (error) {
          if (version !== this.version) continue;
          const message = (error as { message?: string } | null)?.message;
          this.set({ kind: "error", message: message || "Impossible de charger les paroles." });
        }
      }
    } finally { this.running = false; }
  }
}
