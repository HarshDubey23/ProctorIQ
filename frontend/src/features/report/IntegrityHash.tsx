import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, ShieldCheck, ShieldAlert } from 'lucide-react';
import { verifySessionHash } from '../../lib/signing';

interface IntegrityHashProps {
  sessionId: string;
  hash: string;
  serverVerified?: boolean;
}

export function IntegrityHash({ sessionId, hash, serverVerified = false }: IntegrityHashProps) {
  const [copied, setCopied] = useState(false);
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyResult, setVerifyResult] = useState<'idle' | 'valid' | 'mismatch'>('idle');
  const [verifying, setVerifying] = useState(false);
  const [showSeal, setShowSeal] = useState(false);

  useEffect(() => {
    if (serverVerified && hash) {
      const t = setTimeout(() => setShowSeal(true), 400);
      return () => clearTimeout(t);
    }
    setShowSeal(false);
  }, [serverVerified, hash]);

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
    <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--hairline)', borderTop: '1px solid var(--edge-highlight)', boxShadow: 'var(--shadow-sm)' }}>
      <div className="mb-3 flex items-center gap-2">
        {serverVerified && showSeal ? (
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          >
            <ShieldCheck size={18} style={{ color: 'var(--gold)' }} />
          </motion.div>
        ) : (
          <ShieldAlert size={14} style={{ color: serverVerified ? 'var(--gold)' : 'var(--ochre)' }} />
        )}
        <span className="font-sans text-[11px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>
          Integrity Hash (SHA-256)
        </span>
      </div>

      {/* Server-verified seal banner */}
      <AnimatePresence>
        {serverVerified && showSeal && (
          <motion.div
            className="mb-3 flex items-center gap-2 rounded-md px-3 py-2"
            style={{
              backgroundColor: 'rgba(201,162,75,0.1)',
              border: '1px solid rgba(201,162,75,0.3)',
            }}
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <ShieldCheck size={16} style={{ color: 'var(--gold)' }} />
            <span className="font-mono text-[11px]" style={{ color: 'var(--gold)' }}>
              Signed Report — Document Integrity Confirmed
            </span>
          </motion.div>
        )}
        {!serverVerified && (
          <div
            className="mb-3 flex items-center gap-2 rounded-md px-3 py-2"
            style={{
              backgroundColor: 'rgba(185,118,58,0.08)',
              border: '1px solid rgba(185,118,58,0.2)',
            }}
          >
            <ShieldAlert size={14} style={{ color: 'var(--ochre)' }} />
            <span className="font-mono text-[11px]" style={{ color: 'var(--ochre)' }}>
              Local Draft — Not Server Verified
            </span>
          </div>
        )}
      </AnimatePresence>

      <div className="mb-3 flex items-center gap-2">
        <code
          className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-md px-3 py-2 font-mono text-[11px] select-all"
          style={{
            backgroundColor: 'var(--surface-2)',
            border: '1px solid var(--hairline-strong)',
            borderTop: '1px solid var(--edge-highlight)',
            boxShadow: 'var(--shadow-sm)',
            color: 'var(--cobalt)',
          }}
        >
          {hash}
        </code>
        <button
          className="shrink-0 rounded-lg p-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: 'var(--ink-muted)' }}
          onClick={handleCopy}
          aria-label={copied ? 'Copied to clipboard' : 'Copy hash to clipboard'}
        >
          {copied ? <Check size={14} style={{ color: 'var(--jade)' }} /> : <Copy size={14} />}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          className="flex-1 rounded-md px-3 py-2 font-mono text-[11px] outline-none transition-colors"
          style={{
            backgroundColor: 'var(--surface-2)',
            border: '1px solid var(--hairline-strong)',
            borderTop: '1px solid var(--edge-highlight)',
            boxShadow: 'var(--shadow-sm)',
            color: 'var(--ink)',
          }}
          placeholder="Paste hash to verify..."
          value={verifyInput}
          onChange={(e) => {
            setVerifyInput(e.target.value);
            setVerifyResult('idle');
          }}
          aria-label="Hash to verify"
        />
        <button
          className="shrink-0 rounded-lg px-3 py-2 font-sans text-[11px] transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: 'rgba(46,76,140,0.1)',
            color: 'var(--cobalt)',
          }}
          onClick={handleVerify}
          disabled={!verifyInput.trim() || verifying}
          aria-label="Verify hash"
        >
          {verifying ? '...' : 'Verify'}
        </button>
      </div>

      {verifyResult !== 'idle' && (
        <motion.div
          className="mt-3 flex items-center gap-2 rounded-md px-3 py-2"
          style={{
            backgroundColor: verifyResult === 'valid'
              ? 'rgba(14,107,92,0.1)'
              : 'rgba(166,61,47,0.1)',
            color: verifyResult === 'valid' ? 'var(--jade)' : 'var(--clay)',
          }}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
        >
          {verifyResult === 'valid' ? (
            <>
              <ShieldCheck size={14} />
              <span className="font-mono text-[11px]">Valid — document integrity confirmed</span>
            </>
          ) : (
            <>
              <ShieldAlert size={14} />
              <span className="font-mono text-[11px]">Mismatch — document has been altered</span>
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}
