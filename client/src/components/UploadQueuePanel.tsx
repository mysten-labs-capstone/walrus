import React, { useEffect } from "react";
import { useUploadQueue } from "../hooks/useUploadQueue";

export default function UploadQueuePanel() {
  const { items, processQueue, remove, refresh } = useUploadQueue();

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("upload-queue-updated", handler);
    return () => window.removeEventListener("upload-queue-updated", handler);
  }, [refresh]);

  return (
    <div className="rounded-xl border p-4 shadow-sm bg-white">
      <div className="flex justify-between mb-3">
        <h3 className="font-semibold text-lg text-gray-800">
          Pending Uploads ({items.length})
        </h3>
        <button
          onClick={processQueue}
          className="border border-indigo-200 rounded px-3 py-1 text-sm text-indigo-600 hover:bg-indigo-50 transition"
        >
          Upload All
        </button>
      </div>

      <ul className="space-y-2">
        {items.length === 0 && (
          <li className="text-sm text-gray-500">No uploads pending</li>
        )}
        {items.map((i: any) => (
          <li
            key={i.id}
            className="border border-gray-200 p-2 flex justify-between items-center rounded"
          >
            <div>
              <div className="font-medium text-gray-800">{i.filename}</div>
              <div className="text-xs text-gray-500">
                {((i.size || 0) / 1024 / 1024).toFixed(2)} MB • {i.status}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => remove(i.id)}
                className="border border-red-200 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 transition"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
