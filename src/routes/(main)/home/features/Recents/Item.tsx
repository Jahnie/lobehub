import { ActionIcon, DropdownMenu, Flexbox } from '@lobehub/ui';
import {
  CheckSquareIcon,
  FileIcon,
  FileTextIcon,
  HashIcon,
  MoreHorizontalIcon,
} from 'lucide-react';
import { memo, useCallback, useState } from 'react';

import InlineRename from '@/components/InlineRename';
import NavItem from '@/features/NavPanel/components/NavItem';
import { usePrefetchAgent } from '@/hooks/usePrefetchAgent';
import { type RecentItem } from '@/server/routers/lambda/recent';

import { useRecentItemDropdownMenu } from './useDropdownMenu';

const TYPE_ICON_MAP = {
  document: FileTextIcon,
  file: FileIcon,
  task: CheckSquareIcon,
  topic: HashIcon,
};

const RecentListItem = memo<RecentItem>((item) => {
  const { title, type, agentId } = item;
  const IconComponent = TYPE_ICON_MAP[type] || FileIcon;
  const [editing, setEditing] = useState(false);
  const prefetchAgent = usePrefetchAgent();

  const toggleEditing = useCallback((visible?: boolean) => {
    setEditing(!!visible);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (agentId) prefetchAgent(agentId);
  }, [agentId, prefetchAgent]);

  const { dropdownMenu, handleRename } = useRecentItemDropdownMenu(item, toggleEditing);

  return (
    <Flexbox style={{ position: 'relative' }}>
      <NavItem
        contextMenuItems={dropdownMenu}
        disabled={editing}
        icon={IconComponent}
        title={title}
        actions={
          <DropdownMenu items={dropdownMenu()} nativeButton={false}>
            <ActionIcon icon={MoreHorizontalIcon} size={'small'} style={{ flex: 'none' }} />
          </DropdownMenu>
        }
        onMouseEnter={handleMouseEnter}
      />
      <InlineRename
        open={editing}
        title={title}
        onOpenChange={(open) => toggleEditing(open)}
        onSave={handleRename}
      />
    </Flexbox>
  );
});

export default RecentListItem;
