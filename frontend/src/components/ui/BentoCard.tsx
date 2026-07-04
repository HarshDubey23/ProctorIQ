import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface BentoCardProps {
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
  colSpan?: 1 | 2;
  rowSpan?: 1 | 2;
}

export function BentoCard({
  title,
  description,
  children,
  className = "",
  colSpan = 1,
  rowSpan = 1,
}: BentoCardProps) {
  const gridStyle: React.CSSProperties = {};
  if (colSpan === 2) gridStyle.gridColumn = "span 2";
  if (rowSpan === 2) gridStyle.gridRow = "span 2";

  return (
    <div
      className={cn(
        "card-brutal flex flex-col gap-3 p-5",
        className
      )}
      style={gridStyle}
    >
      <h3 className="font-display text-base uppercase tracking-[0.06em] text-ink">
        {title}
      </h3>
      <p className="font-body text-sm leading-relaxed text-graphite">
        {description}
      </p>
      {children && (
        <div className="mt-auto pt-2">
          {children}
        </div>
      )}
    </div>
  );
}
