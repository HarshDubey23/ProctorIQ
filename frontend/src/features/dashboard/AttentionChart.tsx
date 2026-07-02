import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
} from 'recharts';
import type { AttentionSample } from './useSession';

interface AttentionChartProps {
  data: AttentionSample[];
}

const CHART_THEME = {
  grid: 'var(--hairline)',
  text: 'var(--ink-faint)',
  jade: '#0E6B5C',
  ochre: '#B8763A',
  plum: '#6B5178',
  clay: '#A63D2F',
};

function formatTick(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function lineColor(label: string): string {
  switch (label) {
    case 'focused': return CHART_THEME.jade;
    case 'distracted': return CHART_THEME.ochre;
    case 'absent': return CHART_THEME.clay;
    case 'drowsy': return CHART_THEME.plum;
    case 'multi': return CHART_THEME.clay;
    default: return CHART_THEME.jade;
  }
}

export function AttentionChart({ data }: AttentionChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl p-6" style={{ backgroundColor: 'var(--surface-1)', boxShadow: 'var(--shadow-sm)', borderTop: '1px solid var(--edge-highlight)' }}>
        <span className="font-sans text-sm italic" style={{ color: 'var(--ink-faint)' }}>
          No data yet
        </span>
      </div>
    );
  }

  const lastLabel = data[data.length - 1]?.attention ?? 'focused';
  const activeColor = lineColor(lastLabel);

  return (
    <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--surface-1)', boxShadow: 'var(--shadow-sm)', borderTop: '1px solid var(--edge-highlight)' }}>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -20 }}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={activeColor} stopOpacity={0.15} />
              <stop offset="100%" stopColor={activeColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatTick}
            stroke={CHART_THEME.text}
            tick={{ fontSize: 10, fontFamily: "'Martian Mono Variable', 'JetBrains Mono', monospace" }}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis
            domain={[0, 100]}
            stroke={CHART_THEME.text}
            tick={{ fontSize: 10, fontFamily: "'Martian Mono Variable', 'JetBrains Mono', monospace" }}
            tickCount={5}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--surface-2)',
              border: '1px solid var(--hairline-strong)',
              borderRadius: '8px',
              fontSize: '12px',
              fontFamily: "'Martian Mono Variable', 'JetBrains Mono', monospace",
              color: 'var(--ink)',
              boxShadow: 'var(--shadow-md)',
            }}
            labelFormatter={formatTick}
            formatter={(value: number) => [`${Math.round(value)}`, 'Score']}
          />
          <Area
            type="monotone"
            dataKey="score"
            fill="url(#areaGrad)"
            stroke="none"
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke={activeColor}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
