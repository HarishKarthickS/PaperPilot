import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk.js";
import { formatRetrievedContext, type RetrievedChunk } from "./retrieve.service.js";

describe("chunkText", () => {
  it("returns empty for blank input", () => {
    expect(chunkText("   ")).toEqual([]);
  });

  it("splits long text into overlapping chunks", () => {
    const text = "a".repeat(1000);
    const chunks = chunkText(text, 400, 50);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.index).toBe(0);
    expect(chunks[0]?.content.length).toBe(400);
    expect(chunks.at(-1)?.content.length).toBeGreaterThan(0);
  });

  it("keeps short text as a single chunk", () => {
    expect(chunkText("hello world", 800, 120)).toEqual([{ index: 0, content: "hello world" }]);
  });
});

describe("formatRetrievedContext", () => {
  it("joins chunks with labels and respects max length", () => {
    const chunks: RetrievedChunk[] = [
      { chunkIndex: 0, content: "alpha", distance: 0.1 },
      { chunkIndex: 1, content: "beta", distance: 0.2 },
    ];
    const formatted = formatRetrievedContext(chunks);
    expect(formatted).toContain("[chunk 0]");
    expect(formatted).toContain("alpha");
    expect(formatted).toContain("[chunk 1]");
  });

  it("stops before exceeding maxChars", () => {
    const chunks: RetrievedChunk[] = [
      { chunkIndex: 0, content: "short", distance: 0.1 },
      { chunkIndex: 1, content: "y".repeat(80), distance: 0.2 },
    ];
    const formatted = formatRetrievedContext(chunks, 30);
    expect(formatted).toContain("[chunk 0]");
    expect(formatted).not.toContain("[chunk 1]");
  });
});
