'use client';

import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';
import { useParams } from 'react-router-dom';

import FloatingChatPanel from '@/features/FloatingChatPanel';

const MAX_PANEL_WIDTH = 1024;

const TopicPage = memo(() => {
  const params = useParams<{ aid?: string; topicId?: string }>();

  if (!params.aid || !params.topicId) return null;

  return (
    <Flexbox
      align={'center'}
      data-testid="agent-page-container"
      height={'100%'}
      style={{ minHeight: 0, position: 'relative' }}
      width={'100%'}
    >
      <Flexbox
        flex={1}
        justify={'flex-end'}
        style={{ maxWidth: MAX_PANEL_WIDTH, minHeight: 0 }}
        width={'100%'}
      >
        <FloatingChatPanel
          agentId={params.aid}
          maxHeight={0.92}
          minHeight={320}
          title={'Floating Chat Panel'}
          topicId={params.topicId}
          variant={'embedded'}
        />
      </Flexbox>
    </Flexbox>
  );
});

export default TopicPage;
