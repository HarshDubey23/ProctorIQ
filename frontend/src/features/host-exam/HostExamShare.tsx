import { useState, useCallback, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

interface HostExamShareProps {
  roomId: string;
  joinUrl: string;
  onGoToDashboard: () => void;
}

export function HostExamShare({ roomId, joinUrl, onGoToDashboard }: HostExamShareProps) {
  const [copied, setCopied] = useState(false);
  const fullUrl = useMemo(() => `${window.location.origin}${joinUrl}`, [joinUrl]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  }, [fullUrl]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-paper p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Exam Created</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-3 border-[3px] border-ink bg-paper-2 p-5">
            <QRCodeSVG
              value={fullUrl}
              size={160}
              level="M"
              fgColor="#1A1A17"
              bgColor="transparent"
            />
            <span className="font-label text-label text-graphite">Scan to join</span>
          </div>

          <div className="flex w-full flex-col gap-2">
            <span className="font-label text-label text-graphite">Share this link</span>
            <div className="flex items-center gap-2 border-[3px] border-ink bg-paper-2 px-3 py-2.5 font-mono text-xs text-ink select-all">
              <span className="flex-1 truncate">{fullUrl}</span>
              <button
                className="shrink-0 p-1.5 text-graphite hover:text-ink"
                onClick={handleCopy}
                aria-label={copied ? "Copied" : "Copy link"}
              >
                {copied ? <Check size={14} className="text-ledger" /> : <Copy size={14} />}
              </button>
            </div>
            {copied && (
              <span className="font-body text-xs text-ledger">Link copied to clipboard!</span>
            )}
          </div>

          <p className="text-center font-body text-sm text-graphite">
            Anyone with this link can join the exam — no account or signup required.
            Participants will see a self-test calibration before entering.
          </p>

          <Button variant="primary" onClick={onGoToDashboard} className="w-full">
            Go to Mission Control
            <ArrowRight size={16} />
          </Button>

          <div className="flex items-center gap-2 border-[3px] border-ink bg-paper-2 px-3 py-2">
            <ExternalLink size={12} className="text-graphite" />
            <span className="font-body text-xs text-graphite">
              Room ID: <span className="font-mono text-ink">{roomId}</span>
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
