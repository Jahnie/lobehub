import { Flexbox } from '@lobehub/ui';
import { MoreHorizontalIcon } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import NavItem from '@/features/NavPanel/components/NavItem';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useHomeStore } from '@/store/home';
import { homeRecentSelectors } from '@/store/home/selectors';

import AllRecentsDrawer from './AllRecentsDrawer';
import RecentListItem from './Item';

const RecentsList = memo(() => {
  const { t } = useTranslation('common');
  const recents = useHomeStore(homeRecentSelectors.recents);
  const isInit = useHomeStore(homeRecentSelectors.isRecentsInit);
  const recentPageSize = useGlobalStore(systemStatusSelectors.recentPageSize);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const displayItems = useMemo(() => recents.slice(0, recentPageSize), [recents, recentPageSize]);
  const hasMore = recents.length > recentPageSize;

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  if (!isInit) {
    return <SkeletonList rows={3} />;
  }

  return (
    <Flexbox gap={2}>
      {displayItems.map((item) => (
        <Link
          key={`${item.type}-${item.id}`}
          style={{ color: 'inherit', textDecoration: 'none' }}
          to={item.routePath}
        >
          <RecentListItem {...item} />
        </Link>
      ))}
      {hasMore && <NavItem icon={MoreHorizontalIcon} title={t('more')} onClick={openDrawer} />}
      <AllRecentsDrawer open={drawerOpen} onClose={closeDrawer} />
    </Flexbox>
  );
});

export default RecentsList;
