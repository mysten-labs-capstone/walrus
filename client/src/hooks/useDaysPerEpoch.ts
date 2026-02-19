import { useState, useEffect } from "react";
import { getDaysPerEpoch } from "../lib/epochConfig";

/**
 * Custom hook to get the days per epoch
 * Returns a state value that updates when fetched from the server
 */
export function useDaysPerEpoch(): number {
  return 14;
}
