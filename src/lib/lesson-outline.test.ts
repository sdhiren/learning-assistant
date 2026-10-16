import { describe, expect, it } from "vitest";

import { extractOutline, slugify } from "./lesson-outline";

describe("slugify", () => {
  it("makes lowercase, hyphenated ids without punctuation", () => {
    expect(slugify("How it works, step by step")).toBe("how-it-works-step-by-step");
    expect(slugify("  Common mistakes & misconceptions ")).toBe("common-mistakes-misconceptions");
  });
});

describe("extractOutline", () => {
  it("lists level-2 headings in order with plain-text titles", () => {
    const markdown = "# Title\n\n## The big idea\ntext\n### Detail\n## Using `async` *well*\n";
    expect(extractOutline(markdown)).toEqual([
      { id: "the-big-idea", title: "The big idea" },
      { id: "using-async-well", title: "Using async well" },
    ]);
  });

  it("ignores headings inside fenced code", () => {
    const markdown = "## Examples\n```md\n## Not a heading\n```\n## After";
    expect(extractOutline(markdown).map((heading) => heading.title)).toEqual(["Examples", "After"]);
  });
});
