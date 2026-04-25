import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { resolveStateDir } from "../config/paths.js";
import { registerFatalErrorHook } from "../infra/fatal-error-hooks.js";
import {
  getDiagnosticStabilitySnapshot,
  MAX_DIAGNOSTIC_STABILITY_LIMIT,
  type DiagnosticStabilitySnapshot,
} from "./diagnostic-stability.js";

export const DIAGNOSTIC_STABILITY_BUNDLE_VERSION = 1;
export const DEFAULT_DIAGNOSTIC_STABILITY_BUNDLE_LIMIT = MAX_DIAGNOSTIC_STABILITY_LIMIT;
export const DEFAULT_DIAGNOSTIC_STABILITY_BUNDLE_RETENTION = 20;
export const MAX_DIAGNOSTIC_STABILITY_BUNDLE_BYTES = 5 * 1024 * 1024;

const SAFE_REASON_CODE = /^[A-Za-z0-9_.:-]{1,120}$/u;
const BUNDLE_PREFIX = "openclaw-stability-";
const BUNDLE_SUFFIX = ".json";
const REDACTED_HOSTNAME = "<redacted-hostname>";
const MAX_ERROR_MESSAGE_LENGTH = 2048;

export type DiagnosticStabilityBundle = {
  version: typeof DIAGNOSTIC_STABILITY_BUNDLE_VERSION;
  generatedAt: string;
  reason: string;
  process: {
    pid: number;
    platform: NodeJS.Platform;
    arch: string;
    node: string;
    uptimeMs: number;
  };
  host: {
    hostname: string;
  };
  error?: {
    name?: string;
    message?: string;
    code?: string;
    stack?: string;
  };
  snapshot: DiagnosticStabilitySnapshot;
};

export type WriteDiagnosticStabilityBundleResult =
  | { status: "written"; path: string; bundle: DiagnosticStabilityBundle }
  | { status: "skipped"; reason: "empty" }
  | { status: "failed"; error: unknown };

export type WriteDiagnosticStabilityBundleOptions = {
  reason: string;
  error?: unknown;
  includeEmpty?: boolean;
  limit?: number;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  stateDir?: string;
  retention?: number;
};

export type DiagnosticStabilityBundleLocationOptions = {
  env?: NodeJS.ProcessEnv;
  stateDir?: string;
};

export type DiagnosticStabilityBundleFile = {
  path: string;
  mtimeMs: number;
};

export type ReadDiagnosticStabilityBundleResult =
  | { status: "found"; path: string; mtimeMs: number; bundle: DiagnosticStabilityBundle }
  | { status: "missing"; dir: string }
  | { status: "failed"; path?: string; error: unknown };

export type DiagnosticStabilityBundleFailureWriteOutcome =
  | { status: "written"; message: string; path: string }
  | { status: "failed"; message: string; error: unknown }
  | { status: "skipped"; reason: "empty" };

export type WriteDiagnosticStabilityBundleForFailureOptions = Omit<
  WriteDiagnosticStabilityBundleOptions,
  "error" | "includeEmpty" | "reason"
>;

let fatalHookUnsubscribe: (() => void) | null = null;

function normalizeReason(reason: string): string {
  return SAFE_REASON_CODE.test(reason) ? reason : "unknown";
}

function formatBundleTimestamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

function readErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && SAFE_REASON_CODE.test(code)) {
    return code;
  }
  if (typeof code === "number" && Number.isFinite(code)) {
    return String(code);
  }
  return undefined;
}

function readErrorName(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("name" in error)) {
    return undefined;
  }
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" && SAFE_REASON_CODE.test(name) ? name : undefined;
}

function readErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return undefined;
  }
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string" || message.length === 0) {
    return undefined;
  }
  return message.length > MAX_ERROR_MESSAGE_LENGTH
    ? message.slice(0, MAX_ERROR_MESSAGE_LENGTH)
    : message;
}

function readErrorStack(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("stack" in error)) {
    return undefined;
  }
  const stack = (error as { stack?: unknown }).stack;
  if (typeof stack !== "string" || stack.length === 0) {
    return undefined;
  }
  return stack.length > MAX_ERROR_MESSAGE_LENGTH
    ? stack.slice(0, MAX_ERROR_MESSAGE_LENGTH)
    : stack;
}

function readSafeErrorMetadata(error: unknown): DiagnosticStabilityBundle["error"] | undefined {
  const name = readErrorName(error);
  const code = readErrorCode(error);
  const message = readErrorMessage(error);
  const stack = readErrorStack(error);
  if (!name && !code && !message && !stack) {
    return undefined;
  }
  return {
    ...(name ? { name } : {}),
    ...(message ? { message } : {}),
    ...(code ? { code } : {}),
    ...(stack ? { stack } : {}),
  };
}
