import { ApertureGauge } from "../ui/ApertureGauge";
import { BentoGrid } from "../ui/BentoGrid";
import { BentoCard } from "../ui/BentoCard";
import { useUIStore } from "../../store/ui";
import { useCallback, useMemo } from "react";
import { Eye, Shield, ScanFace, Stamp, Activity, Radio, Languages, Bot } from "lucide-react";
import { StampedSeal } from "../ui/stamped-seal";
import { Button } from "../ui/button";
import { useLang } from "../../lib/i18n";
import VaporizeTextCycle, { Tag } from "../ui/vapour-text-effect";
import { InteractiveRobotSpline } from "../ui/interactive-3d-robot";

function LiveGaugePreview() {
  return (
    <ApertureGauge openness={0.85} size={80}>
      <div className="flex items-center justify-center" style={{ width: 80, height: 80, backgroundColor: "#E8E3D7" }}>
        <Eye size={24} className="text-graphite" />
      </div>
    </ApertureGauge>
  );
}

export function LandingScreen() {
  const setActivePanel = useUIStore((s) => s.setActivePanel);
  const { lang, setLang } = useLang();

  const goToExam = useCallback(() => setActivePanel("exam"), [setActivePanel]);
  const goToSession = useCallback(() => setActivePanel("session"), [setActivePanel]);

  const cards = useMemo(() => [
    {
      title: "Live Gaze Tracking",
      description: "Real-time head pose and eye aspect ratio estimates via MediaPipe. See your attention state reflected in the aperture.",
      colSpan: 2 as const,
      rowSpan: 1 as const,
      children: <LiveGaugePreview />,
    },
    {
      title: "Privacy First",
      description: "All inference runs locally in a web worker. No frames leave the device.",
      colSpan: 1 as const,
      rowSpan: 1 as const,
      children: <Shield size={20} className="text-ledger" />,
    },
    {
      title: "Signed Integrity",
      description: "Every session anchored by a rolling SHA-256 hash chain. Tamper-evident logs you can verify offline.",
      colSpan: 1 as const,
      rowSpan: 1 as const,
    },
    {
      title: "Cohort Wall",
      description: "Live pulse wall of stamped seals — no video stream required. Only attention signals.",
      colSpan: 1 as const,
      rowSpan: 2 as const,
      children: (
        <StampedSeal confidence={0.87} size={100} label="LIVE" />
      ),
    },
    {
      title: "Blink & Fatigue",
      description: "Monitor blink frequency over minutes to detect microsleep risk.",
      colSpan: 1 as const,
      rowSpan: 1 as const,
      children: <Activity size={20} className="text-ochre" />,
    },
    {
      title: "Sub-second Latency",
      description: "End-to-end under 40ms on modern hardware. No cloud round-trip.",
      colSpan: 1 as const,
      rowSpan: 1 as const,
      children: <ScanFace size={20} className="text-signal-gaze" />,
    },
  ], []);

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-paper text-ink">
      {/* HERO */}
      <section className="flex flex-col items-center justify-center gap-8 px-6 py-16 md:py-24">
        <div className="flex flex-col items-center gap-4 max-w-3xl">
          <div className="flex items-center gap-3">
            <Stamp size={24} className="text-stamp" />
            <span className="font-label text-label tracking-widest text-stamp">PROCTORIQ v2</span>
            <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
              className="flex items-center gap-1 border-[2px] border-ink px-2 py-0.5 font-label text-label text-ink hover:bg-ink hover:text-paper ml-2"
              aria-label={`Switch language to ${lang === 'en' ? 'Hindi' : 'English'}`}>
              <Languages size={12} />
              {lang === 'en' ? 'HI' : 'EN'}
            </button>
          </div>
          <div className="w-full max-w-2xl h-[140px] md:h-[180px]">
            <VaporizeTextCycle
              texts={["EXAM", "INTEGRITY", "PROVEN", "PROCTORIQ"]}
              font={{ fontFamily: '"Archivo Expanded", "Archivo", sans-serif', fontSize: "80px", fontWeight: 900 }}
              color="rgb(26,26,23)"
              spread={4} density={6}
              animation={{ vaporizeDuration: 2, fadeInDuration: 1, waitDuration: 0.6 }}
              direction="left-to-right" alignment="center" tag={Tag.H1}
            />
          </div>
          <p className="font-body text-lg text-graphite text-center max-w-xl">
            Browser-first, privacy-preserving exam integrity. All video inference runs client-side.
            Only structured attention events reach the server.
          </p>
        </div>

        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Button variant="primary" onClick={() => { window.location.href = "/builder"; }}>
            <Stamp size={18} />
            Build Paper
          </Button>
          <Button variant="default" onClick={() => { window.location.href = "/studio"; }}>
            <Bot size={18} />
            AI Studio
          </Button>
          <Button variant="default" onClick={goToExam}>
            <ScanFace size={18} />
            Start Exam
          </Button>
          <Button onClick={goToSession}>
            <Activity size={18} />
            Self-Test
          </Button>
          <Button onClick={() => { window.location.href = "/host"; }}>
            <Radio size={18} />
            Host Exam
          </Button>
        </div>
      </section>

      {/* FEATURE BENTO GRID */}
      <section className="w-full max-w-5xl mx-auto px-6 pb-16">
        <div className="mb-8">
          <span className="chip">Features</span>
          <h2 className="font-display text-3xl uppercase mt-3">The Instrument</h2>
        </div>
        <BentoGrid>
          {cards.map((card) => (
            <BentoCard
              key={card.title}
              title={card.title}
              description={card.description}
              colSpan={card.colSpan}
              rowSpan={card.rowSpan}
            >
              {card.children}
            </BentoCard>
          ))}
        </BentoGrid>
      </section>

      {/* ROBOT INSTRUMENT FRAME */}
      <section className="w-full max-w-5xl mx-auto px-6 pb-16">
        <div className="mb-8">
          <span className="chip">Technology</span>
          <h2 className="font-display text-3xl uppercase mt-3">How The Instrument Works</h2>
        </div>
        <div className="border-[3px] border-ink shadow-brutal-lg aspect-[4/3] bg-paper-2 overflow-hidden">
          <InteractiveRobotSpline
            scene="https://prod.spline.design/PyzDhpQ9E5f1E3MT/scene.splinecode"
            className="w-full h-full"
          />
        </div>
        <p className="font-body text-sm text-graphite mt-4 text-center max-w-2xl mx-auto">
          A 1D-CNN on windowed face-landmark sequences, PCA to 64 components, exported to a compact ONNX artifact.
          All inference runs in-browser via MediaPipe WASM + ONNX Runtime Web.
        </p>
      </section>

      {/* STATS STRIP */}
      <section className="w-full border-y-[3px] border-ink bg-paper-2">
        <div className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-3 gap-8 text-center">
          <div>
            <span className="font-mono text-data-lg font-bold text-ink">99.22%</span>
            <span className="block font-label text-label text-graphite mt-1">Accuracy</span>
          </div>
          <div>
            <span className="font-mono text-data-lg font-bold text-ink">~27 KB</span>
            <span className="block font-label text-label text-graphite mt-1">Model Size</span>
          </div>
          <div>
            <span className="font-mono text-data-lg font-bold text-ink">5-Fold</span>
            <span className="block font-label text-label text-graphite mt-1">Cross-Validation</span>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-ink text-paper px-6 py-12">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Stamp size={20} className="text-stamp" />
            <span className="font-display text-xl uppercase tracking-widest">ProctorIQ</span>
          </div>
          <p className="font-body text-sm text-paper-2 text-center">
            Privacy-preserving exam integrity. No video leaves the device.
          </p>
          <div className="flex items-center gap-4">
            <a href="/styleguide" className="font-body text-sm text-paper-2 hover:text-paper underline">Styleguide</a>
            <a href="/model" className="font-body text-sm text-paper-2 hover:text-paper underline">Model Card</a>
            <a href="/studio" className="font-body text-sm text-paper-2 hover:text-paper underline">AI Studio</a>
            <a href="/host" className="font-body text-sm text-paper-2 hover:text-paper underline">Host Exam</a>
          </div>
        </div>
        <div className="max-w-5xl mx-auto mt-8 pt-6 border-t-[1px] border-paper/20 text-center">
          <p className="font-mono text-xs text-graphite">SERVER-VERIFIED &middot; HMAC-SHA256 &middot; v2.0</p>
        </div>
      </footer>
    </div>
  );
}
