import type { PublicRoom } from "@map-chat/contracts";

export type DraftCoordinates = Readonly<{ latitude: number; longitude: number }>;

export type MapSelection =
  | { kind: "none" }
  | { kind: "room"; roomId: string }
  | { kind: "draft"; coordinates: DraftCoordinates };

function boundedNumber(value: string, minimum: number, maximum: number) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return null;
  return Object.is(parsed, -0) ? 0 : parsed;
}

export function parseDraftCoordinates(value: string): DraftCoordinates | null {
  const parts = value.split(",");
  if (parts.length !== 2) return null;

  const latitude = boundedNumber(parts[0] ?? "", -90, 90);
  const longitude = boundedNumber(parts[1] ?? "", -180, 180);
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

export function encodeDraftCoordinates(coordinates: DraftCoordinates) {
  const latitude = Object.is(coordinates.latitude, -0) ? 0 : coordinates.latitude;
  const longitude = Object.is(coordinates.longitude, -0) ? 0 : coordinates.longitude;
  return `${latitude.toString()},${longitude.toString()}`;
}

export function readMapSelection(url: URL, rooms: PublicRoom[]): MapSelection {
  const roomValues = url.searchParams.getAll("room");
  const draftValues = url.searchParams.getAll("draft");
  if (roomValues.length + draftValues.length !== 1) return { kind: "none" };

  if (roomValues.length === 1) {
    const roomId = roomValues[0] ?? "";
    return rooms.some((room) => room.id === roomId) ? { kind: "room", roomId } : { kind: "none" };
  }

  const coordinates = parseDraftCoordinates(draftValues[0] ?? "");
  return coordinates ? { kind: "draft", coordinates } : { kind: "none" };
}

export function urlForMapSelection(current: URL, selection: MapSelection) {
  const next = new URL(current.href);
  next.searchParams.delete("room");
  next.searchParams.delete("draft");
  if (selection.kind === "room") next.searchParams.set("room", selection.roomId);
  if (selection.kind === "draft") next.searchParams.set("draft", encodeDraftCoordinates(selection.coordinates));
  return `${next.pathname}${next.search}${next.hash}`;
}

export function mapSelectionEquals(left: MapSelection, right: MapSelection) {
  if (left.kind !== right.kind) return false;
  if (left.kind === "none" || right.kind === "none") return true;
  if (left.kind === "room" && right.kind === "room") return left.roomId === right.roomId;
  if (left.kind === "draft" && right.kind === "draft") {
    return left.coordinates.latitude === right.coordinates.latitude
      && left.coordinates.longitude === right.coordinates.longitude;
  }
  return false;
}
