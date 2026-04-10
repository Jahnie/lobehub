'use client';

import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import SideBarDrawer from '@/features/NavPanel/SideBarDrawer';
import { useHomeStore } from '@/store/home';
import { homeRecentSelectors } from '@/store/home/selectors';

import RecentListItem from './Item';

interface AllRecentsDrawerProps {
  onClose: () => void;
  open: boolean;
}

const AllRecentsDrawer = memo<AllRecentsDrawerProps>(({ open, onClose }) => {
  const { t } = useTranslation('common');
  const recents = useHomeStore(homeRecentSelectors.recents);
  const isInit = useHomeStore(homeRecentSelectors.isRecentsInit);

  return (
    <SideBarDrawer open={open} title={t('recents')} onClose={onClose}>
      <Flexbox gap={1} paddingBlock={1} paddingInline={4}>
        {!isInit ? (
          <SkeletonList rows={5} />
        ) : (
          recents.map((item) => (
            <Link
              key={`${item.type}-${item.id}`}
              style={{ color: 'inherit', textDecoration: 'none' }}
              to={item.routePath}
            >
              <RecentListItem {...item} />
            </Link>
          ))
        )}
      </Flexbox>
    </SideBarDrawer>
  );
});

AllRecentsDrawer.displayName = 'AllRecentsDrawer';

export default AllRecentsDrawer;
