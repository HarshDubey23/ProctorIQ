import { useCallback, useState } from "react";
import { Copy, Check, ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui/button";
import { LiveTrainingDashboard } from "./LiveTrainingDashboard";

export function ModelStudioPage() {
  const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
  const collectUrl = `${baseUrl.replace(/\/+$/, "")}/collect`;
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(collectUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [collectUrl]);

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex h-screen max-w-[1400px] flex-col">
        {/* Top Bar */}
        <div className="flex items-center justify-between border-b-[3px] border-ink px-6 py-3">
          <div className="flex items-center gap-4">
            <a href="/" className="text-graphite hover:text-ink">
              <ArrowLeft size={18} className="inline" />
            </a>
            <h1 className="font-display text-xl uppercase">AI Studio</h1>
          </div>
        </div>

        {/* Share Collect Link Banner */}
        <div className="border-b-[3px] border-ink bg-paper-2 px-6 py-3 flex items-center gap-3 flex-wrap">
          <span className="font-label text-label text-graphite shrink-0">
            Share this link so students can submit questions:
          </span>
          <code className="font-mono text-xs border-[2px] border-ink bg-paper px-2 py-1 break-all select-all">
            {collectUrl}
          </code>
          <Button variant="primary" onClick={handleCopy} className="shrink-0 text-xs">
            {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy Link</>}
          </Button>
        </div>

        {/* Main Content: Training Dashboard */}
        <div className="flex-1 overflow-auto">
          <LiveTrainingDashboard />
        </div>
      </div>
    </main>
  );
}
