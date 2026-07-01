import { useEffect } from 'react';
import { useHistoryStore } from '../../store/history';

export function useTrends() {
  const trendData = useHistoryStore((s) => s.trendData);
  const loading = useHistoryStore((s) => s.loading);
  const loadHistory = useHistoryStore((s) => s.loadHistory);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return { trendData, loading };
}
