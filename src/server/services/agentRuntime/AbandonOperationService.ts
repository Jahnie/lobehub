import type { ISnapshotStore } from '@lobechat/agent-tracing';
import type { ChatMessageError } from '@lobechat/types';
import { AgentRuntimeErrorType } from '@lobechat/types';
import debug from 'debug';

import { MessageModel } from '@/database/models/message';
import type { LobeChatDatabase } from '@/database/type';
// Direct file import (not the barrel) to avoid pulling in RuntimeExecutors and
// its workspace-package transitive deps in the unit-test environment.
import { AgentRuntimeCoordinator } from '@/server/modules/AgentRuntime/AgentRuntimeCoordinator';

import { OperationTraceRecorder } from './OperationTraceRecorder';

const log = debug('lobe-server:abandon-operation');

interface AbandonOperationOptions {
  coordinator?: AgentRuntimeCoordinator;
  snapshotStore?: ISnapshotStore | null;
}

export interface FinalizeAbandonedResult {
  /** Whether the assistant message was successfully marked as errored. */
  assistantMessageUpdated: boolean;
  /**
   * Whether the snapshot was successfully persisted to its canonical S3 path.
   * False when no partial existed OR when persistence threw transiently — in
   * the latter case, `retryable` is also true and Redis state is preserved.
   */
  finalized: boolean;
  /** Whether agent state was found in Redis. */
  found: boolean;
  /**
   * True when snapshot persistence threw transiently (S3 save / removePartial
   * failed). The caller should retry — Redis state is preserved so the next
   * attempt has a chance to recover. Distinguishes transient failure from the
   * benign "no partial existed" case (where `retryable` stays false).
   */
  retryable: boolean;
}

/**
 * Reverse-trigger finalization for an operation whose Vercel function was
 * killed mid-flight. Invoked from a fresh function invocation (e.g. from the
 * agent-gateway DO inactivity watchdog) given just an `operationId`.
 *
 * Loads the agent state from Redis, marks it as errored, runs the same
 * `OperationTraceRecorder.finalize()` path the in-loop error handler would
 * have run, and updates the dangling assistant message in DB.
 *
 * Idempotent: calling twice is a no-op the second time because `finalize()`
 * removes the partial, so `loadAgentState` may return null or finalize will
 * skip due to missing partial.
 *
 * Failure-aware: `OperationTraceRecorder.finalize()` swallows its own errors
 * silently. We probe `loadPartial` after the call to detect whether the
 * partial actually got removed (success path) vs. is still there (save or
 * removePartial threw). On transient failure we set `retryable=true` and
 * **skip Redis cleanup** so the retry has working state to recover from.
 */
export class AbandonOperationService {
  private readonly coordinator: AgentRuntimeCoordinator;
  private readonly snapshotStore: ISnapshotStore | null;
  private readonly traceRecorder: OperationTraceRecorder;

  constructor(
    private readonly db: LobeChatDatabase,
    options?: AbandonOperationOptions,
  ) {
    this.coordinator = options?.coordinator ?? new AgentRuntimeCoordinator();
    this.snapshotStore =
      options?.snapshotStore !== undefined ? options.snapshotStore : createDefaultSnapshotStore();
    this.traceRecorder = new OperationTraceRecorder(this.snapshotStore);
  }

  async finalizeAbandoned(operationId: string, reason: string): Promise<FinalizeAbandonedResult> {
    const result: FinalizeAbandonedResult = {
      assistantMessageUpdated: false,
      finalized: false,
      found: false,
      retryable: false,
    };

    const state = await this.coordinator.loadAgentState(operationId);
    if (!state) {
      log('[%s] no agent state in coordinator — already cleaned up', operationId);
      return result;
    }
    result.found = true;

    const metadata = (state.metadata ?? {}) as { assistantMessageId?: string; userId?: string };
    const message = `Operation abandoned: ${reason}`;
    const error: ChatMessageError = {
      body: { message },
      message,
      type: AgentRuntimeErrorType.AgentRuntimeError,
    };

    // Synthesize a failed-step record at index = lastCompleted + 1 so consumers
    // see the operation ended at a step that never produced data.
    const partial = this.snapshotStore
      ? await this.snapshotStore.loadPartial(operationId).catch(() => null)
      : null;
    const lastStepIndex = partial?.steps?.length
      ? Math.max(...partial.steps.map((s) => s.stepIndex))
      : -1;
    const failedStep = { startedAt: Date.now(), stepIndex: lastStepIndex + 1 };

    // Mutate state for finalize — recorder reads cost / tokens / metadata off this.
    const finalState = { ...state, error, status: 'error' as const };

    if (this.snapshotStore && partial) {
      await this.traceRecorder.finalize(operationId, {
        completionReason: 'error',
        error: { message, type: String(error.type) },
        failedStep,
        state: finalState,
      });
      // OperationTraceRecorder.finalize() catches save/removePartial errors
      // silently and only logs. Probe the partial to detect actual outcome:
      // - gone (null) ⇒ save + removePartial both succeeded
      // - still present ⇒ save or removePartial threw
      // - probe throws ⇒ unknown; conservatively treat as still present so
      //   we preserve retry context rather than blow away Redis state.
      const stillPresent = await this.snapshotStore
        .loadPartial(operationId)
        .catch(() => true as const);
      if (stillPresent) {
        result.retryable = true;
        log(
          '[%s] snapshot persistence failed — partial still present, will not clean Redis',
          operationId,
        );
      } else {
        result.finalized = true;
      }
    }

    if (metadata.userId && metadata.assistantMessageId) {
      try {
        const messageModel = new MessageModel(this.db, metadata.userId);
        await messageModel.update(metadata.assistantMessageId, { error });
        result.assistantMessageUpdated = true;
      } catch (e) {
        log('[%s] assistant message update failed (non-fatal): %O', operationId, e);
      }
    }

    // Only clean Redis state when we're certain the snapshot is safely
    // persisted (or there was nothing to persist). On transient finalize
    // failure, leaving the operation state in Redis is what makes a retry
    // possible — deleting it would orphan the `_partial/` snapshot forever.
    if (!result.retryable) {
      try {
        await this.coordinator.deleteAgentOperation(operationId);
      } catch (e) {
        log('[%s] coordinator cleanup failed (non-fatal): %O', operationId, e);
      }
    }

    log('[%s] abandoned op finalized (reason=%s): %O', operationId, reason, result);
    return result;
  }
}

function createDefaultSnapshotStore(): ISnapshotStore | null {
  if (process.env.ENABLE_AGENT_S3_TRACING === '1') {
    try {
      const { S3SnapshotStore } = require('@/server/modules/AgentTracing');
      return new S3SnapshotStore();
    } catch {
      /* S3SnapshotStore not available */
    }
  }

  if (process.env.NODE_ENV === 'development') {
    try {
      const { FileSnapshotStore } = require('@lobechat/agent-tracing');
      return new FileSnapshotStore();
    } catch {
      /* agent-tracing not available */
    }
  }

  return null;
}
