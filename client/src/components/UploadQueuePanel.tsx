import React, { useEffect } from "react";
import { Trash2, Loader2, Clock, Upload } from "lucide-react";
import { useUploadQueue } from "../hooks/useUploadQueue";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function UploadQueuePanel() {
  const { items, processQueue, processOne, remove, refresh } = useUploadQueue();

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("upload-queue-updated", handler);
    return () => window.removeEventListener("upload-queue-updated", handler);
  }, [refresh]);

  if (items.length === 0) return null;

  return (
    <Card className="border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30 dark:from-slate-900 dark:to-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
            Pending Uploads ({items.length})
          </CardTitle>
          <Button
            onClick={processQueue}
            size="sm"
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
          >
            Upload All
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <ul className="space-y-3">
          {items.map((i: any) => (
            <li
              key={i.id}
              className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/50"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      {i.filename}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatBytes(i.size)} • {i.status}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {i.status === "queued" && (
                      <Button
                        size="sm"
                        onClick={() => processOne(i.id)}
                        className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
                      >
                        <Upload className="h-3 w-3 mr-1" />
                        Upload
                      </Button>
                    )}
                    {i.status !== "uploading" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(i.id)}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Progress bar for uploading/done items */}
                {(i.status === "uploading" || i.status === "done") && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-300"
                      style={{ width: `${i.progress || 0}%` }}
                    />
                  </div>
                )}

                {/* Error message */}
                {i.status === "error" && i.error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                    {i.error}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
