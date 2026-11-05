"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { Lookups } from "@/lib/views";

const Ctx = createContext<Lookups | null>(null);

export function LookupsProvider({ value, children }: { value: Lookups; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLookups() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLookups outside LookupsProvider");
  return v;
}
