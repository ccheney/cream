/**
 * Empty State Stories
 *
 * Storybook stories for empty state components.
 *
 * @see docs/plans/ui/28-states.md lines 103-109
 */

import type { Meta, StoryObj } from "@storybook/react";
import {
  EmptyState,
  NoActivityEmpty,
  NoDataEmpty,
  NoItemsEmpty,
  NoResultsEmpty,
  NotFoundEmpty,
  OfflineEmpty,
  PermissionEmpty,
} from "./empty-state";

// ============================================
// EmptyState Stories
// ============================================

const meta: Meta<typeof EmptyState> = {
  title: "UI/States/EmptyState",
  component: EmptyState,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "Empty state component with icon, title, description, and optional action.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "compact", "card"],
      description: "Empty state variant",
    },
    iconType: {
      control: "select",
      options: ["empty", "search", "error", "folder", "activity", "offline", "lock"],
      description: "Icon type",
    },
  },
};

export default meta;

type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    title: "No data available",
    description: "There's nothing to show here yet.",
  },
};

export const WithAction: Story = {
  args: {
    title: "No items",
    description: "Get started by creating your first item.",
    actionLabel: "Create Item",
    onAction: () => alert("Create clicked"),
  },
};

export const Compact: Story = {
  args: {
    variant: "compact",
    title: "No results",
    description: "Try adjusting your search.",
  },
};

export const Card: Story = {
  args: {
    variant: "card",
    title: "Empty folder",
    description: "This folder doesn't have any files yet.",
    iconType: "folder",
  },
};

// ============================================
// Preset Empty States
// ============================================

export const NoData: StoryObj<typeof NoDataEmpty> = {
  render: (args) => <NoDataEmpty {...args} />,
  args: {},
  parameters: {
    docs: {
      description: {
        story: "Preset for no data scenarios.",
      },
    },
  },
};

export const NoResults: StoryObj<typeof NoResultsEmpty> = {
  render: (args) => <NoResultsEmpty {...args} />,
  args: {
    searchTerm: "bitcoin",
  },
  parameters: {
    docs: {
      description: {
        story: "Preset for no search results.",
      },
    },
  },
};

export const NotFound: StoryObj<typeof NotFoundEmpty> = {
  render: (args) => <NotFoundEmpty {...args} />,
  args: {},
  parameters: {
    docs: {
      description: {
        story: "Preset for 404 not found.",
      },
    },
  },
};

export const NoItems: StoryObj<typeof NoItemsEmpty> = {
  render: (args) => <NoItemsEmpty {...args} />,
  args: {
    itemType: "watchlist",
    onAction: () => alert("Add clicked"),
  },
  parameters: {
    docs: {
      description: {
        story: "Preset for empty list with add action.",
      },
    },
  },
};

export const NoActivity: StoryObj<typeof NoActivityEmpty> = {
  render: (args) => <NoActivityEmpty {...args} />,
  args: {},
  parameters: {
    docs: {
      description: {
        story: "Preset for no recent activity.",
      },
    },
  },
};

export const Offline: StoryObj<typeof OfflineEmpty> = {
  render: (args) => <OfflineEmpty {...args} />,
  args: {
    onRetry: () => alert("Retry clicked"),
  },
  parameters: {
    docs: {
      description: {
        story: "Preset for offline state with retry.",
      },
    },
  },
};

export const NoPermission: StoryObj<typeof PermissionEmpty> = {
  render: (args) => <PermissionEmpty {...args} />,
  args: {},
  parameters: {
    docs: {
      description: {
        story: "Preset for permission denied.",
      },
    },
  },
};

// ============================================
// Gallery
// ============================================

export const AllPresets: StoryObj = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: "24px",
        padding: "24px",
      }}
    >
      <NoDataEmpty />
      <NoResultsEmpty searchTerm="test" />
      <NotFoundEmpty />
      <NoItemsEmpty itemType="items" />
      <NoActivityEmpty />
      <OfflineEmpty />
      <PermissionEmpty />
    </div>
  ),
  parameters: {
    layout: "padded",
    docs: {
      description: {
        story: "Gallery of all preset empty states.",
      },
    },
  },
};
