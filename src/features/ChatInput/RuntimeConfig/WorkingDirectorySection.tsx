'use client';

import { isDesktop } from '@lobechat/const';
import { memo } from 'react';

import { resolveTargetDeviceId } from '@/helpers/agentWorkingDirectory';
import { useEffectiveWorkingDirectory } from '@/hooks/useEffectiveWorkingDirectory';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useElectronStore } from '@/store/electron';

import GitStatus from './GitStatus';
import { useRepoType } from './useRepoType';
import WorkingDirectoryPicker from './WorkingDirectoryPicker';

interface WorkingDirectorySectionProps {
  agentId: string;
}

/**
 * Working directory + git status, shared by the agent runtime bars. The unified
 * picker handles local and remote targets alike; git status is only shown when
 * the cwd lives on this machine (a remote device's git state isn't readable here
 * yet — that's the git-over-RPC follow-up).
 */
const WorkingDirectorySection = memo<WorkingDirectorySectionProps>(({ agentId }) => {
  const agencyConfig = useAgentStore(agentByIdSelectors.getAgencyConfigById(agentId));
  const currentDeviceId = useElectronStore((s) => s.gatewayDeviceInfo?.deviceId);
  const targetDeviceId = resolveTargetDeviceId(agencyConfig, currentDeviceId);
  const isLocalDevice = isDesktop && !!targetDeviceId && targetDeviceId === currentDeviceId;

  const effectiveWorkingDirectory = useEffectiveWorkingDirectory(agentId);
  // Only probe git on this machine — `useRepoType` reads the local filesystem.
  const repoType = useRepoType(isLocalDevice ? effectiveWorkingDirectory : undefined);

  return (
    <>
      <WorkingDirectoryPicker agentId={agentId} />
      {isLocalDevice && effectiveWorkingDirectory && repoType && (
        <GitStatus isGithub={repoType === 'github'} path={effectiveWorkingDirectory} />
      )}
    </>
  );
});

WorkingDirectorySection.displayName = 'WorkingDirectorySection';

export default WorkingDirectorySection;
