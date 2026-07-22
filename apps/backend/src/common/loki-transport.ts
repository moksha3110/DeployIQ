import Transport from 'winston-transport';

// Written after `winston-loki@6.1.5` turned out to be broken in this
// environment: its JSON batch builder appends a 3rd tuple element (`entry.rest`,
// an object) where Loki's push API strictly requires a 2-element
// `[timestamp, line]` tuple — reproducible on essentially any log carrying
// metadata, confirmed by reading its source (src/proto/helpers.js) and by
// the 400s Loki's server returned for every push. Its protobuf mode also
// silently dropped everything (confirmed via snappy loading fine, no
// errors, nothing landing in Loki). Loki's actual push API is simple
// enough — confirmed against the real server with a raw curl POST — that
// removing the dependency and talking to it directly was less work and
// more reliable than continuing to debug a third-party encoder.
interface LokiTransportOptions extends Transport.TransportStreamOptions {
  host: string;
  labels: Record<string, string>;
  flushIntervalMs?: number;
}

type LokiEntry = [string, string]; // [timestamp in nanoseconds, line]

export class SimpleLokiTransport extends Transport {
  private readonly host: string;
  private readonly labels: Record<string, string>;
  private buffer: LokiEntry[] = [];
  private readonly timer: NodeJS.Timeout;

  constructor(opts: LokiTransportOptions) {
    super(opts);
    this.host = opts.host;
    this.labels = opts.labels;
    this.timer = setInterval(() => void this.flush(), opts.flushIntervalMs ?? 3000);
    this.timer.unref(); // never keep the process alive on its own
  }

  override log(info: Record<string, unknown>, callback: () => void): void {
    setImmediate(() => this.emit('logged', info));
    const line = JSON.stringify(info);
    const timestampNanos = `${Date.now()}000000`;
    this.buffer.push([timestampNanos, line]);
    callback();
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];

    try {
      const res = await fetch(`${this.host}/loki/api/v1/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streams: [{ stream: this.labels, values: batch }] }),
      });
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error(`Loki push failed: ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      // Never call this.emit('error', ...) or log through the logger this
      // transport is attached to — that risks a feedback loop the moment
      // Loki is unreachable.
      // eslint-disable-next-line no-console
      console.error('Loki push failed', err);
    }
  }

  override close(): void {
    clearInterval(this.timer);
    void this.flush();
  }
}
