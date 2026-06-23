import debug from 'debug';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';

import { tasks } from '@/database/schemas';
import { getServerDB } from '@/database/server';
import { TaskResultBridgeService } from '@/server/services/taskResultBridge';

const log = debug('lobe-server:workflows:task:result-bridge');

export interface ResultBridgePayload {
  errorMessage?: string;
  hookId?: string;
  hookType?: string;
  lastAssistantContent?: string;
  operationId: string;
  reason?: string;
  taskId: string;
  taskIdentifier: string;
  topicId?: string;
  userId: string;
}

export async function resultBridge(c: Context) {
  try {
    const body = (await c.req.json()) as ResultBridgePayload;
    const {
      errorMessage,
      lastAssistantContent,
      operationId,
      reason,
      taskId,
      taskIdentifier,
      topicId,
      userId,
    } = body;

    if (!taskId || !userId || !taskIdentifier || !operationId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    log('Received: taskId=%s topicId=%s reason=%s', taskId, topicId, reason);

    const db = await getServerDB();
    // System-level callback: derive workspace from the task row so the bridge
    // creates the callback message in the correct workspace.
    const [taskRow] = await db
      .select({ workspaceId: tasks.workspaceId })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.createdByUserId, userId)))
      .limit(1);
    const wsId = taskRow?.workspaceId ?? undefined;

    await new TaskResultBridgeService(db, userId, wsId).deliver({
      errorMessage,
      lastAssistantContent,
      operationId,
      reason: reason || 'done',
      taskId,
      taskIdentifier,
      topicId,
    });

    return c.json({ success: true });
  } catch (error) {
    // A bridge failure must never fail the task lifecycle — log and 200 so
    // QStash doesn't retry into a loop on a non-transient error.
    console.error('[task/result-bridge] Error:', error);
    return c.json({ success: false, error: error instanceof Error ? error.message : 'error' });
  }
}
