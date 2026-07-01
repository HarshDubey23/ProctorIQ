import { useRef, useState, useEffect } from 'react';
import { createDemoMediaStream } from '../../lib/demo';

export interface UseWebcamResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  stream: MediaStream | null;
  isDemo: boolean;
  error: string | null;
}

export function useWebcam(): UseWebcamResult {
  const videoRef = useRef<HTMLVideoElement>(null!);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use refs to track latest streams for cleanup
  const streamRef = useRef<MediaStream | null>(null);
  const demoStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let active = true;

    async function start() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        });

        if (!active) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = mediaStream;
        setStream(mediaStream);
        setError(null);
        setIsDemo(false);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch {
        if (!active) return;

        const demoStream = createDemoMediaStream();
        demoStreamRef.current = demoStream;
        setStream(demoStream);
        setIsDemo(true);
        setError(null);

        if (videoRef.current) {
          videoRef.current.srcObject = demoStream;
        }
      }
    }

    void start();

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (demoStreamRef.current) {
        demoStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
    videoRef.current.play().catch(() => {});
  }, [stream]);

  return { videoRef, stream, isDemo, error };
}