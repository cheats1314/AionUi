import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MessageListProvider,
  useAddOrUpdateMessage,
  useMessageList,
  useMessageLstCache,
  useReloadMessageListFromDatabase,
  useRemoveMessageByMsgId,
} from '@/renderer/pages/conversation/Messages/hooks';

const mockGetConversationMessagesInvoke = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getConversationMessages: {
        invoke: (...args: unknown[]) => mockGetConversationMessagesInvoke(...args),
      },
    },
  },
}));

type TestMessage = {
  id: string;
  msg_id?: string;
  conversation_id: string;
  type: string;
  position?: string;
  content: {
    content: string;
  };
  createdAt?: number;
};

const CacheProbe = ({ conversationId }: { conversationId: string }) => {
  const cacheState = useMessageLstCache(conversationId);
  const messages = useMessageList();
  return (
    <>
      <pre data-testid='messages'>{JSON.stringify(messages)}</pre>
      <pre data-testid='cache-state'>{JSON.stringify(cacheState)}</pre>
    </>
  );
};

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const MutationProbe = ({ conversationId = 'conv-1' }: { conversationId?: string }) => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const removeMessageByMsgId = useRemoveMessageByMsgId();
  const reloadMessageListFromDatabase = useReloadMessageListFromDatabase(conversationId);
  const messages = useMessageList();

  return (
    <div>
      <button
        type='button'
        onClick={() =>
          addOrUpdateMessage(
            {
              id: 'msg-1',
              msg_id: 'msg-1',
              conversation_id: conversationId,
              type: 'text',
              position: 'right',
              content: { content: 'queued message' },
            },
            true
          )
        }
      >
        add-message
      </button>
      <button type='button' onClick={() => removeMessageByMsgId('msg-1')}>
        remove-message
      </button>
      <button type='button' onClick={() => void reloadMessageListFromDatabase()}>
        reload-messages
      </button>
      <pre data-testid='mutated-messages'>{JSON.stringify(messages)}</pre>
    </div>
  );
};

describe('message hooks cache merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('keeps same-conversation streaming messages while filtering out messages from the previous conversation', async () => {
    const dbMessages: TestMessage[] = [
      {
        id: 'db-1',
        msg_id: 'db-1',
        conversation_id: 'conv-1',
        type: 'text',
        content: { content: 'from db' },
      },
    ];

    mockGetConversationMessagesInvoke.mockResolvedValue(dbMessages);

    const initialMessages: TestMessage[] = [
      {
        id: 'stream-1',
        msg_id: 'stream-1',
        conversation_id: 'conv-1',
        type: 'text',
        content: { content: 'streaming current conversation' },
      },
      {
        id: 'stream-2',
        msg_id: 'stream-2',
        conversation_id: 'conv-2',
        type: 'text',
        content: { content: 'streaming stale conversation' },
      },
    ];

    render(
      <MessageListProvider value={initialMessages}>
        <CacheProbe conversationId='conv-1' />
      </MessageListProvider>
    );

    await waitFor(() => {
      const content = screen.getByTestId('messages').textContent;
      expect(content).toContain('db-1');
      expect(content).toContain('stream-1');
    });

    const merged = JSON.parse(screen.getByTestId('messages').textContent ?? '[]') as TestMessage[];

    expect(merged.map((message) => message.id)).toEqual(['db-1', 'stream-1']);
  });

  it('reports loading while conversation history is still pending', async () => {
    const deferred = createDeferred<TestMessage[]>();
    mockGetConversationMessagesInvoke.mockReturnValue(deferred.promise);

    render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-loading' />
      </MessageListProvider>
    );

    expect(screen.getByTestId('cache-state').textContent).toContain('"isLoading":true');
    expect(screen.getByTestId('messages').textContent).toBe('[]');

    deferred.resolve([
      {
        id: 'db-loading-1',
        msg_id: 'db-loading-1',
        conversation_id: 'conv-loading',
        type: 'text',
        content: { content: 'loaded after delay' },
      },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('loaded after delay');
      expect(screen.getByTestId('cache-state').textContent).toContain('"isLoading":false');
    });
  });

  it('logs history load payload size when message load debug is enabled', async () => {
    localStorage.setItem('aionui:message-load-debug', '1');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const dbMessages: TestMessage[] = [
      {
        id: 'db-debug-1',
        msg_id: 'db-debug-1',
        conversation_id: 'conv-debug',
        type: 'text',
        content: { content: 'debug payload' },
      },
    ];
    const payloadBytes = new TextEncoder().encode(JSON.stringify(dbMessages)).length;
    mockGetConversationMessagesInvoke.mockResolvedValueOnce(dbMessages);

    render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-debug' />
      </MessageListProvider>
    );

    await waitFor(() => {
      expect(info).toHaveBeenCalledWith('[MessageLoad] conversation history loaded', {
        conversationId: 'conv-debug',
        cached: false,
        partial: false,
        messages: 1,
        payloadBytes,
        dbMs: expect.any(Number),
        totalMs: expect.any(Number),
      });
    });
    info.mockRestore();
  });

  it('loads the latest page first before refreshing long conversation history', async () => {
    const latestDescMessages: TestMessage[] = Array.from({ length: 300 }, (_, index) => ({
      id: `latest-${300 - index}`,
      msg_id: `latest-${300 - index}`,
      conversation_id: 'conv-long',
      type: 'text',
      content: { content: `latest ${300 - index}` },
    }));
    const fullDeferred = createDeferred<TestMessage[]>();
    mockGetConversationMessagesInvoke
      .mockResolvedValueOnce(latestDescMessages)
      .mockReturnValueOnce(fullDeferred.promise);

    render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-long' />
      </MessageListProvider>
    );

    await waitFor(() => {
      const messages = JSON.parse(screen.getByTestId('messages').textContent ?? '[]') as TestMessage[];
      expect(messages).toHaveLength(300);
      expect(messages[0].id).toBe('latest-1');
      expect(messages[299].id).toBe('latest-300');
      expect(screen.getByTestId('cache-state').textContent).toContain('"isRefreshing":true');
    });
    expect(mockGetConversationMessagesInvoke).toHaveBeenNthCalledWith(1, {
      conversation_id: 'conv-long',
      page: 0,
      pageSize: 300,
      order: 'DESC',
    });
    expect(mockGetConversationMessagesInvoke).toHaveBeenNthCalledWith(2, {
      conversation_id: 'conv-long',
      page: 0,
      pageSize: 10000,
      order: 'ASC',
    });

    fullDeferred.resolve([
      ...latestDescMessages.slice().reverse(),
      {
        id: 'older-1',
        msg_id: 'older-1',
        conversation_id: 'conv-long',
        type: 'text',
        content: { content: 'older message' },
      },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('older message');
      expect(screen.getByTestId('cache-state').textContent).toContain('"isRefreshing":false');
    });
  });

  it('does not start a full refresh when the latest page contains the entire conversation', async () => {
    const shortMessages: TestMessage[] = [
      {
        id: 'short-2',
        msg_id: 'short-2',
        conversation_id: 'conv-short',
        type: 'text',
        content: { content: 'second short message' },
      },
      {
        id: 'short-1',
        msg_id: 'short-1',
        conversation_id: 'conv-short',
        type: 'text',
        content: { content: 'first short message' },
      },
    ];
    mockGetConversationMessagesInvoke.mockResolvedValueOnce(shortMessages);

    render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-short' />
      </MessageListProvider>
    );

    await waitFor(() => {
      const messages = JSON.parse(screen.getByTestId('messages').textContent ?? '[]') as TestMessage[];
      expect(messages.map((message) => message.id)).toEqual(['short-1', 'short-2']);
      expect(screen.getByTestId('cache-state').textContent).toContain('"isRefreshing":false');
    });
    expect(mockGetConversationMessagesInvoke).toHaveBeenCalledTimes(1);
    expect(mockGetConversationMessagesInvoke).toHaveBeenCalledWith({
      conversation_id: 'conv-short',
      page: 0,
      pageSize: 300,
      order: 'DESC',
    });
  });

  it('shows cached conversation messages immediately while refreshing in the background', async () => {
    mockGetConversationMessagesInvoke.mockResolvedValueOnce([
      {
        id: 'db-cached-1',
        msg_id: 'db-cached-1',
        conversation_id: 'conv-cached',
        type: 'text',
        content: { content: 'cached message' },
      },
    ]);

    const firstRender = render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-cached' />
      </MessageListProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('cached message');
    });

    firstRender.unmount();

    const deferred = createDeferred<TestMessage[]>();
    mockGetConversationMessagesInvoke.mockReturnValueOnce(deferred.promise);

    render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-cached' />
      </MessageListProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('cached message');
      expect(screen.getByTestId('cache-state').textContent).toContain('"isRefreshing":true');
    });
    expect(screen.getByTestId('cache-state').textContent).toContain('"isLoading":false');
    expect(mockGetConversationMessagesInvoke).toHaveBeenLastCalledWith({
      conversation_id: 'conv-cached',
      page: 0,
      pageSize: 10000,
      order: 'ASC',
    });

    deferred.resolve([
      {
        id: 'db-cached-2',
        msg_id: 'db-cached-2',
        conversation_id: 'conv-cached',
        type: 'text',
        content: { content: 'refreshed message' },
      },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('refreshed message');
      expect(screen.getByTestId('messages').textContent).not.toContain('cached message');
      expect(screen.getByTestId('cache-state').textContent).toContain('"isRefreshing":false');
    });
  });

  it('keeps locally updated messages in cache for immediate conversation returns', async () => {
    mockGetConversationMessagesInvoke.mockResolvedValueOnce([
      {
        id: 'db-fresh-1',
        msg_id: 'db-fresh-1',
        conversation_id: 'conv-fresh-cache',
        type: 'text',
        content: { content: 'cached before local update' },
      },
    ]);

    const firstRender = render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-fresh-cache' />
      </MessageListProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('cached before local update');
    });

    firstRender.unmount();

    const mutationRender = render(
      <MessageListProvider
        value={[
          {
            id: 'db-fresh-1',
            msg_id: 'db-fresh-1',
            conversation_id: 'conv-fresh-cache',
            type: 'text',
            content: { content: 'cached before local update' },
          },
        ]}
      >
        <MutationProbe conversationId='conv-fresh-cache' />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'add-message' }));

    await waitFor(() => {
      expect(screen.getByTestId('mutated-messages').textContent).toContain('queued message');
    });

    mutationRender.unmount();

    const deferred = createDeferred<TestMessage[]>();
    mockGetConversationMessagesInvoke.mockReturnValueOnce(deferred.promise);

    render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-fresh-cache' />
      </MessageListProvider>
    );

    await waitFor(() => {
      const content = screen.getByTestId('messages').textContent ?? '';
      expect(content).toContain('cached before local update');
      expect(content).toContain('queued message');
      expect(screen.getByTestId('cache-state').textContent).toContain('"isRefreshing":true');
    });
  });

  it('adds optimistic messages and removes them by msg id', async () => {
    mockGetConversationMessagesInvoke.mockResolvedValue([]);

    render(
      <MessageListProvider value={[]}>
        <MutationProbe />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'add-message' }));

    await waitFor(() => {
      expect(screen.getByTestId('mutated-messages').textContent).toContain('msg-1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'remove-message' }));

    await waitFor(() => {
      expect(screen.getByTestId('mutated-messages').textContent).not.toContain('msg-1');
    });
  });

  it('replaces the local list when reloading messages from the database', async () => {
    mockGetConversationMessagesInvoke.mockResolvedValue([
      {
        id: 'db-2',
        msg_id: 'db-2',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'right',
        content: { content: 'database replacement' },
      },
    ]);

    render(
      <MessageListProvider value={[]}>
        <MutationProbe />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'add-message' }));

    await waitFor(() => {
      expect(screen.getByTestId('mutated-messages').textContent).toContain('queued message');
    });

    fireEvent.click(screen.getByRole('button', { name: 'reload-messages' }));

    await waitFor(() => {
      const content = screen.getByTestId('mutated-messages').textContent ?? '';
      expect(content).toContain('database replacement');
      expect(content).not.toContain('queued message');
    });
  });
});
