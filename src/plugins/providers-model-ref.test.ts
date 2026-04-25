import { describe, expect, it } from "vitest";
import { __testing } from "./providers.js";

const { splitExplicitModelRef, stripModelProfileSuffix } = __testing;

describe("stripModelProfileSuffix", () => {
  it("returns the input when no auth profile suffix is present", () => {
    expect(stripModelProfileSuffix("gpt-5")).toBe("gpt-5");
    expect(stripModelProfileSuffix(" gpt-5 ")).toBe("gpt-5");
  });

  it("strips trailing @profile suffix", () => {
    expect(stripModelProfileSuffix("gpt-5@work")).toBe("gpt-5");
  });

  it("preserves LM Studio @q* quant suffixes", () => {
    expect(stripModelProfileSuffix("gemma-4-31b-it@q8_0")).toBe("gemma-4-31b-it@q8_0");
  });

  it("preserves LM Studio @iq* imatrix-quant suffixes (regression for #71474)", () => {
    expect(stripModelProfileSuffix("qwen3.6-27b@iq3_xxs")).toBe("qwen3.6-27b@iq3_xxs");
    expect(stripModelProfileSuffix("qwen3.6-27b@iq4_xs")).toBe("qwen3.6-27b@iq4_xs");
  });

  it("preserves @<n>bit quant suffixes", () => {
    expect(stripModelProfileSuffix("foo@4bit")).toBe("foo@4bit");
  });

  it("strips a profile that follows a protected quant suffix", () => {
    expect(stripModelProfileSuffix("qwen3.6-27b@iq3_xxs@work")).toBe("qwen3.6-27b@iq3_xxs");
    expect(stripModelProfileSuffix("gemma-4-31b-it@q8_0@work")).toBe("gemma-4-31b-it@q8_0");
  });
});

describe("splitExplicitModelRef", () => {
  it("returns null for empty input", () => {
    expect(splitExplicitModelRef("")).toBeNull();
    expect(splitExplicitModelRef("   ")).toBeNull();
  });

  it("parses a bare model id", () => {
    expect(splitExplicitModelRef("gpt-5")).toEqual({ modelId: "gpt-5" });
  });

  it("parses provider/model", () => {
    expect(splitExplicitModelRef("openai/gpt-5")).toEqual({
      provider: "openai",
      modelId: "gpt-5",
    });
  });

  it("strips an auth profile suffix from the model portion", () => {
    expect(splitExplicitModelRef("openai/gpt-5@work")).toEqual({
      provider: "openai",
      modelId: "gpt-5",
    });
  });

  it("preserves LM Studio @iq* quant in the model id (regression for #71474)", () => {
    expect(splitExplicitModelRef("lmstudio/qwen3.6-27b@iq3_xxs")).toEqual({
      provider: "lmstudio",
      modelId: "qwen3.6-27b@iq3_xxs",
    });
  });

  it("preserves @q* quant and strips a trailing profile after it", () => {
    expect(splitExplicitModelRef("lmstudio-mb-pro/gemma-4-31b-it@q8_0@work")).toEqual({
      provider: "lmstudio-mb-pro",
      modelId: "gemma-4-31b-it@q8_0",
    });
  });
});
