import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DESKTOP_ONBOARDING_COMPLETED_KEY,
  DESKTOP_ONBOARDING_EVER_COMPLETED_KEY,
  DESKTOP_ONBOARDING_SCREEN_KEY,
} from './storage';
import { DesktopOnboardingScreen } from './types';

const mocks = vi.hoisted(() => ({
  getAppState: vi.fn(),
  getRemoteServerConfig: vi.fn(),
  locationReplace: vi.fn(),
  restoreResolvers: [] as Array<() => void>,
  setWindowMinimumSize: vi.fn(),
}));

vi.mock('@lobehub/ui', () => ({
  Flexbox: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Skeleton: {
    Avatar: () => null,
  },
}));

vi.mock('@/components/Loading/BrandTextLoading', () => ({
  default: () => <div>Loading</div>,
}));

vi.mock('@/services/electron/system', () => ({
  electronSystemService: {
    getAppState: mocks.getAppState,
    setWindowMinimumSize: mocks.setWindowMinimumSize,
  },
}));

vi.mock('@/services/electron/remoteServer', () => ({
  remoteServerService: {
    getRemoteServerConfig: mocks.getRemoteServerConfig,
  },
}));

vi.mock('./_layout', () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock('./features/WelcomeStep', () => ({
  default: ({ onNext }: { onNext: () => void }) => (
    <button type="button" onClick={onNext}>
      welcome-next
    </button>
  ),
}));

vi.mock('./features/PermissionsStep', () => ({
  default: ({ onBack, onNext }: { onBack: () => void; onNext: () => void }) => (
    <>
      <button type="button" onClick={onBack}>
        permissions-back
      </button>
      <button type="button" onClick={onNext}>
        permissions-next
      </button>
    </>
  ),
}));

vi.mock('./features/DataModeStep', () => ({
  default: ({ onBack, onNext }: { onBack: () => void; onNext: () => void }) => (
    <>
      <button type="button" onClick={onBack}>
        data-mode-back
      </button>
      <button type="button" onClick={onNext}>
        data-mode-next
      </button>
    </>
  ),
}));

vi.mock('./features/LoginStep', () => ({
  default: ({ onBack, onNext }: { onBack: () => void; onNext: () => void }) => (
    <>
      <button type="button" onClick={onBack}>
        login-back
      </button>
      <button type="button" onClick={onNext}>
        login-next
      </button>
    </>
  ),
}));

const originalLocation = window.location;

const renderDesktopOnboarding = async () => {
  const { default: DesktopOnboardingPage } = await import('./index');

  return render(
    <MemoryRouter initialEntries={['/desktop-onboarding?screen=login']}>
      <DesktopOnboardingPage />
    </MemoryRouter>,
  );
};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  mocks.restoreResolvers = [];
  mocks.getAppState.mockResolvedValue({ platform: 'darwin' });
  mocks.getRemoteServerConfig.mockResolvedValue({ active: false, storageMode: 'cloud' });
  mocks.locationReplace.mockClear();
  mocks.setWindowMinimumSize.mockImplementation(() => {
    if (mocks.setWindowMinimumSize.mock.calls.length === 1) return Promise.resolve();

    return new Promise<void>((resolve) => {
      mocks.restoreResolvers.push(resolve);
    });
  });

  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, replace: mocks.locationReplace },
    writable: true,
  });
});

afterEach(() => {
  mocks.restoreResolvers.splice(0).forEach((resolve) => resolve());
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
    writable: true,
  });
  vi.clearAllMocks();
});

describe('DesktopOnboardingPage completion', () => {
  it('leaves onboarding when a returning user already has active remote sync', async () => {
    window.localStorage.setItem(DESKTOP_ONBOARDING_EVER_COMPLETED_KEY, '1');
    window.localStorage.setItem(DESKTOP_ONBOARDING_SCREEN_KEY, DesktopOnboardingScreen.Login);
    mocks.getRemoteServerConfig.mockResolvedValue({ active: true, storageMode: 'cloud' });

    await renderDesktopOnboarding();

    await waitFor(() => {
      expect(mocks.locationReplace).toHaveBeenCalledWith('/');
    });

    expect(window.sessionStorage.getItem(DESKTOP_ONBOARDING_COMPLETED_KEY)).toBe('1');
    expect(window.localStorage.getItem(DESKTOP_ONBOARDING_EVER_COMPLETED_KEY)).toBe('1');
    expect(window.localStorage.getItem(DESKTOP_ONBOARDING_SCREEN_KEY)).toBeNull();
  });

  it('clears the saved screen and leaves onboarding without waiting for window restore', async () => {
    window.localStorage.setItem(DESKTOP_ONBOARDING_EVER_COMPLETED_KEY, '1');
    window.localStorage.setItem(DESKTOP_ONBOARDING_SCREEN_KEY, DesktopOnboardingScreen.Login);

    await renderDesktopOnboarding();

    const nextButton = await screen.findByRole('button', { name: 'login-next' });

    fireEvent.click(nextButton);

    expect(window.sessionStorage.getItem(DESKTOP_ONBOARDING_COMPLETED_KEY)).toBe('1');
    expect(window.localStorage.getItem(DESKTOP_ONBOARDING_EVER_COMPLETED_KEY)).toBe('1');
    expect(window.localStorage.getItem(DESKTOP_ONBOARDING_SCREEN_KEY)).toBeNull();
    expect(mocks.locationReplace).toHaveBeenCalledWith('/');
  });
});
