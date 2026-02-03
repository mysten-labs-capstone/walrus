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
      <DialogContent className="sm:max-w-md">
        <div className="py-4">
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
            <p className="text-sm text-zinc-300 mb-3">{title}</p>
            <div className="rounded-md bg-zinc-800 p-3 border border-zinc-700">
              <p className="text-sm font-mono text-zinc-200 truncate">
                {fileName}
              </p>
            </div>
            <div className="flex items-start gap-2 mt-3">
              <p className="text-xs text-[#E5484D]">{description}</p>
            </div>
            {note && <p className="text-xs text-zinc-400 mt-2">{note}</p>}
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-200"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            className="bg-[#E5484D] hover:bg-[#E5484D]/90 text-white"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
