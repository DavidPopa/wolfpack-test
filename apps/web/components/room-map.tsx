"use client";

import type { PublicRoom } from "@map-chat/contracts";
import { useQuery } from "@tanstack/react-query";
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
import { fetchPublicRooms } from "@/lib/rooms";
import { AuthPanel } from "./auth-panel";
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

function bindRoomMarkerKeyboard(marker: Marker, roomId: string, onRoomSelect: (roomId: string, source: SelectionSource) => void) {
  const element = marker.getElement();
  if (!element || element.dataset.mapRoomKeyboardBound === "true") return;
  element.dataset.mapRoomKeyboardBound = "true";
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onRoomSelect(roomId, "keyboard");
  });
}

function LeafletCanvas({
  rooms,
  selection,
  onRoomSelect,
  onDraftSelect
}: {
  rooms: PublicRoom[];
  selection: MapSelection;
  onRoomSelect: (roomId: string, source: SelectionSource) => void;
  onDraftSelect: (coordinates: DraftCoordinates, source: SelectionSource) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
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
      bindRoomMarkerKeyboard(marker, room.id, onRoomSelect);
      markersRef.current.set(room.id, marker);
    }

    for (const room of rooms) {
      const marker = markersRef.current.get(room.id);
      marker?.setIcon(roomIcon(
        leaflet,
        selection.kind === "room" && selection.roomId === room.id
      ));
      if (marker) bindRoomMarkerKeyboard(marker, room.id, onRoomSelect);
    }
  }, [mapReady, onRoomSelect, rooms, selection]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!mapReady || !leaflet || !map) return;

    draftMarkerRef.current?.removeFrom(map);
    draftMarkerRef.current = null;
    if (selection.kind !== "draft") return;

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
  }, [mapReady, selection]);

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
  const rooms = useQuery({
    queryKey: ["rooms"],
    queryFn: fetchPublicRooms,
    retry: false
  });
  const visibleRooms = rooms.data ?? [];
  const [selection, setSelection] = useState<MapSelection>({ kind: "none" });
  const [createIntent, setCreateIntent] = useState(false);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const selectedRoom = useMemo(
    () => selection.kind === "room" ? visibleRooms.find((room) => room.id === selection.roomId) ?? null : null,
    [selection, visibleRooms]
  );

  const applySelection = useCallback((next: MapSelection, source: SelectionSource, historyMode: "push" | "none" = "push") => {
    setSelection(next);
    setCreateIntent(false);
    if (historyMode === "push") {
      const target = urlForMapSelection(new URL(window.location.href), next);
      window.history.pushState(null, "", target);
    }
    if (source === "keyboard") requestAnimationFrame(() => panelHeadingRef.current?.focus());
  }, []);

  const restoreFromUrl = useCallback(() => {
    if (!rooms.isSuccess) return;
    const current = new URL(window.location.href);
    const restored = readMapSelection(current, visibleRooms);
    setSelection((previous) => mapSelectionEquals(previous, restored) ? previous : restored);
    setCreateIntent(false);
    const canonical = urlForMapSelection(current, restored);
    if (`${current.pathname}${current.search}${current.hash}` !== canonical) {
      window.history.replaceState(null, "", canonical);
    }
  }, [rooms.isSuccess, visibleRooms]);

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

  return <div className="map-workspace">
    <div className="map-frame" aria-busy={rooms.isPending}>
      <LeafletCanvas
        rooms={visibleRooms}
        selection={selection}
        onRoomSelect={selectRoom}
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
          {selectedRoom?.title ?? (selection.kind === "draft" ? "Unsaved room location" : "Choose a room")}
        </h2>
        {selectedRoom && <div className="room-panel__state">
          <p className="state-label state-label--selected"><span aria-hidden="true">✓</span> Selected persisted room</p>
          <p>Messages for this room will appear here in a future step.</p>
          <p className="empty-state">No messages are available in this room shell yet.</p>
        </div>}
        {selection.kind === "draft" && <div className="room-panel__state">
          <p className="state-label state-label--draft"><span aria-hidden="true">+</span> Local unsaved draft</p>
          <p className="coordinates">{selection.coordinates.latitude.toString()}, {selection.coordinates.longitude.toString()}</p>
          {auth.status === "signed-out" && <p>Sign in with Google to keep this location and then choose whether to create the room.</p>}
          {auth.status === "loading" && <p role="status">Checking whether this draft can be resumed…</p>}
          {auth.status === "error" && <p>Your draft is safe in this URL while the session check is unavailable.</p>}
          {auth.status === "signed-in" && <>
            <p>Your draft was restored. Creating the room still requires an explicit action.</p>
            <Button type="button" onClick={() => setCreateIntent(true)}>Create room here</Button>
          </>}
          {createIntent && <p className="create-intent" role="status">Room creation is ready for the next step. Nothing has been submitted.</p>}
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
