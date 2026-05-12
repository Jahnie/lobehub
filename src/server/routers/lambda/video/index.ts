import { randomBytes } from 'node:crypto';

import { BRANDING_PROVIDER } from '@lobechat/business-const';
import {
  buildMappedBusinessModelFields,
  resolveBusinessModelMapping,
} from '@lobechat/business-model-runtime';
import { ChatErrorType, RequestTrigger } from '@lobechat/types';
import { TRPCError } from '@trpc/server';
import debug from 'debug';
import { and, eq } from 'drizzle-orm';
import { isLobeHubModelAvailable } from 'model-bank/lobehub';
import { after } from 'next/server';
import { z } from 'zod';

import { getProviderContentPolicyErrorMessage } from '@/business/server/getProviderContentPolicyErrorMessage';
import { chargeAfterGenerate } from '@/business/server/video-generation/chargeAfterGenerate';
import { chargeBeforeGenerate } from '@/business/server/video-generation/chargeBeforeGenerate';
import { getVideoFreeQuota } from '@/business/server/video-generation/getVideoFreeQuota';
import { AsyncTaskModel } from '@/database/models/asyncTask';
import {
  asyncTasks,
  generationBatches,
  generations,
  type NewGeneration,
  type NewGenerationBatch,
} from '@/database/schemas';
import { getServerDB } from '@/database/server';
import { appEnv } from '@/envs/app';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { initModelRuntimeFromDB } from '@/server/modules/ModelRuntime';
import { FileService } from '@/server/services/file';
import { processBackgroundVideoPolling } from '@/server/services/generation/videoBackgroundPolling';
import { AsyncTaskStatus, AsyncTaskType } from '@/types/asyncTask';

import { createVideoTaskSubmitError } from './error';

const log = debug('lobe-video:lambda');

const videoProcedure = authedProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;

  return opts.next({
    ctx: {
      asyncTaskModel: new AsyncTaskModel(ctx.serverDB, ctx.userId),
      fileService: new FileService(ctx.serverDB, ctx.userId),
    },
  });
});

const createVideoInputSchema = z.object({
  generationTopicId: z.string(),
  model: z.string(),
  params: z
    .object({
      aspectRatio: z.string().optional(),
      cameraFixed: z.boolean().optional(),
      duration: z.number().optional(),
      endImageUrl: z.string().nullable().optional(),
      generateAudio: z.boolean().optional(),
      imageUrl: z.string().nullable().optional(),
      imageUrls: z.array(z.string()).optional(),
      prompt: z.string(),
      resolution: z.string().optional(),
      seed: z.number().nullable().optional(),
    })
    .passthrough(),
  provider: z.string(),
});
export type CreateVideoServicePayload = z.infer<typeof createVideoInputSchema>;

export const videoRouter = router({
  createVideo: videoProcedure.input(createVideoInputSchema).mutation(async ({ input, ctx }) => {
    const { userId, serverDB, asyncTaskModel, fileService } = ctx;
    const { generationTopicId, provider, model, params } = input;

    const { resolvedModelId } = await resolveBusinessModelMapping(provider, model);

    // Reject lobehub model ids that are no longer in the model bank so callers get a
    // clear error instead of an opaque downstream failure when the resolved channel
    // model is no longer in the model bank.
    if (provider === BRANDING_PROVIDER && !isLobeHubModelAvailable(resolvedModelId, 'video')) {
      throw new TRPCError({
        cause: { data: { modelType: 'video', requestedModel: model } },
        code: 'BAD_REQUEST',
        message: ChatErrorType.LobeHubModelDeprecated,
      });
    }

    log('Starting video creation process, input: %O', input);

    // ------------------------------------------------------------------
    // Step A: Normalize reference image URLs to S3 keys for DB storage
    //
    // Clients post whatever URL they see locally (often a /f/{fileId}
    // proxy URL). We convert these to stable storage keys before
    // persisting so the DB never holds short-lived presigned URLs or
    // host-specific proxy paths. Mirrors the image lambda router.
    // ------------------------------------------------------------------
    let configForDatabase: Record<string, unknown> = { ...params };

    // Process first-frame imageUrl
    if (typeof params.imageUrl === 'string' && params.imageUrl) {
      try {
        const key = await fileService.getKeyFromFullUrl(params.imageUrl);
        if (key) {
          log('Converted imageUrl to key: %s -> %s', params.imageUrl, key);
          configForDatabase = { ...configForDatabase, imageUrl: key };
        }
      } catch (error) {
        console.error('Error converting imageUrl to key: %O', error);
      }
    }

    // Process reference image array `imageUrls` (used by Seedance /
    // Dreamina `reference_image` role and other multi-image video
    // models). Previously this branch was missing entirely — the raw
    // client URL was forwarded to providers like Volcengine, which then
    // failed with `content[].image_url is not valid: timeout while
    // fetching resource`. See #14652.
    if (Array.isArray(params.imageUrls) && params.imageUrls.length > 0) {
      log('Converting imageUrls to S3 keys for database storage: %O', params.imageUrls);
      try {
        const keys = await Promise.all(
          params.imageUrls.map(async (url) => {
            const key = await fileService.getKeyFromFullUrl(url);
            if (!key) log('Failed to extract key from URL: %s', url);
            return key;
          }),
        );
        const normalized = keys.filter(
          (key): key is string => typeof key === 'string' && key.length > 0,
        );
        if (normalized.length === params.imageUrls.length) {
          configForDatabase = { ...configForDatabase, imageUrls: normalized };
        } else {
          // Partial failure — keep originals so we do not lose data,
          // but log so the owner can investigate upload issues.
          log(
            'imageUrls key conversion partial failure (%d/%d), keeping original URLs',
            normalized.length,
            params.imageUrls.length,
          );
        }
      } catch (error) {
        console.error('Error converting imageUrls to keys: %O', error);
      }
    }

    // Process last-frame endImageUrl
    if (typeof params.endImageUrl === 'string' && params.endImageUrl) {
      try {
        const key = await fileService.getKeyFromFullUrl(params.endImageUrl);
        if (key) {
          log('Converted endImageUrl to key: %s -> %s', params.endImageUrl, key);
          configForDatabase = { ...configForDatabase, endImageUrl: key };
        }
      } catch (error) {
        console.error('Error converting endImageUrl to key: %O', error);
      }
    }

    // ------------------------------------------------------------------
    // Step B: Resolve publicly-reachable URLs for the provider call
    //
    // Video providers (Volcengine / Seedance, Dreamina, etc.) fetch
    // reference images over the public internet. The client-supplied URL
    // may be a `/f/{fileId}` proxy URL that only works inside the user's
    // private network — sending that to the provider yields a 400
    // `timeout while fetching resource` error. We always rewrite to
    // `fileService.getFullFileUrl(key)` which returns:
    //   - `S3_PUBLIC_DOMAIN` + key when S3_SET_ACL + S3_PUBLIC_DOMAIN
    //     are configured
    //   - A cached presigned preview URL otherwise
    // Both variants are reachable by the external provider. This used
    // to run only in `NODE_ENV === 'development'`, which is why
    // self-hosted production users hit #14652.
    // ------------------------------------------------------------------
    const generationParams: Record<string, unknown> = { ...params };

    if (typeof params.imageUrl === 'string' && params.imageUrl) {
      const key = (configForDatabase.imageUrl as string | undefined) ?? params.imageUrl;
      try {
        const publicUrl = await fileService.getFullFileUrl(key);
        if (publicUrl) {
          log('Resolved imageUrl for provider: %s -> %s', params.imageUrl, publicUrl);
          generationParams.imageUrl = publicUrl;
        }
      } catch (error) {
        console.error('Failed to resolve public imageUrl: %O', error);
      }
    }

    if (Array.isArray(params.imageUrls) && params.imageUrls.length > 0) {
      const keys =
        Array.isArray(configForDatabase.imageUrls) && configForDatabase.imageUrls.length > 0
          ? (configForDatabase.imageUrls as string[])
          : params.imageUrls;
      try {
        const publicUrls = await Promise.all(keys.map((key) => fileService.getFullFileUrl(key)));
        const resolved = publicUrls.map((url, i) => url || params.imageUrls![i]);
        log('Resolved imageUrls for provider: %O', resolved);
        generationParams.imageUrls = resolved;
      } catch (error) {
        console.error('Failed to resolve public imageUrls: %O', error);
      }
    }

    if (typeof params.endImageUrl === 'string' && params.endImageUrl) {
      const key = (configForDatabase.endImageUrl as string | undefined) ?? params.endImageUrl;
      try {
        const publicUrl = await fileService.getFullFileUrl(key);
        if (publicUrl) {
          log('Resolved endImageUrl for provider: %s -> %s', params.endImageUrl, publicUrl);
          generationParams.endImageUrl = publicUrl;
        }
      } catch (error) {
        console.error('Failed to resolve public endImageUrl: %O', error);
      }
    }

    // Step 0: Pre-charge (atomic budget deduction to prevent concurrent abuse)
    const { errorBatch, prechargeResult } = await chargeBeforeGenerate({
      generationTopicId,
      model,
      params,
      provider,
      userId,
    });
    if (errorBatch) return errorBatch;

    // Generate a one-time token for webhook callback verification
    const webhookToken = randomBytes(32).toString('hex');

    // Step 1: Atomically create all database records in a transaction
    const {
      asyncTaskCreatedAt,
      asyncTaskId,
      batch: createdBatch,
      generation: createdGeneration,
    } = await serverDB.transaction(async (tx) => {
      log('Starting database transaction for video generation');

      // 1. Create generationBatch
      const newBatch: NewGenerationBatch = {
        config: configForDatabase,
        generationTopicId,
        model,
        prompt: params.prompt,
        provider,
        userId,
      };
      log('Creating generation batch: %O', newBatch);
      const [batch] = await tx.insert(generationBatches).values(newBatch).returning();
      log('Generation batch created: %s', batch.id);

      // 2. Create single generation (video is always 1)
      const newGeneration: NewGeneration = {
        generationBatchId: batch.id,
        seed: params.seed ?? null,
        userId,
      };
      const [generation] = await tx.insert(generations).values(newGeneration).returning();
      log('Generation created: %s', generation.id);

      // 3. Create asyncTask with precharge metadata
      const [asyncTask] = await tx
        .insert(asyncTasks)
        .values({
          metadata: {
            ...(prechargeResult ? { precharge: prechargeResult } : {}),
            webhookToken,
          },
          status: AsyncTaskStatus.Pending,
          type: AsyncTaskType.VideoGeneration,
          userId,
        })
        .returning();
      log('Async task created: %s', asyncTask.id);

      // 4. Link asyncTask to generation
      await tx
        .update(generations)
        .set({ asyncTaskId: asyncTask.id })
        .where(and(eq(generations.id, generation.id), eq(generations.userId, userId)));

      return {
        asyncTaskCreatedAt: asyncTask.createdAt,
        asyncTaskId: asyncTask.id,
        batch,
        generation,
      };
    });

    log('Database transaction completed. Calling model runtime for video generation.');

    // Step 2: Call model runtime to submit video generation task
    try {
      const modelRuntime = await initModelRuntimeFromDB(serverDB, userId, provider);

      const callbackBaseUrl = process.env.WEBHOOK_PROXY_URL || appEnv.APP_URL;
      const callbackUrl = `${callbackBaseUrl}/api/webhooks/video/${provider}?token=${webhookToken}`;
      log('Using callback URL: %s', callbackUrl);

      const response = await modelRuntime.createVideo(
        {
          callbackUrl,
          model: resolvedModelId,
          params: generationParams,
        },
        { metadata: { trigger: RequestTrigger.Video } },
      );

      log('Video task submitted successfully, inferenceId: %s', response?.inferenceId);

      // Determine async strategy based on response:
      // - useWebhook: provider registered a callback URL, wait for webhook
      // - otherwise: use background polling to check status
      const useWebhook = response && 'useWebhook' in response && response.useWebhook;

      if (useWebhook) {
        // Webhook-based provider (e.g. Volcengine): wait for callback
        log('Webhook-based provider detected, waiting for callback');

        await asyncTaskModel.update(asyncTaskId, {
          inferenceId: response?.inferenceId,
          status: AsyncTaskStatus.Processing,
        });
      } else if (response) {
        // Polling-based provider (e.g. OpenAI Sora): use background polling
        log(
          'Polling-based provider detected (inferenceId only), using after() for background polling',
        );

        await asyncTaskModel.update(asyncTaskId, {
          inferenceId: response.inferenceId,
          status: AsyncTaskStatus.Processing,
        });

        after(async () => {
          log('After() hook executing background video polling for task: %s', asyncTaskId);

          try {
            const db = await getServerDB();

            await processBackgroundVideoPolling(db, {
              asyncTaskCreatedAt,
              asyncTaskId,
              generationBatchId: createdBatch.id,
              generationId: createdGeneration.id,
              generationTopicId,
              inferenceId: response.inferenceId,
              model,
              prechargeResult,
              provider,
              userId,
            });

            log('Background video polling completed for task: %s', asyncTaskId);
          } catch (error) {
            console.error('[video] Background polling failed:', error);
          }
        });

        log('After() hook registered for background video polling: %s', asyncTaskId);
      }
    } catch (e) {
      console.error('Failed to submit video generation task:', e);

      const providerContentPolicyMessage = await getProviderContentPolicyErrorMessage({
        error: e,
        provider,
        trigger: RequestTrigger.Video,
        userId,
      });
      await asyncTaskModel.update(asyncTaskId, {
        error: createVideoTaskSubmitError(e, providerContentPolicyMessage),
        status: AsyncTaskStatus.Error,
      });

      if (prechargeResult) {
        try {
          await chargeAfterGenerate({
            isError: true,
            metadata: {
              asyncTaskId,
              generationBatchId: createdBatch.id,
              topicId: generationTopicId,
              ...buildMappedBusinessModelFields({
                provider,
                requestedModelId: resolvedModelId === model ? undefined : model,
                resolvedModelId,
              }),
            },
            model: resolvedModelId,
            prechargeResult,
            provider,
            userId,
          });
        } catch (chargeError) {
          console.error('[video] chargeAfterGenerate failed:', chargeError);
        }
      }
    }

    log('Video creation process completed: %O', {
      batchId: createdBatch.id,
      generationId: createdGeneration.id,
    });

    return {
      data: {
        batch: createdBatch,
        generations: [{ ...createdGeneration, asyncTaskId }],
      },
      success: true,
    };
  }),

  getVideoFreeQuota: authedProcedure
    .input(z.object({ model: z.string() }))
    .query(async ({ ctx, input }) => {
      return getVideoFreeQuota(ctx.userId, input.model);
    }),
});

export type VideoRouter = typeof videoRouter;
