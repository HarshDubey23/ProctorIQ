import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProctoringSocket } from './useProctoringSocket';

const mocks: {
  sendRawMock: ReturnType<typeof vi.fn>;
  getStatusMock: ReturnType<typeof vi.fn>;
  connectMock: ReturnType<typeof vi.fn>;
  disconnectMock: ReturnType<typeof vi.fn>;
  onStatusMock: ReturnType<typeof vi.fn>;
  onMessageMock: ReturnType<typeof vi.fn>;
  WSClient: new () => {
    sendRaw: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onStatus: ReturnType<typeof vi.fn>;
    onMessage: ReturnType<typeof vi.fn>;
  };
} = vi.hoisted(() => ({
  sendRawMock: vi.fn(),
  getStatusMock: vi.fn(() => 'connected'),
  connectMock: vi.fn(),
  disconnectMock: vi.fn(),
  onStatusMock: vi.fn(),
  onMessageMock: vi.fn(),
  WSClient: class {
    sendRaw: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onStatus: ReturnType<typeof vi.fn>;
    onMessage: ReturnType<typeof vi.fn>;
    constructor() {
      this.sendRaw = mocks.sendRawMock;
      this.getStatus = mocks.getStatusMock;
      this.connect = mocks.connectMock;
      this.disconnect = mocks.disconnectMock;
      this.onStatus = mocks.onStatusMock;
      this.onMessage = mocks.onMessageMock;
    }
  },
}));

vi.mock('./ws', () => ({ WSClient: mocks.WSClient }));

const originalRandomUUID = crypto.randomUUID;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getStatusMock.mockReturnValue('connected');
  crypto.randomUUID = vi.fn(() => 'test-session-id' as `${string}-${string}-${string}-${string}-${string}`);
});

afterAll(() => {
  crypto.randomUUID = originalRandomUUID;
});

describe('useProctoringSocket', () => {
  it('sendFlag produces a correctly shaped WsFlagEvent payload', () => {
    const { result } = renderHook(() => useProctoringSocket());

    act(() => { result.current.connect('sess-1'); });
    act(() => { result.current.sendFlag('distracted', 0.85, { yaw: 31.2 }); });

    expect(mocks.sendRawMock).toHaveBeenCalledTimes(1);
    const sent = mocks.sendRawMock.mock.calls[0][0];
    expect(sent).toMatchObject({
      type: 'flag',
      event_type: 'distracted',
      confidence: 0.85,
      details: { yaw: 31.2 },
    });
    expect(sent).toHaveProperty('timestamp_s');
    expect(typeof sent.timestamp_s).toBe('number');
  });

  it('sendFlag does nothing when WebSocket is not connected', () => {
    mocks.getStatusMock.mockReturnValue('disconnected');
    const { result } = renderHook(() => useProctoringSocket());

    act(() => { result.current.connect('sess-2'); });
    act(() => { result.current.sendFlag('drowsy', 0.75, null); });

    expect(mocks.sendRawMock).not.toHaveBeenCalled();
  });

  it('sendFlag does nothing when wsRef is null (disconnected before send)', () => {
    const { result } = renderHook(() => useProctoringSocket());

    act(() => { result.current.sendFlag('absent', 0.9, null); });
    expect(mocks.sendRawMock).not.toHaveBeenCalled();
  });

  it('connect opens a WebSocket and sends initial state', () => {
    const { result } = renderHook(() => useProctoringSocket());

    act(() => { result.current.connect('sess-3'); });

    expect(mocks.connectMock).toHaveBeenCalledTimes(1);
    expect(mocks.onStatusMock).toHaveBeenCalledTimes(1);

    const statusCallback = mocks.onStatusMock.mock.calls[0][0];
    act(() => { statusCallback('connected'); });
    expect(mocks.sendRawMock).toHaveBeenCalledWith({
      type: 'state',
      attention_state: 'focused',
      ear: 0,
      head_pose: { yaw: 0, pitch: 0, roll: 0 },
      face_count: 0,
    });
  });

  it('disconnect clears wsRef and calls disconnect on WSClient', () => {
    const { result } = renderHook(() => useProctoringSocket());
    const onStatus = vi.fn();

    act(() => { result.current.connect('sess-4', { onStatus }); });
    expect(mocks.connectMock).toHaveBeenCalledTimes(1);

    const statusCallback = mocks.onStatusMock.mock.calls[0][0];
    act(() => { statusCallback('connected'); });
    expect(onStatus).toHaveBeenCalledWith('connected');

    act(() => { statusCallback('disconnected'); });
    expect(onStatus).toHaveBeenCalledWith('disconnected');

    act(() => { result.current.disconnect(); });
    expect(mocks.disconnectMock).toHaveBeenCalledTimes(1);
  });
});
