import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, ArrowRight, ExternalLink } from 'lucide-react';

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
    <div className="flex h-full w-full flex-col items-center justify-center p-6">
      <div
        className="w-full max-w-md rounded-xl p-6"
        style={{
          backgroundColor: 'var(--surface-1)',
          border: '1px solid var(--hairline)',
          borderTop: '1px solid var(--edge-highlight)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="flex items-center gap-2">
            <span className="font-display text-lg uppercase tracking-[0.08em]" style={{ color: 'var(--ink)' }}>
              Exam Created
            </span>
          </div>

          <div
            className="flex flex-col items-center gap-3 rounded-xl p-5"
            style={{
              backgroundColor: 'var(--surface-2)',
              border: '1px solid var(--hairline-strong)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <QRCodeSVG
              value={fullUrl}
              size={160}
              level="M"
              fgColor="#0E6B5C"
              bgColor="transparent"
              style={{ borderRadius: '8px', border: '4px solid var(--surface-1)' }}
            />
            <span className="font-sans text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--ink-faint)' }}>
              Scan to join
            </span>
          </div>

          <div className="flex w-full flex-col gap-2">
            <div className="font-sans text-[11px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>
              Share this link
            </div>
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 font-mono text-[12px] select-all"
              style={{
                backgroundColor: 'var(--surface-2)',
                border: '1px solid var(--hairline-strong)',
                borderTop: '1px solid var(--edge-highlight)',
                boxShadow: 'var(--shadow-sm)',
                color: 'var(--cobalt)',
              }}
            >
              <span className="flex-1 truncate">{fullUrl}</span>
              <button
                className="shrink-0 rounded-md p-1.5 transition-colors"
                style={{ color: 'var(--ink-muted)' }}
                onClick={handleCopy}
                aria-label={copied ? 'Copied' : 'Copy link'}
              >
                {copied ? <Check size={14} style={{ color: 'var(--jade)' }} /> : <Copy size={14} />}
              </button>
            </div>
            {copied && (
              <span className="font-sans text-[10px]" style={{ color: 'var(--jade)' }}>
                Link copied to clipboard!
              </span>
            )}
          </div>

          <p className="text-center font-sans text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            Anyone with this link can join the exam — no account or signup required.
            Participants will see a self-test calibration before entering the exam.
          </p>

          <motion.button
            onClick={onGoToDashboard}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-8 py-3 font-display text-[15px] uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: 'var(--jade)',
              color: '#fff',
              border: '1px solid rgba(14,107,92,0.3)',
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Go to Mission Control
            <ArrowRight size={16} />
          </motion.button>

          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{
              backgroundColor: 'rgba(46,76,140,0.08)',
              border: '1px solid rgba(46,76,140,0.15)',
            }}
          >
            <ExternalLink size={12} style={{ color: 'var(--cobalt)' }} />
            <span className="font-sans text-[10px]" style={{ color: 'var(--ink-muted)' }}>
              Room ID: <span className="font-mono" style={{ color: 'var(--cobalt)' }}>{roomId}</span>
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
