import type { MessageHistoryResponse, PublicMessage } from "@map-chat/contracts";
import { fetchMessageHistoryPage, flattenMessageHistory } from "./message-history";

function message(id: string, createdAt: string, body = id): PublicMessage {
  return {
    id,
    roomId: "11111111-1111-4111-8111-111111111111",
    body,
    createdAt,
    author: { name: "Avery Stone", image: null }
  };
}

function page(messages: PublicMessage[]): MessageHistoryResponse {
  return {
    messages,
    pageInfo: {
      startCursor: messages.length > 0 ? "start_cursor" : null,
      endCursor: messages.length > 0 ? "end_cursor" : null,
      hasOlder: false,
      hasNewer: false
    }
  };
}

describe("message history query helpers", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: jest.fn()
    });
  });

  it("requests public newest and older pages and strictly parses the response", async () => {
    const controller = new AbortController();
    const response = page([]);
    jest.mocked(fetch).mockResolvedValue({ ok: true, json: async () => response } as Response);

    await expect(fetchMessageHistoryPage({
      roomId: "11111111-1111-4111-8111-111111111111",
      before: "opaque_cursor",
      signal: controller.signal
    })).resolves.toEqual(response);
    expect(fetch).toHaveBeenCalledWith(
      "/api/rooms/11111111-1111-4111-8111-111111111111/messages?before=opaque_cursor",
      { headers: { accept: "application/json" }, signal: controller.signal }
    );

    jest.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...response, privateField: "not allowed" })
    } as Response);
    await expect(fetchMessageHistoryPage({
      roomId: "11111111-1111-4111-8111-111111111111"
    })).rejects.toThrow();
  });

  it("deduplicates by ID and orders equal timestamps by ID", () => {
    const timestamp = "2026-09-17T10:00:00.000Z";
    const firstId = "11111111-1111-4111-8111-111111111111";
    const secondId = "22222222-2222-4222-8222-222222222222";
    const thirdId = "33333333-3333-4333-8333-333333333333";

    expect(flattenMessageHistory([
      page([message(secondId, timestamp), message(thirdId, "2026-09-17T10:01:00.000Z")]),
      page([message(firstId, timestamp), message(secondId, timestamp, "canonical duplicate")])
    ])).toEqual([
      message(firstId, timestamp),
      message(secondId, timestamp, "canonical duplicate"),
      message(thirdId, "2026-09-17T10:01:00.000Z")
    ]);
  });
});
