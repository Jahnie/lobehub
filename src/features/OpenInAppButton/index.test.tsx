import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OpenInAppButton from './index';

const launchMock = vi.fn();
let hookReturn: {
  defaultApp: string;
  installedApps: { displayName: string; id: string; installed: boolean }[];
  launch: typeof launchMock;
  ready: boolean;
};
let isDesktopValue = true;

vi.mock('@lobechat/const', () => ({
  get isDesktop() {
    return isDesktopValue;
  },
}));

vi.mock('./useOpenInApp', () => ({
  useOpenInApp: () => hookReturn,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}::${JSON.stringify(opts)}` : key,
  }),
}));

vi.mock('@lobehub/ui', () => ({
  DropdownMenu: ({
    children,
    items,
  }: {
    children: ReactNode;
    items: { icon?: ReactNode; key: string; label: ReactNode; onClick?: () => void }[];
  }) => (
    <div data-testid="dropdown-root">
      <div data-testid="dropdown-trigger">{children}</div>
      <ul data-testid="dropdown-items">
        {items.map((item) => (
          <li
            data-item-id={item.key}
            data-testid={`dropdown-item-${item.key}`}
            key={item.key}
            onClick={() => item.onClick?.()}
          >
            {item.icon}
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  ),
  Icon: ({ icon: IconComp, size }: { icon: unknown; size?: number }) => (
    <span data-icon-size={size} data-testid="ui-icon">
      {typeof IconComp === 'function'
        ? ((IconComp as { displayName?: string; name?: string }).displayName ??
          (IconComp as { displayName?: string; name?: string }).name ??
          'icon')
        : 'icon'}
    </span>
  ),
  Tooltip: ({ children, title }: { children: ReactNode; title?: ReactNode }) => (
    <div data-testid="tooltip" data-title={typeof title === 'string' ? title : ''}>
      {children}
    </div>
  ),
}));

vi.mock('antd-style', () => ({
  createStaticStyles: () => ({
    dropdownItem: 'dropdownItem',
    leftButton: 'leftButton',
    rightButton: 'rightButton',
    root: 'root',
  }),
  cssVar: new Proxy({}, { get: () => 'var(--placeholder)' }),
}));

vi.mock('lucide-react', () => ({
  ChevronDownIcon: function ChevronDownIcon() {
    return null;
  },
  CodeIcon: function CodeIcon() {
    return null;
  },
  FolderIcon: function FolderIcon() {
    return null;
  },
  FolderOpenIcon: function FolderOpenIcon() {
    return null;
  },
  TerminalIcon: function TerminalIcon() {
    return null;
  },
}));

vi.mock('@lobehub/icons', () => ({
  Cursor: function Cursor() {
    return null;
  },
}));

beforeEach(() => {
  isDesktopValue = true;
  launchMock.mockReset();
  hookReturn = {
    defaultApp: 'vscode',
    installedApps: [
      { displayName: 'VS Code', id: 'vscode', installed: true },
      { displayName: 'Finder', id: 'finder', installed: true },
    ],
    launch: launchMock,
    ready: true,
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('<OpenInAppButton />', () => {
  it('returns null on web build (isDesktop=false)', () => {
    isDesktopValue = false;
    const { container } = render(<OpenInAppButton workingDirectory="/tmp/proj" />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when workingDirectory is empty', () => {
    const { container } = render(<OpenInAppButton workingDirectory="" />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null while detection is pending', () => {
    hookReturn = { ...hookReturn, ready: false };
    const { container } = render(<OpenInAppButton workingDirectory="/tmp/proj" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the split button with the default app icon when ready', () => {
    render(<OpenInAppButton workingDirectory="/tmp/proj" />);

    expect(screen.getByTestId('tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('dropdown-root')).toBeInTheDocument();
  });

  it('calls launch(defaultApp) when the left half is clicked', () => {
    render(<OpenInAppButton workingDirectory="/tmp/proj" />);

    const leftButton = screen.getByLabelText(/tooltip/);
    fireEvent.click(leftButton);

    expect(launchMock).toHaveBeenCalledWith('vscode');
  });

  it('lists only installed apps in the dropdown', () => {
    render(<OpenInAppButton workingDirectory="/tmp/proj" />);

    const items = screen.getAllByTestId(/dropdown-item-/);
    expect(items).toHaveLength(2);
    expect(items.map((el) => el.getAttribute('data-item-id'))).toEqual(['vscode', 'finder']);
  });

  it('invokes launch(appId) when a dropdown item is clicked', () => {
    render(<OpenInAppButton workingDirectory="/tmp/proj" />);

    fireEvent.click(screen.getByTestId('dropdown-item-finder'));

    expect(launchMock).toHaveBeenCalledWith('finder');
  });
});
