import type { PublicRoom } from "@map-chat/contracts";
import {
  encodeDraftCoordinates,
  mapSelectionEquals,
  parseDraftCoordinates,
  readMapSelection,
  urlForMapSelection
} from "./map-selection";

const rooms = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Cluj makers",
    latitude: 46.77,
    longitude: 23.59,
    createdAt: "2026-02-01T00:00:00.000Z"
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Quiet library",
    latitude: 46.76,
    longitude: 23.58,
    createdAt: "2026-02-02T00:00:00.000Z"
  }
] satisfies PublicRoom[];

const firstRoom = rooms[0] as PublicRoom;
const secondRoom = rooms[1] as PublicRoom;

describe("map selection URL state", () => {
  it("parses and encodes bounded draft coordinates without locale formatting or negative zero", () => {
    expect(parseDraftCoordinates("-0,-0")).toEqual({ latitude: 0, longitude: 0 });
    expect(parseDraftCoordinates("1e-7,2.5e1")).toEqual({ latitude: 1e-7, longitude: 25 });
    expect(encodeDraftCoordinates({ latitude: -0, longitude: 23.5900001 })).toBe("0,23.5900001");
    expect(parseDraftCoordinates("91,23")).toBeNull();
    expect(parseDraftCoordinates("46,181")).toBeNull();
    expect(parseDraftCoordinates("46,Infinity")).toBeNull();
    expect(parseDraftCoordinates("46")).toBeNull();
    expect(parseDraftCoordinates("46,23,extra")).toBeNull();
  });

  it("restores only known rooms or valid drafts and rejects ambiguous or hostile state", () => {
    expect(readMapSelection(new URL("https://example.test/?room=11111111-1111-4111-8111-111111111111"), rooms)).toEqual({
      kind: "room",
      roomId: "11111111-1111-4111-8111-111111111111"
    });
    expect(readMapSelection(new URL("https://example.test/?draft=46.7701,23.5901"), rooms)).toEqual({
      kind: "draft",
      coordinates: { latitude: 46.7701, longitude: 23.5901 }
    });
    expect(readMapSelection(new URL("https://example.test/?room=33333333-3333-4333-8333-333333333333"), rooms)).toEqual({ kind: "none" });
    expect(readMapSelection(new URL("https://example.test/?room=11111111-1111-4111-8111-111111111111&draft=46,23"), rooms)).toEqual({ kind: "none" });
    expect(readMapSelection(new URL("https://example.test/?draft=javascript:alert(1),23"), rooms)).toEqual({ kind: "none" });
    expect(readMapSelection(new URL("https://example.test/?draft=https://evil.test/return"), rooms)).toEqual({ kind: "none" });
  });

  it("changes only the room and draft query keys while preserving safe unrelated URL state", () => {
    const url = new URL("https://example.test/map?filter=open&room=old&draft=46,23#panel");
    expect(urlForMapSelection(url, { kind: "room", roomId: "22222222-2222-4222-8222-222222222222" })).toBe(
      "/map?filter=open&room=22222222-2222-4222-8222-222222222222#panel"
    );
    expect(urlForMapSelection(url, { kind: "draft", coordinates: { latitude: 46.77, longitude: 23.59 } })).toBe(
      "/map?filter=open&draft=46.77%2C23.59#panel"
    );
    expect(urlForMapSelection(url, { kind: "none" })).toBe("/map?filter=open#panel");
  });

  it("compares mutually exclusive selection states", () => {
    expect(mapSelectionEquals({ kind: "none" }, { kind: "none" })).toBe(true);
    expect(mapSelectionEquals({ kind: "room", roomId: firstRoom.id }, { kind: "room", roomId: firstRoom.id })).toBe(true);
    expect(mapSelectionEquals({ kind: "room", roomId: firstRoom.id }, { kind: "room", roomId: secondRoom.id })).toBe(false);
    expect(mapSelectionEquals(
      { kind: "draft", coordinates: { latitude: 1, longitude: 2 } },
      { kind: "draft", coordinates: { latitude: 1, longitude: 2 } }
    )).toBe(true);
    expect(mapSelectionEquals({ kind: "draft", coordinates: { latitude: 1, longitude: 2 } }, { kind: "none" })).toBe(false);
  });
});
