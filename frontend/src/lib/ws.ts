export type WSStatus = 'disconnected' | 'connecting' | 'connected';

export interface WSMessage {
  type: string;
  data: unknown;
  timestamp: number;
}

type MessageHandler = (msg: WSMessage) => void;
type StatusHandler = (status: WSStatus) => void;
type ErrorHandler = (error: Event) => void;

const HEARTBEAT_INTERVAL = 30_000;
const MAX_RECONNECT_DELAY = 30_000;
const BASE_RECONNECT_DELAY = 1_000;

export class WSClient {
  private ws: WebSocket | null = null;
  private url: string;
  private status: WSStatus = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  private onMessageCb: MessageHandler | null = null;
  private onStatusCb: StatusHandler | null = null;
  private onErrorCb: ErrorHandler | null = null;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    if (this.destroyed) return;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;

    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      if (this.destroyed) return;
      this.setStatus('connected');
      this.reconnectAttempts = 0;
      this.startHeartbeat();
    };

    this.ws.onclose = () => {
      if (this.destroyed) return;
      this.setStatus('disconnected');
      this.stopHeartbeat();
      this.scheduleReconnect();
    };

    this.ws.onerror = (ev: Event) => {
      this.onErrorCb?.(ev);
    };

    this.ws.onmessage = (ev: MessageEvent) => {
      if (this.destroyed) return;
      try {
        const msg = JSON.parse(ev.data) as WSMessage;
        this.onMessageCb?.(msg);
      } catch {
        // Ignore malformed messages
      }
    };
  }

  disconnect(): void {
    this.destroyed = true;
    this.stopHeartbeat();
    this.clearReconnect();
    this.ws?.close();
    this.ws = null;
    this.setStatus('disconnected');
  }

  send(type: string, data: unknown): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const msg: WSMessage = { type, data, timestamp: Date.now() };
    this.ws.send(JSON.stringify(msg));
  }

  sendRaw(payload: Record<string, unknown>): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  onMessage(cb: MessageHandler): this {
    this.onMessageCb = cb;
    return this;
  }

  onStatus(cb: StatusHandler): this {
    this.onStatusCb = cb;
    return this;
  }

  onError(cb: ErrorHandler): this {
    this.onErrorCb = cb;
    return this;
  }

  getStatus(): WSStatus {
    return this.status;
  }

  private setStatus(s: WSStatus): void {
    this.status = s;
    this.onStatusCb?.(s);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send('heartbeat', {});
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    this.clearReconnect();
    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY,
    );
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      if (this.destroyed) return;
      this.connect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export function createWSClient(url: string): WSClient {
  return new WSClient(url);
}
