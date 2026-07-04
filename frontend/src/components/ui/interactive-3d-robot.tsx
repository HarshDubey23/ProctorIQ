import { Suspense, lazy } from "react";

const Spline = lazy(() => import("@splinetool/react-spline"));

interface InteractiveRobotSplineProps {
  scene: string;
  className?: string;
}

export function InteractiveRobotSpline({ scene, className }: InteractiveRobotSplineProps) {
  return (
    <Suspense
      fallback={
        <div className={`w-full h-full flex items-center justify-center bg-ink text-paper font-mono text-sm ${className ?? ""}`}>
          <span className="animate-pulse">LOADING INSTRUMENT&hellip;</span>
        </div>
      }>
      <Spline scene={scene} className={className} />
    </Suspense>
  );
}
