import { useState, useEffect } from "react";
import { getDaysPerEpoch } from "../lib/epochConfig";

/**
 * Custom hook to get the days per epoch
 * Returns a state value that updates when fetched from the server
 */
export function useDaysPerEpoch(): number {
  const [daysPerEpoch, setDaysPerEpoch] = useState<number>(14); // Default to 14

  useEffect(() => {
    getDaysPerEpoch()
      .then(setDaysPerEpoch)
      .catch((err) => {
        console.error("[useDaysPerEpoch] Failed to fetch days per epoch:", err);
        // Keep the default value of 14
      });
  }, []);

  return daysPerEpoch;
}
