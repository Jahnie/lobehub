'use client';

import { Github } from '@lobehub/icons';
import { Icon, Popover, Tooltip } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { ChevronDownIcon, FolderIcon, GitBranchIcon, SquircleDashed } from 'lucide-react';
import { memo, type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';

import DeviceWorkingDirectory from './DeviceWorkingDirectory';
import GitStatus from './GitStatus';
import { useRepoType } from './useRepoType';
import WorkingDirectory from './WorkingDirectory';

const styles = createStaticStyles(({ css }) => ({
  button: css`
    cursor: pointer;

    display: flex;
    gap: 6px;
    align-items: center;

    padding-block: 2px;
    padding-inline: 4px;
    border-radius: 4px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    transition: background 0.2s;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

interface WorkingDirectorySectionProps {
  agentId: string;
}

/**
 * Working directory picker shared by the agent runtime bars.
 *
 * Renders the device-scoped picker when the run is dispatched to a remote
 * device (its filesystem can't be browsed locally), otherwise the local folder
 * picker plus git status. Keeping this in one place stops the two bars
 * (RuntimeConfig + HeterogeneousChatInput's WorkingDirectoryBar) from drifting.
 */
const WorkingDirectorySection = memo<WorkingDirectorySectionProps>(({ agentId }) => {
  const { t } = useTranslation('plugin');
  const [open, setOpen] = useState(false);

  const agentWorkingDirectory = useAgentStore(
    agentByIdSelectors.getAgentWorkingDirectoryById(agentId),
  );
  const topicWorkingDirectory = useChatStore(topicSelectors.currentTopicWorkingDirectory);
  const effectiveWorkingDirectory = topicWorkingDirectory || agentWorkingDirectory;
  const agencyConfig = useAgentStore(agentByIdSelectors.getAgencyConfigById(agentId));
  // Runs dispatched to a remote device can't browse the local filesystem — use
  // the device-scoped picker (recent dirs + manual input) instead.
  const isDeviceMode = agencyConfig?.executionTarget === 'device' && !!agencyConfig?.boundDeviceId;

  const repoType = useRepoType(effectiveWorkingDirectory);

  const dirIconNode = useMemo((): ReactNode => {
    if (!effectiveWorkingDirectory) return <Icon icon={SquircleDashed} size={14} />;
    if (repoType === 'github') return <Github size={14} />;
    if (repoType === 'git') return <Icon icon={GitBranchIcon} size={14} />;
    return <Icon icon={FolderIcon} size={14} />;
  }, [effectiveWorkingDirectory, repoType]);

  if (isDeviceMode) return <DeviceWorkingDirectory agentId={agentId} />;

  const displayName = effectiveWorkingDirectory
    ? effectiveWorkingDirectory.split('/').findLast(Boolean) || effectiveWorkingDirectory
    : t('localSystem.workingDirectory.notSet');

  const dirButton = (
    <div className={styles.button}>
      {dirIconNode}
      <span>{displayName}</span>
      <Icon icon={ChevronDownIcon} size={12} />
    </div>
  );

  return (
    <>
      <Popover
        content={<WorkingDirectory agentId={agentId} onClose={() => setOpen(false)} />}
        open={open}
        placement="bottomLeft"
        styles={{ content: { padding: 4 } }}
        trigger="click"
        onOpenChange={setOpen}
      >
        <div>
          {open ? (
            dirButton
          ) : (
            <Tooltip title={effectiveWorkingDirectory || t('localSystem.workingDirectory.notSet')}>
              {dirButton}
            </Tooltip>
          )}
        </div>
      </Popover>
      {effectiveWorkingDirectory && repoType && (
        <GitStatus isGithub={repoType === 'github'} path={effectiveWorkingDirectory} />
      )}
    </>
  );
});

WorkingDirectorySection.displayName = 'WorkingDirectorySection';

export default WorkingDirectorySection;
