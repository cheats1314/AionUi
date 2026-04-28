import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import MessageList from '@/renderer/pages/conversation/Messages/MessageList';
import { MessageListProvider } from '@/renderer/pages/conversation/Messages/hooks';

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
      <button type='button' onClick={onClick}>
        {children}
      </button>
    ),
    Image: {
      ...actual.Image,
      PreviewGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    },
  };
});

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({
    data,
    itemContent,
  }: {
    data: unknown[];
    itemContent: (index: number, item: unknown) => React.ReactNode;
  }) => <div data-testid='virtuoso'>{data.map((item, index) => itemContent(index, item))}</div>,
}));

vi.mock('@icon-park/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@icon-park/react')>();
  return {
    ...actual,
    Down: () => <span>Down</span>,
  };
});

vi.mock('@/renderer/hooks/file/useAutoPreviewOfficeFiles', () => ({
  useAutoPreviewOfficeFiles: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

const renderMessageList = (ui: React.ReactElement) =>
  render(
    <MemoryRouter>
      <ConversationProvider value={{ conversationId: 'conv-1', type: 'acp' }}>
        <MessageListProvider value={[]}>{ui}</MessageListProvider>
      </ConversationProvider>
    </MemoryRouter>
  );

describe('MessageList loading state', () => {
  it('renders a visible loading placeholder instead of an empty pane', () => {
    renderMessageList(<MessageList isLoading />);

    expect(screen.getByTestId('message-list-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading conversation history…')).toBeInTheDocument();
    expect(screen.queryByTestId('virtuoso')).not.toBeInTheDocument();
  });

  it('renders an error state with retry when history loading fails', () => {
    const retry = vi.fn();
    renderMessageList(<MessageList loadingError={new Error('network timeout')} onRetryLoad={retry} />);

    expect(screen.getByTestId('message-list-error')).toBeInTheDocument();
    expect(screen.getByText('Could not load conversation history')).toBeInTheDocument();
    expect(screen.getByText('network timeout')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
