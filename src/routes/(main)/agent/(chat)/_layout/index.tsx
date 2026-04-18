'use client';

import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';
import { Outlet } from 'react-router-dom';

import ChatHeader from '@/routes/(main)/agent/features/Conversation/Header';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

const ChatLayout = memo(() => {
  const showHeader = useGlobalStore(systemStatusSelectors.showChatHeader);

  return (
    <Flexbox flex={1} height={'100%'} style={{ minHeight: 0 }} width={'100%'}>
      {showHeader && <ChatHeader />}
      <Flexbox flex={1} style={{ minHeight: 0, position: 'relative' }}>
        <Outlet />
      </Flexbox>
    </Flexbox>
  );
});

ChatLayout.displayName = 'ChatLayout';

export default ChatLayout;
