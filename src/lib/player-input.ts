export type PlayerInput =
  | { kind: "volume"; value: number }
  | { kind: "next" | "previous" };

/** Dispatch the first gesture immediately. Keep skips ordered and collapse slider samples. */
export class PlayerInputs {
  private queue: PlayerInput[] = [];
  private busy = false;
  private nextVolumeAt = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private send: (input: PlayerInput) => Promise<void>;
  private failed: (error: unknown) => void;

  constructor(send: (input: PlayerInput) => Promise<void>, failed: (error: unknown) => void) {
    this.send = send;
    this.failed = failed;
  }

  push(input: PlayerInput): void {
    if (input.kind === "volume" && this.queue.at(-1)?.kind === "volume") this.queue.pop();
    this.queue.push(input);
    void this.drain();
  }

  reset(): void {
    ++this.generation;
    clearTimeout(this.timer);
    this.queue.length = 0;
    this.nextVolumeAt = 0;
  }

  private async drain(): Promise<void> {
    if (this.busy) return;
    clearTimeout(this.timer);
    const input = this.queue[0];
    if (!input) return;
    const delay = this.nextVolumeAt - performance.now();
    if (input.kind === "volume" && this.queue.length === 1 && delay > 0) {
      this.timer = setTimeout(() => void this.drain(), Math.ceil(delay));
      return;
    }
    this.queue.shift();
    this.busy = true;
    const generation = this.generation;
    if (input.kind === "volume") this.nextVolumeAt = performance.now() + 100;
    try {
      await this.send(input);
    } catch (error) {
      if (generation === this.generation) {
        this.reset();
        this.failed(error);
      }
    } finally {
      this.busy = false;
      void this.drain();
    }
  }
}
