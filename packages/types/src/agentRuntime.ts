export enum RequestTrigger {
  AgentExecution = 'agent_execution',
  AgentSignal = 'agent_signal',
  AiGeneration = 'ai_generation',
  Api = 'api',
  Bot = 'bot',
  Chat = 'chat',
  Cli = 'cli',
  ContextCompression = 'context_compression',
  Cron = 'cron',
  Eval = 'eval',
  FileEmbedding = 'file_embedding',
  FollowUp = 'follow_up',
  Image = 'image',
  Memory = 'memory',
  Notify = 'notify',
  Onboarding = 'onboarding',
  Openapi = 'openapi',
  ProviderCheck = 'provider_check',
  SemanticSearch = 'semantic_search',
  StructuredOutput = 'structured_output',
  TaskBrief = 'task_brief',
  TaskBriefJudge = 'task_brief_judge',
  TaskHandoff = 'task_handoff',
  TaskReview = 'task_review',
  TaskRun = 'task',
  Topic = 'topic',
  Video = 'video',
  VisualAnalysis = 'visual_analysis',
}

export enum RuntimeRequestType {
  /** Scheduled or workflow-driven runtime execution without a live client request. */
  BackgroundJob = 'background_job',
  /** First-party web browser request. */
  Browser = 'browser',
  /** Third-party or API-style entrypoint, such as OpenAPI, bot, or CLI. */
  ExternalApi = 'external_api',
  /** Server-owned runtime work that is not part of a direct user request chain. */
  InternalTask = 'internal_task',
  /** First-party mobile app request. */
  Mobile = 'mobile',
  /** Server-side application request chain, distinct from Next.js Server Actions. */
  ServerSide = 'server_side',
}

export interface RuntimeCallMetadata extends Record<string, unknown> {
  trigger: RequestTrigger;
}

// ******* Runtime Biz Error ******* //
export const AgentRuntimeErrorType = {
  AgentRuntimeError: 'AgentRuntimeError', // Agent Runtime module runtime error
  /**
   * The `parent_id` referenced by an assistant / tool message no longer exists
   * in the database — typically because the parent message was deleted during
   * operation execution. The conversation chain is broken, so the runtime
   * stops fail-fast instead of letting the next step hit another FK violation.
   */
  ConversationParentMissing: 'ConversationParentMissing',
  LocationNotSupportError: 'LocationNotSupportError',
  /**
   * No model provider is configured / enabled for the requested model. Surfaces
   * from `RouterRuntime.resolveRouters` when the router list resolves empty —
   * typically because the user has not added an API key or enabled a provider.
   */
  NoAvailableProvider: 'NoAvailableProvider',

  AccountDeactivated: 'AccountDeactivated',
  QuotaLimitReached: 'QuotaLimitReached',
  InsufficientQuota: 'InsufficientQuota',

  ModelNotFound: 'ModelNotFound',

  PermissionDenied: 'PermissionDenied',
  ExceededContextWindow: 'ExceededContextWindow',

  InvalidProviderAPIKey: 'InvalidProviderAPIKey',
  ProviderBizError: 'ProviderBizError',

  InvalidOllamaArgs: 'InvalidOllamaArgs',
  OllamaBizError: 'OllamaBizError',
  OllamaServiceUnavailable: 'OllamaServiceUnavailable',

  InvalidBedrockCredentials: 'InvalidBedrockCredentials',
  InvalidVertexCredentials: 'InvalidVertexCredentials',
  StreamChunkError: 'StreamChunkError',

  InvalidGithubToken: 'InvalidGithubToken',
  InvalidGithubCopilotToken: 'InvalidGithubCopilotToken',

  ConnectionCheckFailed: 'ConnectionCheckFailed',

  // ******* Image Generation Error ******* //
  ProviderNoImageGenerated: 'ProviderNoImageGenerated',

  InvalidComfyUIArgs: 'InvalidComfyUIArgs',
  ComfyUIBizError: 'ComfyUIBizError',
  ComfyUIServiceUnavailable: 'ComfyUIServiceUnavailable',
  ComfyUIEmptyResult: 'ComfyUIEmptyResult',
  ComfyUIUploadFailed: 'ComfyUIUploadFailed',
  ComfyUIWorkflowError: 'ComfyUIWorkflowError',
  ComfyUIModelError: 'ComfyUIModelError',

  /**
   * @deprecated
   */
  NoOpenAIAPIKey: 'NoOpenAIAPIKey',
} as const;
export type ILobeAgentRuntimeErrorType =
  (typeof AgentRuntimeErrorType)[keyof typeof AgentRuntimeErrorType];
