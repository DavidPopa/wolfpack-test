"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { RoomRealtimeProvider } from "@/lib/room-realtime";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={client}>
    <RoomRealtimeProvider>{children}</RoomRealtimeProvider>
  </QueryClientProvider>;
}
