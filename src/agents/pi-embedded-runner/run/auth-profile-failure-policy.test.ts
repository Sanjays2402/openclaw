import { describe, expect, it } from "vitest";
import { resolveAuthProfileFailureReason } from "./auth-profile-failure-policy.js";

describe("resolveAuthProfileFailureReason", () => {
  it("records shared non-timeout provider failures", () => {
    expect(
      resolveAuthProfileFailureReason({
        failoverReason: "billing",
        policy: "shared",
      }),
    ).toBe("billing");
    expect(
      resolveAuthProfileFailureReason({
        failoverReason: "rate_limit",
        policy: "shared",
      }),
    ).toBe("rate_limit");
  });

  it("does not record local helper failures in shared auth state", () => {
    expect(
      resolveAuthProfileFailureReason({
        failoverReason: "billing",
        policy: "local",
      }),
    ).toBeNull();
    expect(
      resolveAuthProfileFailureReason({
        failoverReason: "auth",
        policy: "local",
      }),
    ).toBeNull();
  });

  it("does not persist transport timeouts as auth-profile health", () => {
    expect(
      resolveAuthProfileFailureReason({
        failoverReason: "timeout",
      }),
    ).toBeNull();
  });

  it("does not persist request-shape (format) rejections as auth-profile health (#76829, #77228)", () => {
    // A format rejection (e.g. malformed transcript, empty messages array,
    // schema mismatch, or the github-copilot prefill-strict 400
    // "conversation must end with a user message" reported in #77228) is
    // a per-session transcript-shape problem. Cascading it to a profile
    // cooldown would block every other healthy session sharing the same
    // auth profile and can take down the whole provider for the backoff
    // window — see #76829.
    expect(
      resolveAuthProfileFailureReason({
        failoverReason: "format",
      }),
    ).toBeNull();
    expect(
      resolveAuthProfileFailureReason({
        failoverReason: "format",
        policy: "shared",
      }),
    ).toBeNull();
  });

  it("still records non-format provider failures so genuine profile cooldown is preserved", () => {
    // Sanity: the format carve-out must not affect auth/billing/rate-limit reporting.
    for (const reason of [
      "auth",
      "auth_permanent",
      "billing",
      "rate_limit",
      "overloaded",
      "model_not_found",
    ] as const) {
      expect(
        resolveAuthProfileFailureReason({
          failoverReason: reason,
          policy: "shared",
        }),
      ).toBe(reason);
    }
  });
});
