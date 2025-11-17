import React, { useEffect, useState } from 'react';
import { apiGet } from '../lib/http';

type Row = {
  id?: string;
  kind: string;
  durationMs: number;
  ts: number;
  filename?: string;
  bytes?: number;
  error?: string;
};

export default function MetricsTable() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    apiGet('/api/metrics').then(setRows).catch(() => {});
  }, []);

  return (
    <div className="border rounded-xl p-4 mt-4">
      <h3 className="font-semibold mb-3">Recent Metrics</h3>
      <table className="text-sm w-full">
        <thead>
          <tr><th>Time</th><th>Kind</th><th>Duration (ms)</th><th>Bytes</th><th>Error</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id ?? `${r.ts}-${r.kind}`} className="border-t">
              <td>{new Date(r.ts).toLocaleString()}</td>
              <td>{r.kind}</td>
              <td>{r.durationMs.toFixed(1)}</td>
              <td>{r.bytes ?? ''}</td>
              <td className="text-red-600">{r.error ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
