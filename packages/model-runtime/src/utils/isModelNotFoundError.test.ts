import { describe, expect, it } from 'vitest';

import { isModelNotFoundError } from './isModelNotFoundError';

describe('isModelNotFoundError', () => {
  it('should return false for undefined/empty input', () => {
    expect(isModelNotFoundError(undefined)).toBe(false);
    expect(isModelNotFoundError('')).toBe(false);
  });

  it('should detect "model not found" errors', () => {
    expect(isModelNotFoundError('The model gpt-5 was not found')).toBe(false);
    expect(isModelNotFoundError('model not found: gpt-5')).toBe(true);
  });

  it('should detect "model_not_found" code in message', () => {
    expect(isModelNotFoundError('Error: model_not_found')).toBe(true);
  });

  it('should detect "does not exist" errors (Volcengine/Azure)', () => {
    expect(
      isModelNotFoundError(
        'The model or endpoint doubao-seed-2.0-pro does not exist or you do not have access to it.',
      ),
    ).toBe(true);
  });

  it('should detect "no such model" errors', () => {
    expect(isModelNotFoundError('no such model: custom-model-v1')).toBe(true);
  });

  it('should detect "not found model" errors', () => {
    expect(isModelNotFoundError('not found model abc-123')).toBe(true);
  });

  it('should detect "model is not accessible" errors', () => {
    expect(isModelNotFoundError('The model is not accessible with your current plan')).toBe(true);
  });

  it('should detect "model is not available" errors', () => {
    expect(isModelNotFoundError('The requested model is not available in this region')).toBe(true);
  });

  it('should detect "invalid model" errors', () => {
    expect(isModelNotFoundError('invalid model: test-model')).toBe(true);
  });

  it('should be case-insensitive', () => {
    expect(isModelNotFoundError('MODEL NOT FOUND')).toBe(true);
    expect(isModelNotFoundError('The Model Does Not Exist')).toBe(true);
  });

  it('should return false for unrelated error messages', () => {
    expect(isModelNotFoundError('Insufficient Balance')).toBe(false);
    expect(isModelNotFoundError('Invalid API key')).toBe(false);
    expect(isModelNotFoundError('Rate limit reached')).toBe(false);
    expect(isModelNotFoundError('context length exceeded')).toBe(false);
  });
});
