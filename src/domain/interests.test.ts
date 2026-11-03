import { describe, expect, it } from "vitest";

import { INTEREST_CATALOG, INTEREST_TOPICS, suggestFromCatalog } from "./interests";

describe("suggestFromCatalog", () => {
  it("has seed topics for every catalog interest", () => {
    for (const interest of INTEREST_CATALOG) {
      expect(INTEREST_TOPICS[interest].length).toBeGreaterThan(0);
    }
  });

  it("takes one topic from each interest in turn", () => {
    const names = suggestFromCatalog(["Go", "Databases"], new Set(), 4).map((s) => s.name);

    expect(names).toEqual([
      "Go concurrency",
      "PostgreSQL indexing",
      "Go interfaces",
      "Transactions and isolation levels",
    ]);
  });

  it("matches catalog interests ignoring case and gives a reason", () => {
    expect(suggestFromCatalog(["  rust "], new Set(), 1)).toEqual([
      { name: "Rust ownership and borrowing", reason: "Matches your interest in rust." },
    ]);
  });

  it("suggests a free-text interest as a topic of its own", () => {
    expect(suggestFromCatalog(["GraphQL"], new Set(), 5).map((s) => s.name)).toEqual(["GraphQL"]);
  });

  it("skips excluded topics and duplicates", () => {
    const names = suggestFromCatalog(
      ["Go", "go", "Go concurrency"],
      new Set(["go interfaces"]),
      10,
    ).map((s) => s.name);

    expect(names).toEqual(["Go concurrency", "Go memory model"]);
  });

  it("returns nothing without interests", () => {
    expect(suggestFromCatalog([], new Set(), 5)).toEqual([]);
  });
});
