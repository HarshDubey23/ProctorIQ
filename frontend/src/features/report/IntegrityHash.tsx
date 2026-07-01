import { useState, useCallback } from 'react';
import { Copy, Check, Shield, ShieldOff } from 'lucide-react';
import { verifySessionHash } from '../../lib/signing';

interface IntegrityHashProps {
  sessionId: string;
  hash: string;
}

export function IntegrityHash({ sessionId, hash }: IntegrityHashProps) {
  const [copied, setCopied] = useState(false);
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyResult, setVerifyResult] = useState<'idle' | 'valid' | 'mismatch'>('idle');
  const [verifying, setVerifying] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available */
    }
  }, [hash]);

  const handleVerify = useCallback(async () => {
    if (!verifyInput.trim()) return;
    setVerifying(true);
    const valid = await verifySessionHash(sessionId, verifyInput.trim());
    setVerifyResult(valid ? 'valid' : 'mismatch');
    setVerifying(false);
  }, [verifyInput, sessionId]);

  return (
    <div className="rounded-xl bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Shield size={14} className="text-text-muted" />
        <span className="font-sans text-[11px] uppercase tracking-[0.1em] text-text-secondary">
          Integrity Hash (SHA-256)
        </span>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-md bg-white/[0.05] px-3 py-2 font-mono text-[11px] text-text-mono select-all">
          {hash}
        </code>
        <button
          className="shrink-0 rounded-lg p-2 text-text-secondary transition-colors hover:bg-white/[0.08] hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--signal-focus]"
          onClick={handleCopy}
          aria-label={copied ? 'Copied to clipboard' : 'Copy hash to clipboard'}
        >
          {copied ? <Check size={14} className="text-signal-drowsy" /> : <Copy size={14} />}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          className="flex-1 rounded-md border border-white/[0.08] bg-white/[0.05] px-3 py-2 font-mono text-[11px] text-text-primary outline-none placeholder:text-text-muted transition-colors focus:border-[--signal-focus]"
          placeholder="Paste hash to verify..."
          value={verifyInput}
          onChange={(e) => {
            setVerifyInput(e.target.value);
            setVerifyResult('idle');
          }}
          aria-label="Hash to verify"
        />
        <button
          className="shrink-0 rounded-lg bg-white/[0.08] px-3 py-2 font-sans text-[11px] text-text-primary transition-colors hover:bg-white/[0.15] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--signal-focus]"
          onClick={handleVerify}
          disabled={!verifyInput.trim() || verifying}
          aria-label="Verify hash"
        >
          {verifying ? '...' : 'Verify'}
        </button>
      </div>

      {verifyResult !== 'idle' && (
        <div
          className={`mt-3 flex items-center gap-2 rounded-md px-3 py-2 ${
            verifyResult === 'valid'
              ? 'bg-signal-drowsy/[0.1] text-signal-drowsy'
              : 'bg-signal-multi/[0.1] text-signal-multi'
          }`}
          role="alert"
        >
          {verifyResult === 'valid' ? (
            <>
              <Shield size={14} />
              <span className="font-mono text-[11px]">Valid — document integrity confirmed</span>
            </>
          ) : (
            <>
              <ShieldOff size={14} />
              <span className="font-mono text-[11px]">Mismatch — document has been altered</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
