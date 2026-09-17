"use client";

import {
  messageCreatedEventPayloadSchema,
  roomCreatedEventPayloadSchema,
  type MessageHistoryResponse,
  type MessageRoomSubscription,
  type PublicRoom,
  type RoomCreatedEventPayload
} from "@map-chat/contracts";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
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
  messageCreateAttemptsQueryKey,
  upsertCanonicalMessage,
  type MessageCreateAttempt
} from "./message-create";
import { messageHistoryQueryKey } from "./message-history";
import { catchUpMessageHistory } from "./message-realtime";
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
const MESSAGE_CREATED_EVENT = "message.created";
const MESSAGE_SUBSCRIBE_EVENT = "message.subscribe";
const MESSAGE_UNSUBSCRIBE_EVENT = "message.unsubscribe";

interface RoomServerEvents {
  [ROOM_CREATED_EVENT]: (payload: unknown) => void;
  [MESSAGE_CREATED_EVENT]: (payload: unknown) => void;
}

interface RoomClientEvents {
  [MESSAGE_SUBSCRIBE_EVENT]: (payload: MessageRoomSubscription) => void;
  [MESSAGE_UNSUBSCRIBE_EVENT]: (payload: MessageRoomSubscription) => void;
}

type RoomSocket = Socket<RoomServerEvents, RoomClientEvents>;

export type RoomRealtimeResolution = Readonly<{
  event: RoomCreatedEventPayload;
  attempt: RoomCreateAttempt | null;
}>;

type ResolutionListener = (resolution: RoomRealtimeResolution) => void;

const RoomRealtimeContext = createContext<{
  subscribe: (listener: ResolutionListener) => () => void;
  followMessageRoom: (roomId: string | null) => void;
}>({
  subscribe: () => () => undefined,
  followMessageRoom: () => undefined
});

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
  recovering: "Live room updates reconnected. Recovering missed rooms and messages…",
  recovered: "Live room updates recovered.",
  "recovery-error": "Live updates reconnected, but missed rooms or messages could not be refreshed yet."
};

function createRoomSocket(): RoomSocket {
  return io({ path: "/socket.io" });
}

export function RoomRealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const listenersRef = useRef(new Set<ResolutionListener>());
  const socketRef = useRef<RoomSocket | null>(null);
  const followedMessageRoomRef = useRef<string | null>(null);
  const messageRoomGenerationRef = useRef(0);
  const retryRecoveryRef = useRef<() => void>(() => undefined);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  const subscribe = useCallback((listener: ResolutionListener) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  const followMessageRoom = useCallback((roomId: string | null) => {
    const previousRoomId = followedMessageRoomRef.current;
    if (previousRoomId === roomId) return;

    followedMessageRoomRef.current = roomId;
    messageRoomGenerationRef.current += 1;
    const socket = socketRef.current;
    if (!socket?.connected) return;
    if (previousRoomId) socket.emit(MESSAGE_UNSUBSCRIBE_EVENT, { roomId: previousRoomId });
    if (roomId) socket.emit(MESSAGE_SUBSCRIBE_EVENT, { roomId });
  }, []);

  useEffect(() => {
    let active = true;
    let connectedOnce = false;
    let recovery: { roomId: string | null; promise: Promise<void> } | null = null;
    const socket = createRoomSocket();
    socketRef.current = socket;

    const recoverLiveData = () => {
      const roomId = followedMessageRoomRef.current;
      const generation = messageRoomGenerationRef.current;
      if (recovery?.roomId === roomId) return recovery.promise;
      setConnectionState("recovering");
      const roomsRecovery = queryClient.fetchQuery({
        queryKey: roomsQueryKey,
        queryFn: async () => {
          const incoming = await fetchPublicRooms();
          return mergePublicRooms(queryClient.getQueryData(roomsQueryKey), incoming);
        },
        staleTime: 0
      });
      const messagesRecovery = roomId
        ? catchUpMessageHistory({
            queryClient,
            roomId,
            isCurrent: () => active
              && followedMessageRoomRef.current === roomId
              && messageRoomGenerationRef.current === generation
          })
        : Promise.resolve();
      const promise = Promise.all([roomsRecovery, messagesRecovery]).then(() => {
        if (active) setConnectionState("recovered");
      }).catch(() => {
        if (active) setConnectionState("recovery-error");
      }).finally(() => {
        if (recovery?.promise === promise) recovery = null;
      });
      recovery = { roomId, promise };
      return promise;
    };
    retryRecoveryRef.current = () => void recoverLiveData();

    const handleConnect = () => {
      const roomId = followedMessageRoomRef.current;
      if (roomId) socket.emit(MESSAGE_SUBSCRIBE_EVENT, { roomId });
      if (!connectedOnce) {
        connectedOnce = true;
        setConnectionState("connected");
        return;
      }
      void recoverLiveData();
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
    const handleMessageCreated = (untrustedPayload: unknown) => {
      const parsed = messageCreatedEventPayloadSchema.safeParse(untrustedPayload);
      if (!parsed.success || parsed.data.message.roomId !== followedMessageRoomRef.current) return;

      const queryKey = messageHistoryQueryKey(parsed.data.message.roomId);
      queryClient.setQueryData<InfiniteData<MessageHistoryResponse, string | null>>(queryKey, (current) => {
        if (current) return upsertCanonicalMessage(current, parsed.data.message);
        return {
          pages: [{
            messages: [parsed.data.message],
            pageInfo: { startCursor: null, endCursor: null, hasOlder: false, hasNewer: false }
          }],
          pageParams: [null]
        };
      });
      queryClient.setQueryData<MessageCreateAttempt[]>(messageCreateAttemptsQueryKey, (current) =>
        (current ?? []).filter((attempt) => !(
          attempt.clientRequestId === parsed.data.clientRequestId
          && attempt.roomId === parsed.data.message.roomId
        ))
      );
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on(ROOM_CREATED_EVENT, handleRoomCreated);
    socket.on(MESSAGE_CREATED_EVENT, handleMessageCreated);

    return () => {
      active = false;
      retryRecoveryRef.current = () => undefined;
      if (socketRef.current === socket) socketRef.current = null;
      socket.removeAllListeners();
      (socket.io as Manager).removeAllListeners();
      socket.disconnect();
    };
  }, [queryClient]);

  const value = useMemo(
    () => ({ subscribe, followMessageRoom }),
    [followMessageRoom, subscribe]
  );
  return <RoomRealtimeContext.Provider value={value}>
    <div className="room-connection-status" role="status" aria-live="polite">
      {connectionCopy[connectionState]}
      {connectionState === "recovery-error" && <button type="button" onClick={() => retryRecoveryRef.current()}>
        Retry live recovery
      </button>}
    </div>
    {children}
  </RoomRealtimeContext.Provider>;
}

export function useMessageRoomRealtime(roomId: string | null) {
  const { followMessageRoom } = useContext(RoomRealtimeContext);
  useEffect(() => {
    followMessageRoom(roomId);
    return () => followMessageRoom(null);
  }, [followMessageRoom, roomId]);
}

export function useRoomRealtimeResolution(listener: ResolutionListener) {
  const { subscribe } = useContext(RoomRealtimeContext);
  const listenerRef = useRef(listener);
  useEffect(() => {
    listenerRef.current = listener;
  }, [listener]);
  useEffect(() => subscribe((resolution) => listenerRef.current(resolution)), [subscribe]);
}
