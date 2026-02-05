import React from "react";
import { AlertCircle, DollarSign } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";

interface InsufficientFundsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalance: number;
  requiredAmount: number;
  onAddFunds: () => void;
}

export function InsufficientFundsDialog({
  open,
  onOpenChange,
  currentBalance,
  requiredAmount,
  onAddFunds,
}: InsufficientFundsDialogProps) {
  const shortfall = requiredAmount - currentBalance;

  const handleAddFunds = () => {
    onOpenChange(false);
    onAddFunds();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            Insufficient Funds
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            You don't have enough balance to upload this file
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddFunds}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
          >
            Add Funds
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
