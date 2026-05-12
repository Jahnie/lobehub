import { isDesktop } from '@lobechat/const';
import { DropdownMenu, type DropdownMenuProps, Icon, Tooltip } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { ChevronDownIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { APP_ICONS } from './apps';
import { useOpenInApp } from './useOpenInApp';

const styles = createStaticStyles(({ css }) => ({
  dropdownItem: css`
    display: flex;
    gap: 8px;
    align-items: center;
  `,
  leftButton: css`
    cursor: pointer;

    display: flex;
    align-items: center;
    justify-content: center;

    padding-inline: 8px;

    color: ${cssVar.colorTextSecondary};

    transition: all 0.2s;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillSecondary};
    }
  `,
  rightButton: css`
    cursor: pointer;

    display: flex;
    align-items: center;
    justify-content: center;

    padding-inline: 4px;
    border-inline-start: 1px solid ${cssVar.colorBorderSecondary};

    color: ${cssVar.colorTextSecondary};

    transition: all 0.2s;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillSecondary};
    }
  `,
  root: css`
    overflow: hidden;
    display: inline-flex;
    align-items: stretch;

    height: 22px;
    border-radius: 6px;
  `,
}));

export interface OpenInAppButtonProps {
  className?: string;
  workingDirectory: string;
}

const OpenInAppButton = memo<OpenInAppButtonProps>(({ workingDirectory, className }) => {
  const { t } = useTranslation('openInApp');
  const { defaultApp, installedApps, launch, ready } = useOpenInApp(workingDirectory);

  const defaultDisplayName = useMemo(
    () => installedApps.find((app) => app.id === defaultApp)?.displayName ?? defaultApp,
    [installedApps, defaultApp],
  );

  const dropdownItems = useMemo<DropdownMenuProps['items']>(
    () =>
      installedApps.map((app) => ({
        icon: <Icon icon={APP_ICONS[app.id]} size={14} />,
        key: app.id,
        label: app.displayName,
        onClick: () => {
          void launch(app.id);
        },
      })),
    [installedApps, launch],
  );

  if (!isDesktop || !workingDirectory) return null;
  if (!ready) return null;

  const DefaultIcon = APP_ICONS[defaultApp];

  const wrapperClassName = [styles.root, className].filter(Boolean).join(' ');

  return (
    <div className={wrapperClassName}>
      <Tooltip title={t('tooltip', { appName: defaultDisplayName })}>
        <div
          aria-label={t('tooltip', { appName: defaultDisplayName })}
          className={styles.leftButton}
          role="button"
          onClick={() => {
            void launch(defaultApp);
          }}
        >
          <Icon icon={DefaultIcon} size={14} />
        </div>
      </Tooltip>
      <DropdownMenu items={dropdownItems} trigger={['click']}>
        <div aria-label={t('dropdownLabel')} className={styles.rightButton} role="button">
          <Icon icon={ChevronDownIcon} size={12} />
        </div>
      </DropdownMenu>
    </div>
  );
});

OpenInAppButton.displayName = 'OpenInAppButton';

export default OpenInAppButton;
