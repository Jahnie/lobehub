const MODEL_NOT_FOUND_PATTERNS = [
  'model not found', // OpenAI / generic
  'model_not_found', // OpenAI (code in message)
  'does not exist', // Volcengine (doubao) / Azure
  'no such model', // generic
  'not found model', // some providers
  'model is not accessible', // access-related model errors
  'model is not available', // generic
  'invalid model', // generic
];

export const isModelNotFoundError = (message?: string): boolean => {
  if (!message) return false;
  const lower = message.toLowerCase();
  return MODEL_NOT_FOUND_PATTERNS.some((p) => lower.includes(p));
};
