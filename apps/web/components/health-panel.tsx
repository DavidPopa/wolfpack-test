"use client";

import { healthResponseSchema, type HealthResponse } from "@map-chat/contracts";
import { useQuery } from "@tanstack/react-query";
import { Button } from "./ui/button";

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("Health request failed");
  return healthResponseSchema.parse(await response.json());
}
export function HealthPanel() {
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth, retry: false });
  if (health.isPending) return <p className="status" role="status">Checking API health…</p>;
  if (health.isError) return <div className="status error" role="alert">
    <p>The API health check could not be completed.</p>
    <Button type="button" aria-label="Retry health check" onClick={() => void health.refetch()}>Retry</Button>
  </div>;
  return <p className="status" role="status">API status: <strong>{health.data.status}</strong></p>;
}
