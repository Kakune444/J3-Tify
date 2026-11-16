import { invoke } from "@tauri-apps/api/core";
import { escapeHtml as esc } from "../lib/catalog.ts";
import {
  activeLyric,
  LyricsLoader,
  lyricsTrack,
  type LyricsState,
} from "../lib/lyrics.ts";

/** Spotify-like lyrics panel. Lyrics stay in memory and are discarded on close. */
export class LyricsView {
  private opened = false;
  private position = 0;
  private active = -2;
  private state: LyricsState = { kind: "closed" };
  private loader = new LyricsLoader(
    (uri) => invoke("get_lyrics", { uri }),
    (state) => {
      this.state = state;
      this.active = -2;
      this.render();
    },
  );

  constructor(
    private root: HTMLElement,
    private nowPlaying: HTMLElement,
    private updated: () => void,
  ) {
    root.addEventListener("click", (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-lyrics]",
      )?.dataset.lyrics;
      if (action === "close") this.close();
      if (action === "retry") this.loader.retry();
    });
  }

  get isOpen(): boolean {
    return this.opened;
  }

  open(uri: string | undefined, position: number): void {
    this.opened = true;
    this.position = position;
    this.nowPlaying.hidden = true;
    this.root.hidden = false;
    this.loader.open(lyricsTrack(uri));
    this.updated();
    this.root.querySelector<HTMLButtonElement>("[data-lyrics=close]")?.focus();
  }

  close(): void {
    this.opened = false;
    this.nowPlaying.hidden = false;
    this.root.hidden = true;
    this.loader.close();
    this.updated();
  }

  reset(): void {
    this.close();
    this.loader.reset();
  }

  trackChanged(uri: string | undefined, position: number): void {
    this.position = position;
    if (this.opened) this.loader.select(lyricsTrack(uri));
  }

  updatePosition(position: number): void {
    this.position = position;
    if (!this.opened || this.state.kind !== "ready" || !this.state.lyrics.synchronized)
      return;
    const next = activeLyric(this.state.lyrics.lines, position);
    if (next === this.active) return;
    this.active = next;
    this.root.querySelectorAll<HTMLElement>("[data-lyric-line]").forEach((line) => {
      line.classList.toggle("active", Number(line.dataset.lyricLine) === next);
    });
    this.root
      .querySelector<HTMLElement>(`[data-lyric-line="${next}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  private render(): void {
    if (!this.opened) return;
    let body: string;
    if (this.state.kind === "loading")
      body = '<p class="lyrics-status" role="status">Chargement des paroles…</p>';
    else if (this.state.kind === "no-track")
      body = '<p class="lyrics-status">Lancez un titre pour afficher ses paroles.</p>';
    else if (this.state.kind === "missing")
      body = '<p class="lyrics-status">Paroles indisponibles pour ce titre.</p>';
    else if (this.state.kind === "error")
      body = `<p class="lyrics-status" role="alert">${esc(this.state.message)}</p><button class="pill" data-lyrics="retry">Réessayer</button>`;
    else if (this.state.kind === "ready") {
      const lyrics = this.state.lyrics;
      body = `<div class="lyrics-lines" dir="${lyrics.rightToLeft ? "rtl" : "ltr"}">${lyrics.lines
        .map(
          (line, index) =>
            `<p data-lyric-line="${index}"${line.text ? "" : ' class="instrumental"'}>${line.text ? esc(line.text) : "♪"}</p>`,
        )
        .join("")}</div>${lyrics.provider ? `<p class="lyrics-provider">Paroles fournies par ${esc(lyrics.provider)}</p>` : ""}`;
    } else body = "";
    this.root.innerHTML = `<div class="lyrics-panel-heading"><h2>Paroles</h2><button class="icon-button" data-lyrics="close" aria-label="Fermer les paroles">×</button></div>${body}`;
    this.updatePosition(this.position);
  }
}
