import { afterEach, describe, expect, it, vi } from "vitest";
import { createReplyDispatcherWithTyping } from "./reply/reply-dispatcher.js";

type InternalReplyOptions = {
  internalTypingController?: {
    startTypingLoop: () => Promise<void>;
  };
  internalStartTypingOnAccept?: boolean;
};

describe("reply dispatcher early typing", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates an eager typing controller only for opt-in paths", () => {
    const optedIn = createReplyDispatcherWithTyping({
      deliver: async () => undefined,
      onReplyStart: async () => undefined,
      startTypingOnAccept: true,
      typingIntervalSeconds: 1,
    } as never);
    const defaultPath = createReplyDispatcherWithTyping({
      deliver: async () => undefined,
      onReplyStart: async () => undefined,
    });

    expect((optedIn.replyOptions as InternalReplyOptions).internalTypingController).toBeDefined();
    expect((optedIn.replyOptions as InternalReplyOptions).internalStartTypingOnAccept).toBe(true);
    expect(
      (defaultPath.replyOptions as InternalReplyOptions).internalTypingController,
    ).toBeUndefined();
    expect((defaultPath.replyOptions as InternalReplyOptions).internalStartTypingOnAccept).toBe(
      false,
    );
  });

  it("uses the configured typing interval for eager early-typing controllers", async () => {
    vi.useFakeTimers();
    const onReplyStart = vi.fn(async () => undefined);
    const { replyOptions, markRunComplete, markDispatchIdle } = createReplyDispatcherWithTyping({
      deliver: async () => undefined,
      onReplyStart,
      startTypingOnAccept: true,
      typingIntervalSeconds: 1,
    } as never);

    const typing = (replyOptions as InternalReplyOptions).internalTypingController;
    expect(typing).toBeDefined();

    await typing?.startTypingLoop();
    expect(onReplyStart).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(onReplyStart).toHaveBeenCalledTimes(2);

    markRunComplete();
    markDispatchIdle();
  });
});
