import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { AttentionSample } from './useSession';

interface AttentionChartProps {
  data: AttentionSample[];
}

const CHART_THEME = {
  grid: 'rgba(100,116,139,0.12)',
  text: '#94A3B8',
  lineFocus: '#38BDF8',
  lineAlert: '#FB923C',
  lineAbsent: '#A78BFA',
  lineMulti: '#F472B6',
  lineDrowsy: '#34D399',
};

function formatTick(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function lineColor(label: string): string {
  switch (label) {
    case 'focused': return CHART_THEME.lineFocus;
    case 'distracted': return CHART_THEME.lineAlert;
    case 'absent': return CHART_THEME.lineAbsent;
    case 'drowsy': return CHART_THEME.lineDrowsy;
    case 'multi': return CHART_THEME.lineMulti;
    default: return CHART_THEME.lineFocus;
  }
}

export function AttentionChart({ data }: AttentionChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl bg-white/[0.02] p-6">
        <span className="font-sans text-[13px] text-text-muted italic">
          No data yet
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white/[0.02] p-3">
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatTick}
            stroke={CHART_THEME.text}
            tick={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis
            domain={[0, 100]}
            stroke={CHART_THEME.text}
            tick={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
            tickCount={5}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1C2430',
              border: '1px solid rgba(100,116,139,0.2)',
              borderRadius: '8px',
              fontSize: '12px',
              fontFamily: 'JetBrains Mono, monospace',
              color: '#F1F5F9',
            }}
            labelFormatter={formatTick}
            formatter={(value: number) => [`${Math.round(value)}`, 'Score']}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke={lineColor(data[data.length - 1]?.attention ?? 'focused')}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
