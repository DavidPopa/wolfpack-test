"use client";

import type { PublicRoom } from "@map-chat/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { Map as LeafletMap, Marker } from "leaflet";
import { useAuthSession } from "@/lib/auth-session";
import { MAP_CENTER, MAP_INITIAL_ZOOM, MAP_MAX_ZOOM, STADIA_WATERCOLOR } from "@/lib/map-provider";
import {
  mapSelectionEquals,
  parseDraftCoordinates,
  readMapSelection,
  urlForMapSelection,
  type DraftCoordinates,
  type MapSelection
} from "@/lib/map-selection";
import {
  createRoom,
  generateRoomClientRequestId,
  roomCreateAttemptsQueryKey,
  RoomCreateError,
  type RoomCreateAttempt
} from "@/lib/room-create";
import { useRoomRealtimeResolution, type RoomRealtimeResolution } from "@/lib/room-realtime";
import { fetchPublicRooms, mergePublicRooms, roomsQueryKey, upsertPublicRoom } from "@/lib/rooms";
import { AuthPanel, signInWithGoogle } from "./auth-panel";
import { MessageHistoryPanel } from "./message-history-panel";
import { MessageComposer } from "./message-composer";
import { Button } from "./ui/button";

type LeafletModule = typeof Leaflet;
type SelectionSource = "mouse" | "keyboard" | "restore";

function roomIcon(leaflet: LeafletModule, selected: boolean) {
  return leaflet.divIcon({
    className: `room-pin-wrapper${selected ? " room-pin-wrapper--selected" : ""}`,
    html: `<span class="room-pin"><span class="room-pin__center"></span>${selected ? '<span class="room-pin__selected" aria-hidden="true">✓</span>' : ""}</span>`,
    iconAnchor: [18, 36],
    iconSize: [36, 36]
  });
}

function draftIcon(leaflet: LeafletModule) {
  return leaflet.divIcon({
    className: "draft-pin-wrapper",
    html: '<span class="draft-pin"><span aria-hidden="true">+</span></span>',
    iconAnchor: [18, 36],
    iconSize: [36, 36]
  });
}

function savingIcon(leaflet: LeafletModule, selected: boolean) {
  return leaflet.divIcon({
    className: `saving-pin-wrapper${selected ? " saving-pin-wrapper--selected" : ""}`,
    html: `<span class="saving-pin"><span class="saving-pin__center" aria-hidden="true"></span>${selected ? '<span class="saving-pin__selected" aria-hidden="true">…</span>' : ""}</span>`,
    iconAnchor: [18, 36],
    iconSize: [36, 36]
  });
}

function sameCoordinates(left: DraftCoordinates, right: DraftCoordinates) {
  return left.latitude === right.latitude && left.longitude === right.longitude;
}

function bindMarkerKeyboard(marker: Marker, key: string, onActivate: (source: SelectionSource) => void) {
  const element = marker.getElement();
  if (!element || element.dataset.mapKeyboardBound === key) return;
  element.dataset.mapKeyboardBound = key;
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onActivate("keyboard");
  });
}

function LeafletCanvas({
  rooms,
  attempts,
  selection,
  selectedAttemptId,
  onRoomSelect,
  onAttemptSelect,
  onDraftSelect
}: {
  rooms: PublicRoom[];
  attempts: RoomCreateAttempt[];
  selection: MapSelection;
  selectedAttemptId: string | null;
  onRoomSelect: (roomId: string, source: SelectionSource) => void;
  onAttemptSelect: (clientRequestId: string, source: SelectionSource) => void;
  onDraftSelect: (coordinates: DraftCoordinates, source: SelectionSource) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const attemptMarkersRef = useRef(new Map<string, Marker>());
  const draftMarkerRef = useRef<Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    let active = true;
    const cleanup: Array<() => void> = [];

    async function initializeMap() {
      const container = containerRef.current;
      if (!container) return;

      const leaflet = await import("leaflet");
      if (!active) return;

      const map = leaflet.map(container, { maxZoom: MAP_MAX_ZOOM }).setView(
        [MAP_CENTER[0], MAP_CENTER[1]],
        MAP_INITIAL_ZOOM
      );
      const tiles = leaflet.tileLayer(STADIA_WATERCOLOR.tileUrl, STADIA_WATERCOLOR.options);
      tiles.on("tileerror", () => {
        if (active) setTileError(true);
      });
      tiles.addTo(map);

      const reflectMapState = () => {
        const center = map.getCenter();
        container.dataset.mapCenter = `${center.lat.toFixed(4)},${center.lng.toFixed(4)}`;
        container.dataset.mapZoom = String(map.getZoom());
        container.dataset.mapMaxZoom = String(map.getMaxZoom());
      };
      map.on("moveend zoomend", reflectMapState);
      let suppressNextEmptyMapClick = false;
      let pointerStart: { x: number; y: number } | null = null;
      let pointerMoved = false;
      const suppressSyntheticEmptyClick = () => {
        suppressNextEmptyMapClick = true;
        window.setTimeout(() => {
          suppressNextEmptyMapClick = false;
        }, 0);
      };
      const handlePointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        pointerStart = { x: event.clientX, y: event.clientY };
        pointerMoved = false;
      };
      const handlePointerMove = (event: PointerEvent) => {
        if (!pointerStart) return;
        const movementX = event.clientX - pointerStart.x;
        const movementY = event.clientY - pointerStart.y;
        if (Math.hypot(movementX, movementY) > 4) pointerMoved = true;
      };
      const handlePointerEnd = () => {
        if (pointerMoved) suppressSyntheticEmptyClick();
        pointerStart = null;
        pointerMoved = false;
      };
      container.addEventListener("pointerdown", handlePointerDown, true);
      container.addEventListener("pointermove", handlePointerMove, true);
      container.addEventListener("pointerup", handlePointerEnd, true);
      container.addEventListener("pointercancel", handlePointerEnd, true);
      cleanup.push(() => {
        container.removeEventListener("pointerdown", handlePointerDown, true);
        container.removeEventListener("pointermove", handlePointerMove, true);
        container.removeEventListener("pointerup", handlePointerEnd, true);
        container.removeEventListener("pointercancel", handlePointerEnd, true);
      });
      map.on("dragstart", () => {
        suppressNextEmptyMapClick = true;
      });
      map.on("dragend", () => {
        suppressSyntheticEmptyClick();
      });
      map.on("click", (event) => {
        if (suppressNextEmptyMapClick) {
          suppressNextEmptyMapClick = false;
          return;
        }
        const originalTarget = event.originalEvent?.target;
        if (originalTarget instanceof Element && originalTarget.closest(".leaflet-control, .leaflet-marker-icon")) return;
        const wrapped = map.wrapLatLng(event.latlng);
        const coordinates = parseDraftCoordinates(`${wrapped.lat},${wrapped.lng}`);
        if (!coordinates) return;
        onDraftSelect(coordinates, "mouse");
      });
      reflectMapState();

      leafletRef.current = leaflet;
      mapRef.current = map;
      setMapReady(true);
    }

    void initializeMap();

    return () => {
      active = false;
      cleanup.forEach((dispose) => dispose());
      markersRef.current.clear();
      attemptMarkersRef.current.clear();
      draftMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
    };
  }, [onDraftSelect]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!mapReady || !leaflet || !map) return;

    const roomIds = new Set(rooms.map((room) => room.id));
    for (const [roomId, marker] of markersRef.current) {
      if (!roomIds.has(roomId)) {
        marker.removeFrom(map);
        markersRef.current.delete(roomId);
      }
    }

    for (const room of rooms) {
      if (markersRef.current.has(room.id)) continue;

      const marker = leaflet.marker([room.latitude, room.longitude], {
        alt: room.title,
        bubblingMouseEvents: false,
        draggable: false,
        icon: roomIcon(leaflet, selection.kind === "room" && selection.roomId === room.id),
        keyboard: true,
        title: room.title
      });
      marker.on("click", (event) => {
        event.originalEvent?.stopPropagation();
        const originalEvent = event.originalEvent;
        const source = originalEvent instanceof KeyboardEvent || (originalEvent instanceof MouseEvent && originalEvent.detail === 0)
          ? "keyboard"
          : "mouse";
        onRoomSelect(room.id, source);
      });
      marker.addTo(map);
      bindMarkerKeyboard(marker, `room:${room.id}`, (source) => onRoomSelect(room.id, source));
      markersRef.current.set(room.id, marker);
    }

    for (const room of rooms) {
      const marker = markersRef.current.get(room.id);
      marker?.setIcon(roomIcon(
        leaflet,
        selection.kind === "room" && selection.roomId === room.id
      ));
      if (marker) bindMarkerKeyboard(marker, `room:${room.id}`, (source) => onRoomSelect(room.id, source));
    }
  }, [mapReady, onRoomSelect, rooms, selection]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!mapReady || !leaflet || !map) return;

    const pendingAttempts = attempts.filter((attempt) => attempt.status === "pending");
    const pendingIds = new Set(pendingAttempts.map((attempt) => attempt.clientRequestId));
    for (const [clientRequestId, marker] of attemptMarkersRef.current) {
      if (!pendingIds.has(clientRequestId)) {
        marker.removeFrom(map);
        attemptMarkersRef.current.delete(clientRequestId);
      }
    }

    for (const attempt of pendingAttempts) {
      const existingMarker = attemptMarkersRef.current.get(attempt.clientRequestId);
      if (existingMarker) {
        existingMarker.setLatLng([attempt.coordinates.latitude, attempt.coordinates.longitude]);
        existingMarker.setIcon(savingIcon(leaflet, selectedAttemptId === attempt.clientRequestId));
        bindMarkerKeyboard(existingMarker, `attempt:${attempt.clientRequestId}`, (source) => onAttemptSelect(attempt.clientRequestId, source));
        continue;
      }

      const marker = leaflet.marker([attempt.coordinates.latitude, attempt.coordinates.longitude], {
        alt: "Saving room location",
        bubblingMouseEvents: false,
        draggable: false,
        icon: savingIcon(leaflet, selectedAttemptId === attempt.clientRequestId),
        keyboard: true,
        title: "Saving room location"
      });
      marker.on("click", (event) => {
        event.originalEvent?.stopPropagation();
        const originalEvent = event.originalEvent;
        const source = originalEvent instanceof KeyboardEvent || (originalEvent instanceof MouseEvent && originalEvent.detail === 0)
          ? "keyboard"
          : "mouse";
        onAttemptSelect(attempt.clientRequestId, source);
      });
      marker.addTo(map);
      bindMarkerKeyboard(marker, `attempt:${attempt.clientRequestId}`, (source) => onAttemptSelect(attempt.clientRequestId, source));
      attemptMarkersRef.current.set(attempt.clientRequestId, marker);
    }
  }, [attempts, mapReady, onAttemptSelect, selectedAttemptId]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!mapReady || !leaflet || !map) return;

    draftMarkerRef.current?.removeFrom(map);
    draftMarkerRef.current = null;
    if (selection.kind !== "draft") return;
    if (attempts.some((attempt) => attempt.status === "pending" && sameCoordinates(attempt.coordinates, selection.coordinates))) return;

    const marker = leaflet.marker(
      [selection.coordinates.latitude, selection.coordinates.longitude],
      {
        alt: "Unsaved room location",
        bubblingMouseEvents: false,
        draggable: false,
        icon: draftIcon(leaflet),
        keyboard: false,
        title: "Unsaved room location"
      }
    );
    marker.addTo(map);
    draftMarkerRef.current = marker;
  }, [attempts, mapReady, selection]);

  return <>
    <div
      ref={containerRef}
      className="map-canvas"
      role="region"
      aria-label="Public room map"
    />
    {tileError && <p className="map-tile-error" role="alert">Map tiles are currently unavailable. Room status is still shown below.</p>}
  </>;
}

export function RoomMap() {
  const auth = useAuthSession();
  const queryClient = useQueryClient();
  const rooms = useQuery({
    queryKey: roomsQueryKey,
    queryFn: async () => {
      const incoming = await fetchPublicRooms();
      return mergePublicRooms(queryClient.getQueryData(roomsQueryKey), incoming);
    },
    refetchOnReconnect: false,
    retry: false
  });
  const createAttempts = useQuery<RoomCreateAttempt[]>({
    queryKey: roomCreateAttemptsQueryKey,
    queryFn: async () => [] as RoomCreateAttempt[],
    initialData: [] as RoomCreateAttempt[],
    retry: false,
    staleTime: Infinity
  });
  const visibleRooms = rooms.data ?? [];
  const [selection, setSelection] = useState<MapSelection>({ kind: "none" });
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const selectionRef = useRef(selection);
  const selectedAttemptIdRef = useRef(selectedAttemptId);
  const selectedRoom = useMemo(
    () => selection.kind === "room" ? visibleRooms.find((room) => room.id === selection.roomId) ?? null : null,
    [selection, visibleRooms]
  );
  const selectedAttempt = useMemo(
    () => selectedAttemptId ? createAttempts.data.find((attempt) => attempt.clientRequestId === selectedAttemptId) ?? null : null,
    [createAttempts.data, selectedAttemptId]
  );
  const selectedAttemptMatchesDraft = selectedAttempt && selection.kind === "draft" && sameCoordinates(selectedAttempt.coordinates, selection.coordinates)
    ? selectedAttempt
    : null;

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    selectedAttemptIdRef.current = selectedAttemptId;
  }, [selectedAttemptId]);

  const setCurrentSelection = useCallback((next: MapSelection) => {
    selectionRef.current = next;
    setSelection(next);
  }, []);

  const setCurrentAttemptId = useCallback((next: string | null) => {
    selectedAttemptIdRef.current = next;
    setSelectedAttemptId(next);
  }, []);

  const roomCreate = useMutation({
    mutationFn: createRoom,
    retry: false,
    onSuccess(result, variables) {
      queryClient.setQueryData(roomsQueryKey, (existing: PublicRoom[] | undefined) => upsertPublicRoom(existing, result.room));
      queryClient.setQueryData(roomCreateAttemptsQueryKey, (existing: RoomCreateAttempt[] | undefined) =>
        (existing ?? []).filter((attempt) => attempt.clientRequestId !== variables.clientRequestId)
      );

      const currentSelection = selectionRef.current;
      if (
        selectedAttemptIdRef.current === variables.clientRequestId
        && currentSelection.kind === "draft"
        && currentSelection.coordinates.latitude === variables.latitude
        && currentSelection.coordinates.longitude === variables.longitude
      ) {
        setCurrentAttemptId(null);
        applySelection({ kind: "room", roomId: result.room.id }, "restore");
      } else {
        setSelectedAttemptId((current) => {
          const next = current === variables.clientRequestId ? null : current;
          selectedAttemptIdRef.current = next;
          return next;
        });
      }
    },
    onError(error, variables) {
      const failure = error instanceof RoomCreateError
        ? error.failure
        : {
          kind: "unexpected" as const,
          message: "Room creation failed. Please try again later.",
          retryable: false
        };
      queryClient.setQueryData(roomCreateAttemptsQueryKey, (existing: RoomCreateAttempt[] | undefined) =>
        (existing ?? []).map((attempt) => attempt.clientRequestId === variables.clientRequestId
          ? {
            ...attempt,
            status: "failed" as const,
            error: failure
          }
          : attempt)
      );
    }
  });

  const applySelection = useCallback((next: MapSelection, source: SelectionSource, historyMode: "push" | "none" = "push") => {
    setCurrentSelection(next);
    setCurrentAttemptId(null);
    if (historyMode === "push") {
      const target = urlForMapSelection(new URL(window.location.href), next);
      window.history.pushState(null, "", target);
    }
    if (source === "keyboard") requestAnimationFrame(() => panelHeadingRef.current?.focus());
  }, [setCurrentAttemptId, setCurrentSelection]);

  const restoreFromUrl = useCallback(() => {
    if (!rooms.isSuccess) return;
    const current = new URL(window.location.href);
    const restored = readMapSelection(current, visibleRooms);
    setSelection((previous) => {
      const next = mapSelectionEquals(previous, restored) ? previous : restored;
      selectionRef.current = next;
      return next;
    });
    setCurrentAttemptId(null);
    const canonical = urlForMapSelection(current, restored);
    if (`${current.pathname}${current.search}${current.hash}` !== canonical) {
      window.history.replaceState(null, "", canonical);
    }
  }, [rooms.isSuccess, setCurrentAttemptId, visibleRooms]);

  useEffect(() => {
    restoreFromUrl();
  }, [restoreFromUrl]);

  useEffect(() => {
    const handlePopState = () => restoreFromUrl();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [restoreFromUrl]);

  const selectRoom = useCallback((roomId: string, source: SelectionSource) => {
    applySelection({ kind: "room", roomId }, source);
  }, [applySelection]);
  const selectDraft = useCallback((coordinates: DraftCoordinates, source: SelectionSource) => {
    applySelection({ kind: "draft", coordinates }, source);
  }, [applySelection]);
  const selectAttempt = useCallback((clientRequestId: string, source: SelectionSource) => {
    const attempt = createAttempts.data.find((candidate) => candidate.clientRequestId === clientRequestId);
    if (!attempt) return;
    setCurrentSelection({ kind: "draft", coordinates: attempt.coordinates });
    setCurrentAttemptId(clientRequestId);
    const target = urlForMapSelection(new URL(window.location.href), { kind: "draft", coordinates: attempt.coordinates });
    window.history.pushState(null, "", target);
    if (source === "keyboard") requestAnimationFrame(() => panelHeadingRef.current?.focus());
  }, [createAttempts.data, setCurrentAttemptId, setCurrentSelection]);

  const handleRealtimeResolution = useCallback(({ event, attempt }: RoomRealtimeResolution) => {
    if (!attempt) return;
    const currentSelection = selectionRef.current;
    if (
      selectedAttemptIdRef.current !== event.clientRequestId
      || currentSelection.kind !== "draft"
      || !sameCoordinates(currentSelection.coordinates, attempt.coordinates)
    ) return;
    setCurrentAttemptId(null);
    applySelection({ kind: "room", roomId: event.room.id }, "restore");
  }, [applySelection, setCurrentAttemptId]);
  useRoomRealtimeResolution(handleRealtimeResolution);
  const startCreateAttempt = useCallback((mode: "create" | "retry" | "restart") => {
    if (auth.status !== "signed-in" || selection.kind !== "draft") return;

    const retryingAttempt = mode === "retry" && selectedAttemptMatchesDraft?.error?.retryable
      ? selectedAttemptMatchesDraft
      : null;
    const clientRequestId = retryingAttempt?.clientRequestId ?? generateRoomClientRequestId();
    const coordinates = selection.coordinates;
    const nextAttempt: RoomCreateAttempt = {
      clientRequestId,
      coordinates,
      status: "pending"
    };

    queryClient.setQueryData(roomCreateAttemptsQueryKey, (existing: RoomCreateAttempt[] | undefined) => {
      const attempts = existing ?? [];
      return attempts.some((attempt) => attempt.clientRequestId === clientRequestId)
        ? attempts.map((attempt) => attempt.clientRequestId === clientRequestId ? nextAttempt : attempt)
        : [...attempts, nextAttempt];
    });
    setCurrentAttemptId(clientRequestId);
    roomCreate.mutate({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      clientRequestId
    });
  }, [auth.status, queryClient, roomCreate, selectedAttemptMatchesDraft, selection, setCurrentAttemptId]);

  return <div className="map-workspace">
    <div className="map-frame" aria-busy={rooms.isPending}>
      <LeafletCanvas
        rooms={visibleRooms}
        attempts={createAttempts.data}
        selection={selection}
        selectedAttemptId={selectedAttemptId}
        onRoomSelect={selectRoom}
        onAttemptSelect={selectAttempt}
        onDraftSelect={selectDraft}
      />
      <div className="map-state" role="group" aria-label="Room loading status">
        {rooms.isPending && <p role="status"><span className="status-mark" aria-hidden="true" /> Loading public rooms…</p>}
        {rooms.isError && <div role="alert">
          <strong>Rooms could not be loaded.</strong>
          <span> Check your connection and try again.</span>
          <Button type="button" variant="secondary" aria-label="Retry loading public rooms" onClick={() => void rooms.refetch()}>Retry</Button>
        </div>}
        {rooms.isSuccess && rooms.data.length === 0 && <p role="status">No public rooms yet.</p>}
        {rooms.isSuccess && rooms.data.length > 0 && <p role="status">
          {rooms.data.length} {rooms.data.length === 1 ? "public room is" : "public rooms are"} visible on the map.
        </p>}
      </div>
    </div>
    <aside className="room-rail" aria-label="Room details and account controls">
      <section className="room-panel" aria-labelledby="room-panel-title">
        <p className="eyebrow">Map selection</p>
        <h2 id="room-panel-title" ref={panelHeadingRef} tabIndex={-1}>
          {selectedRoom?.title ?? (selectedAttemptMatchesDraft
            ? (selectedAttemptMatchesDraft.status === "pending" ? "Saving room location" : "Room creation needs attention")
            : (selection.kind === "draft" ? "Unsaved room location" : "Choose a room"))}
        </h2>
        {selectedRoom && <div className="room-panel__state">
          <p className="state-label state-label--selected"><span aria-hidden="true">✓</span> Selected persisted room</p>
          <MessageHistoryPanel roomId={selectedRoom.id} />
          <MessageComposer roomId={selectedRoom.id} auth={auth} onSignIn={signInWithGoogle} />
        </div>}
        {selection.kind === "draft" && <div className="room-panel__state">
          {selectedAttemptMatchesDraft?.status === "pending"
            ? <p className="state-label state-label--saving"><span aria-hidden="true">…</span> Saving pending room</p>
            : <p className="state-label state-label--draft"><span aria-hidden="true">+</span> Local unsaved draft</p>}
          <p className="coordinates">{selection.coordinates.latitude.toString()}, {selection.coordinates.longitude.toString()}</p>
          {selectedAttemptMatchesDraft?.status === "pending" && <>
            <p role="status">Creating this room now. Messages stay disabled until the server confirms it.</p>
            <Button type="button" disabled>Creating room…</Button>
          </>}
          {selectedAttemptMatchesDraft?.status === "failed" && <>
            <p className="create-error" role="alert">{selectedAttemptMatchesDraft.error?.message ?? "Room creation failed. Please try again later."}</p>
            <p>This failed attempt kept its location and request ID for a targeted retry. No confirmed room was added.</p>
            {auth.status !== "signed-in" && <p>Sign in with Google again to retry this saved attempt.</p>}
            {auth.status === "signed-in" && selectedAttemptMatchesDraft.error?.retryable && <Button
              type="button"
              onClick={() => startCreateAttempt("retry")}
            >
              Retry creating room
            </Button>}
            {auth.status === "signed-in" && !selectedAttemptMatchesDraft.error?.retryable && <Button
              type="button"
              variant="secondary"
              onClick={() => startCreateAttempt("restart")}
            >
              Start a new attempt here
            </Button>}
          </>}
          {!selectedAttemptMatchesDraft && auth.status === "signed-out" && <p>Sign in with Google to keep this location and then choose whether to create the room.</p>}
          {auth.status === "loading" && <p role="status">Checking whether this draft can be resumed…</p>}
          {auth.status === "error" && <p>Your draft is safe in this URL while the session check is unavailable.</p>}
          {!selectedAttemptMatchesDraft && auth.status === "signed-in" && <>
            <p>Your draft was restored. Creating the room still requires an explicit action.</p>
            <Button type="button" onClick={() => startCreateAttempt("create")}>Create room here</Button>
          </>}
        </div>}
        {selection.kind === "none" && <div className="room-panel__state">
          <p>Select a persisted pin, or click empty map space to choose a new room location.</p>
          <p className="empty-state">No room is selected.</p>
        </div>}
      </section>
      <AuthPanel />
    </aside>
  </div>;
}
