import { describe, expect, it } from "vitest";
import { buildForkTaskPrompt } from "../src/runner/prompt.js";

describe("buildForkTaskPrompt", () => {
  it("preserves the delegated task", () => {
    expect(buildForkTaskPrompt("find the typecheck command", "fast")).toContain("find the typecheck command");
  });

  it("defaults to balanced effort", () => {
    const prompt = buildForkTaskPrompt("review this");
    expect(prompt).toContain("Effort expectation: balanced");
    expect(prompt).toContain("normal triage, explanation, verification, review, or simplification");
  });

  it("includes shared scope, evidence, uncertainty, and no-edit rules for every effort", () => {
    for (const effort of ["fast", "balanced", "deep"] as const) {
      const prompt = buildForkTaskPrompt("task", effort);
      expect(prompt).toContain("Stay within the task scope");
      expect(prompt).toContain("Do not modify files, run formatters, or commit unless the task explicitly asks for implementation");
      expect(prompt).toContain("Prefer concrete evidence");
      expect(prompt).toContain("If evidence is missing, uncertain, or you could not inspect something, say so");
      expect(prompt).toContain("report findings for the parent to decide");
      expect(prompt).toContain("Use concise headings when helpful");
      expect(prompt).toContain("reusable lessons or future checks");
    }
  });

  it("sets fast expectations", () => {
    const prompt = buildForkTaskPrompt("task", "fast");
    expect(prompt).toContain("Effort expectation: fast");
    expect(prompt).toContain("Explore and find the concrete answer");
    expect(prompt).toContain("answer, evidence/source, and only important caveats");
  });

  it("sets balanced expectations", () => {
    const prompt = buildForkTaskPrompt("task", "balanced");
    expect(prompt).toContain("Effort expectation: balanced");
    expect(prompt).toContain("Investigate and think through the bounded task");
    expect(prompt).toContain("verdict with key evidence, reasoning, uncertainty");
  });

  it("sets deep expectations", () => {
    const prompt = buildForkTaskPrompt("task", "deep");
    expect(prompt).toContain("Effort expectation: deep");
    expect(prompt).toContain("Challenge the area thoroughly");
    expect(prompt).toContain("missed problems, failure modes, counterarguments, edge cases, and confidence limits");
  });

  it("includes only one effort block", () => {
    const prompt = buildForkTaskPrompt("task", "fast");
    expect(prompt).toContain("Effort expectation: fast");
    expect(prompt).not.toContain("Effort expectation: balanced");
    expect(prompt).not.toContain("Effort expectation: deep");
  });
});
