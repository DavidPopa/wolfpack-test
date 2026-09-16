"use client";

import type { PublicRoom } from "@map-chat/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { Map as LeafletMap, Marker } from "leaflet";
import { MAP_CENTER, MAP_INITIAL_ZOOM, MAP_MAX_ZOOM, STADIA_WATERCOLOR } from "@/lib/map-provider";
import { fetchPublicRooms } from "@/lib/rooms";
import { Button } from "./ui/button";

type LeafletModule = typeof Leaflet;

function LeafletCanvas({ rooms }: { rooms: PublicRoom[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const [mapReady, setMapReady] = useState(false);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    let active = true;

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
      reflectMapState();

      leafletRef.current = leaflet;
      mapRef.current = map;
      setMapReady(true);
    }

    void initializeMap();

    return () => {
      active = false;
      markersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
    };
  }, []);

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

      const icon = leaflet.divIcon({
        className: "room-pin-wrapper",
        html: '<span class="room-pin"><span class="room-pin__center"></span></span>',
        iconAnchor: [18, 36],
        iconSize: [36, 36]
      });
      const marker = leaflet.marker([room.latitude, room.longitude], {
        alt: room.title,
        draggable: false,
        icon,
        title: room.title
      });
      marker.addTo(map);
      markersRef.current.set(room.id, marker);
    }
  }, [mapReady, rooms]);

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
  const rooms = useQuery({
    queryKey: ["rooms"],
    queryFn: fetchPublicRooms,
    retry: false
  });
  const visibleRooms = rooms.data ?? [];

  return <div className="map-frame" aria-busy={rooms.isPending}>
    <LeafletCanvas rooms={visibleRooms} />
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
  </div>;
}
