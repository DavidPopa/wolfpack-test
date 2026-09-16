"use client";

import {
  roomCreatedEventPayloadSchema,
  type PublicRoom,
  type RoomCreatedEventPayload
} from "@map-chat/contracts";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { io, type Manager, type Socket } from "socket.io-client";
import {
  roomCreateAttemptsQueryKey,
  type RoomCreateAttempt
} from "./room-create";
import {
  fetchPublicRooms,
  mergePublicRooms,
  roomsQueryKey,
  upsertPublicRoom
} from "./rooms";

const ROOM_CREATED_EVENT = "room.created";

interface RoomServerEvents {
  [ROOM_CREATED_EVENT]: (payload: unknown) => void;
}

type RoomSocket = Socket<RoomServerEvents, Record<never, never>>;

export type RoomRealtimeResolution = Readonly<{
  event: RoomCreatedEventPayload;
  attempt: RoomCreateAttempt | null;
}>;

type ResolutionListener = (resolution: RoomRealtimeResolution) => void;

const RoomRealtimeContext = createContext<{
  subscribe: (listener: ResolutionListener) => () => void;
}>({ subscribe: () => () => undefined });

type ConnectionState =
  | "connecting"
  | "connected"
  | "interrupted"
  | "recovering"
  | "recovered"
  | "recovery-error";

const connectionCopy: Record<ConnectionState, string> = {
  connecting: "Connecting to live room updates…",
  connected: "Live room updates connected.",
  interrupted: "Live room updates interrupted. Reconnecting…",
  recovering: "Live room updates reconnected. Recovering missed rooms…",
  recovered: "Live room updates recovered.",
  "recovery-error": "Live updates reconnected, but missed rooms could not be refreshed yet."
};

function createRoomSocket(): RoomSocket {
  return io({ path: "/socket.io" });
}

export function RoomRealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const listenersRef = useRef(new Set<ResolutionListener>());
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  const subscribe = useCallback((listener: ResolutionListener) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  useEffect(() => {
    let active = true;
    let connectedOnce = false;
    let recovery: Promise<void> | null = null;
    const socket = createRoomSocket();

    const recoverMissedRooms = () => {
      if (recovery) return recovery;
      setConnectionState("recovering");
      recovery = queryClient.fetchQuery({
        queryKey: roomsQueryKey,
        queryFn: async () => {
          const incoming = await fetchPublicRooms();
          return mergePublicRooms(queryClient.getQueryData(roomsQueryKey), incoming);
        },
        staleTime: 0
      }).then(() => {
        if (active) setConnectionState("recovered");
      }).catch(() => {
        if (active) setConnectionState("recovery-error");
      }).finally(() => {
        recovery = null;
      });
      return recovery;
    };

    const handleConnect = () => {
      if (!connectedOnce) {
        connectedOnce = true;
        setConnectionState("connected");
        return;
      }
      void recoverMissedRooms();
    };
    const handleDisconnect = () => {
      if (active && connectedOnce) setConnectionState("interrupted");
    };
    const handleConnectError = () => {
      if (active) setConnectionState(connectedOnce ? "interrupted" : "connecting");
    };
    const handleRoomCreated = (untrustedPayload: unknown) => {
      const parsed = roomCreatedEventPayloadSchema.safeParse(untrustedPayload);
      if (!parsed.success) return;

      const attempts = queryClient.getQueryData<RoomCreateAttempt[]>(roomCreateAttemptsQueryKey) ?? [];
      const attempt = attempts.find(
        (candidate) => candidate.clientRequestId === parsed.data.clientRequestId
      ) ?? null;
      queryClient.setQueryData(roomsQueryKey, (existing) => upsertPublicRoom(
        existing as PublicRoom[] | undefined,
        parsed.data.room
      ));
      if (attempt) {
        queryClient.setQueryData<RoomCreateAttempt[]>(roomCreateAttemptsQueryKey, (existing) =>
          (existing ?? []).filter(
            (candidate) => candidate.clientRequestId !== parsed.data.clientRequestId
          )
        );
      }
      const resolution = { event: parsed.data, attempt };
      for (const listener of listenersRef.current) listener(resolution);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on(ROOM_CREATED_EVENT, handleRoomCreated);

    return () => {
      active = false;
      socket.removeAllListeners();
      (socket.io as Manager).removeAllListeners();
      socket.disconnect();
    };
  }, [queryClient]);

  const value = useMemo(() => ({ subscribe }), [subscribe]);
  return <RoomRealtimeContext.Provider value={value}>
    <p className="room-connection-status" role="status" aria-live="polite">
      {connectionCopy[connectionState]}
    </p>
    {children}
  </RoomRealtimeContext.Provider>;
}

export function useRoomRealtimeResolution(listener: ResolutionListener) {
  const { subscribe } = useContext(RoomRealtimeContext);
  const listenerRef = useRef(listener);
  useEffect(() => {
    listenerRef.current = listener;
  }, [listener]);
  useEffect(() => subscribe((resolution) => listenerRef.current(resolution)), [subscribe]);
}
