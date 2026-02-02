import React from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  onConfirm: () => void;
  title?: string;
  description?: string;
  note?: string;
  confirmLabel?: string;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  fileName,
  onConfirm,
  title = "Are you sure you want to permanently delete this file?",
  description = "This will permanently remove the file from Walrus storage",
  note,
  confirmLabel = "Delete Permanently",
}: DeleteConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800">
        <div className="py-4">
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <p className="text-sm text-slate-300 mb-3">{title}</p>
            <div className="rounded-md bg-slate-800 p-3 border border-slate-700">
              <p className="text-sm font-mono text-slate-200 truncate">
                {fileName}
              </p>
            </div>
            <div className="flex items-start gap-2 mt-3">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-xs text-destructive">{description}</p>
            </div>
            {note && <p className="text-xs text-gray-400 mt-2">{note}</p>}
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-slate-200"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            className="bg-destructive hover:bg-destructive-dark text-destructive-foreground"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
