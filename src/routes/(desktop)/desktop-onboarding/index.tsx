'use client';

import { APP_WINDOW_MIN_SIZE } from '@lobechat/desktop-bridge';
import { type DataSyncConfig } from '@lobechat/electron-client-ipc';
import { Flexbox, Skeleton } from '@lobehub/ui';
import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Loading from '@/components/Loading/BrandTextLoading';
import { remoteServerService } from '@/services/electron/remoteServer';
import { electronSystemService } from '@/services/electron/system';

import OnboardingContainer from './_layout';
import DataModeStep from './features/DataModeStep';
import LoginStep from './features/LoginStep';
import PermissionsStep from './features/PermissionsStep';
import WelcomeStep from './features/WelcomeStep';
import { resolveInitialScreen } from './resolveInitialScreen';
import {
  clearDesktopOnboardingScreen,
  getDesktopOnboardingEverCompleted,
  getDesktopOnboardingScreen,
  setDesktopOnboardingCompleted,
  setDesktopOnboardingEverCompleted,
  setDesktopOnboardingScreen,
} from './storage';
import { DesktopOnboardingScreen, isDesktopOnboardingScreen } from './types';

const DesktopOnboardingPage = memo(() => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isMac, setIsMac] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const isCompletingRef = useRef(false);

  const flow = useMemo(
    () =>
      isMac
        ? [
            DesktopOnboardingScreen.Welcome,
            DesktopOnboardingScreen.Permissions,
            DesktopOnboardingScreen.DataMode,
            DesktopOnboardingScreen.Login,
          ]
        : [
            DesktopOnboardingScreen.Welcome,
            DesktopOnboardingScreen.DataMode,
            DesktopOnboardingScreen.Login,
          ],
    [isMac],
  );

  const resolveScreenForPlatform = useCallback(
    (screen: DesktopOnboardingScreen) =>
      resolveInitialScreen({
        everCompleted: false,
        isMac,
        requested: screen,
        saved: null,
      }),
    [isMac],
  );

  const getRequestedScreenFromUrl = useCallback((): DesktopOnboardingScreen | null => {
    const screenParam = searchParams.get('screen');
    if (isDesktopOnboardingScreen(screenParam)) return screenParam;

    return null;
  }, [searchParams]);

  const [currentScreen, setCurrentScreen] = useState<DesktopOnboardingScreen>(
    DesktopOnboardingScreen.Welcome,
  );

  const isRemoteServerConfigured = useCallback((config: DataSyncConfig) => {
    if (!config.active) return false;
    if (config.storageMode !== 'selfHost') return true;

    return !!config.remoteServerUrl?.trim();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const initial = resolveInitialScreen({
      everCompleted: getDesktopOnboardingEverCompleted(),
      isMac,
      requested: getRequestedScreenFromUrl(),
      saved: getDesktopOnboardingScreen(),
    });

    setCurrentScreen(initial);

    // Canonicalize URL to `?screen=...`
    const currentUrlScreen = searchParams.get('screen');
    if (currentUrlScreen !== initial) {
      setSearchParams({ screen: initial });
    }
  }, [getRequestedScreenFromUrl, isLoading, isMac, searchParams, setSearchParams]);

  // Persist current screen to localStorage.
  useEffect(() => {
    if (isLoading || isCompletingRef.current) return;
    setDesktopOnboardingScreen(currentScreen);
  }, [currentScreen, isLoading]);

  // Set window size and resizability
  useEffect(() => {
    const minimumSize = { height: 900, width: 1200 };

    const applyWindowSettings = async () => {
      try {
        await electronSystemService.setWindowMinimumSize(minimumSize);
      } catch (error) {
        console.error('[DesktopOnboarding] Failed to apply window settings:', error);
      }
    };

    applyWindowSettings();

    return () => {
      // Restore to app-level default minimum size preset
      electronSystemService.setWindowMinimumSize(APP_WINDOW_MIN_SIZE).catch((error) => {
        console.error('[DesktopOnboarding] Failed to restore window settings:', error);
      });
    };
  }, []);

  // Detect platform: skip permissions page on non-macOS
  useEffect(() => {
    let mounted = true;
    const detectPlatform = async () => {
      try {
        const state = await electronSystemService.getAppState();
        if (!mounted) return;
        setIsMac(state.platform === 'darwin');
      } catch {
        // Fallback: keep default (true)
      } finally {
        setIsLoading(false);
      }
    };
    void detectPlatform();
    return () => {
      mounted = false;
    };
  }, []);

  // Listen URL changes: allow deep-linking between screens.
  useEffect(() => {
    if (isLoading) return;
    const requested = getRequestedScreenFromUrl();
    if (!requested) return;
    const resolved = resolveScreenForPlatform(requested);
    if (resolved !== currentScreen) setCurrentScreen(resolved);
  }, [currentScreen, getRequestedScreenFromUrl, isLoading, resolveScreenForPlatform]);

  const completeOnboarding = useCallback(() => {
    isCompletingRef.current = true;

    setDesktopOnboardingCompleted();
    setDesktopOnboardingEverCompleted();
    clearDesktopOnboardingScreen();

    // Use hard reload instead of SPA navigation to ensure the app boots with the new desktop state.
    electronSystemService.setWindowMinimumSize(APP_WINDOW_MIN_SIZE).catch((error) => {
      console.error('[DesktopOnboarding] Failed to restore window settings:', error);
    });
    window.location.replace('/');
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!getDesktopOnboardingEverCompleted()) return;

    let mounted = true;
    remoteServerService
      .getRemoteServerConfig()
      .then((config) => {
        if (!mounted) return;
        if (!isRemoteServerConfigured(config)) return;

        completeOnboarding();
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [completeOnboarding, isLoading, isRemoteServerConfigured]);

  const goToNextStep = useCallback(() => {
    const idx = flow.indexOf(currentScreen);
    const next = flow[idx + 1];

    if (!next) {
      completeOnboarding();
      return;
    }

    setSearchParams({ screen: next });
    setCurrentScreen(next);
  }, [completeOnboarding, currentScreen, flow, setSearchParams]);

  const goToPreviousStep = useCallback(() => {
    const idx = flow.indexOf(currentScreen);
    const prevScreen = flow[Math.max(0, idx - 1)] ?? DesktopOnboardingScreen.Welcome;
    setSearchParams({ screen: prevScreen });
    setCurrentScreen(prevScreen);
  }, [currentScreen, flow, setSearchParams]);

  if (isLoading) {
    return <Loading debugId="DesktopOnboarding" />;
  }

  const renderStep = () => {
    switch (currentScreen) {
      case DesktopOnboardingScreen.Welcome: {
        return <WelcomeStep onNext={goToNextStep} />;
      }
      case DesktopOnboardingScreen.Permissions: {
        // macOS-only screen; fallback to DataMode if platform doesn't support.
        if (!isMac) {
          setCurrentScreen(DesktopOnboardingScreen.DataMode);
          return null;
        }
        return <PermissionsStep onBack={goToPreviousStep} onNext={goToNextStep} />;
      }
      case DesktopOnboardingScreen.DataMode: {
        return <DataModeStep onBack={goToPreviousStep} onNext={goToNextStep} />;
      }
      case DesktopOnboardingScreen.Login: {
        return <LoginStep onBack={goToPreviousStep} onNext={goToNextStep} />;
      }
      default: {
        return null;
      }
    }
  };

  return (
    <OnboardingContainer>
      <Flexbox gap={24} style={{ maxWidth: 560, minHeight: '100%', width: '100%' }}>
        <Suspense
          fallback={
            <Flexbox gap={8}>
              <Skeleton.Avatar size={48} />
              <Skeleton
                paragraph={{
                  rows: 8,
                }}
                title={{
                  fontSize: 24,
                }}
              />
            </Flexbox>
          }
        >
          {renderStep()}
        </Suspense>
      </Flexbox>
    </OnboardingContainer>
  );
});

DesktopOnboardingPage.displayName = 'DesktopOnboardingPage';

export default DesktopOnboardingPage;
