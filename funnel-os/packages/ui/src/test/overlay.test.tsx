import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { Button } from '../primitives/Button.js';
import {
  Breadcrumbs,
  Dialog,
  Pagination,
  SegmentedControl,
  Separator,
  Tabs,
  Tooltip,
} from '../primitives/Overlay.js';

/**
 * §1.2 says accessibility "is in the primitive, not added later", and names
 * one property explicitly: "dialog focus trapping that is tested". This file is
 * that test, plus the equivalents for the other primitives that trap or hide
 * focus.
 */

/** A harness with a trigger outside the dialog, to prove focus is returned. */
function DialogHarness({ dismissible = true }: { dismissible?: boolean }): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Delete campaign"
        description="This cannot be undone."
        dismissible={dismissible}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger">Delete</Button>
          </>
        }
      >
        <p>Body text</p>
      </Dialog>
    </>
  );
}

describe('Dialog — the three parts of a focus trap', () => {
  it('part 1: moves focus INTO the dialog on open, not back to the trigger', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    expect(trigger).toHaveFocus();
    await user.click(trigger);

    // Focus must land INSIDE the dialog, or the user's next Tab goes to a
    // control behind the scrim that they cannot see.
    //
    // The assertion is containment, not `toHaveFocus()` on the content node.
    // Radix focuses the first TABBABLE descendant — here the Close button —
    // not the content element itself, which carries tabindex="-1" only so it
    // can receive focus programmatically. Asserting the content node has focus
    // would be asserting a behaviour Radix does not have.
    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
    // And specifically not the trigger that is still mounted behind the scrim.
    // Queried by text, not by role: the trigger is now inside an aria-hidden
    // subtree, which is the isolation the next test asserts, and getByRole
    // deliberately cannot see it.
    expect(trigger).not.toHaveFocus();
  });

  it('part 2: Tab cycles forward and backward inside the dialog without escaping', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => screen.getByRole('dialog'));

    const dialog = screen.getByRole('dialog');
    // Radix guards the boundary; the observable proof is that focus never
    // lands on the trigger that is still mounted behind the scrim.
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 8; i++) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('part 3: returns focus to the trigger on close', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    await waitFor(() => screen.getByRole('dialog'));

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Without this, focus falls to <body> and a keyboard user has to Tab from
    // the top of the document to get back to where they were.
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

describe('Dialog — semantics', () => {
  it('is named by its title, so it is announced as something', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    // An unnamed modal is announced as just "dialog", which tells the user
    // nothing about what just opened over their work.
    expect(await screen.findByRole('dialog', { name: 'Delete campaign' })).toBeInTheDocument();
  });

  it('exposes the description as the accessible description', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
  });

  it('hides the rest of the page from the accessibility tree', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    await waitFor(() => screen.getByRole('dialog'));
    // Radix applies aria-hidden to everything outside the dialog. Without it a
    // screen-reader user can arrow straight past the dialog into the page
    // behind it.
    //
    // The trigger is queried before opening, and asserted on afterwards via
    // the captured node: once it is inside aria-hidden, `getByRole` can no
    // longer see it — which is the proof, not the obstacle.
    expect(trigger.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
  });

  it('Escape closes it when dismissible', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => screen.getByRole('dialog'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a non-dismissible dialog offers no close control', async () => {
    const user = userEvent.setup();
    render(<DialogHarness dismissible={false} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => screen.getByRole('dialog'));
    // A destructive confirmation must require a deliberate choice, so there is
    // no escape hatch in the corner.
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });
});

describe('Tabs', () => {
  const tabs = [
    { value: 'overview', label: 'Overview', content: 'Overview panel' },
    { value: 'detail', label: 'Detail', content: 'Detail panel' },
  ];

  it('exposes a tablist and links each tab to its panel', async () => {
    render(<Tabs tabs={tabs} defaultValue="overview" label="Campaign sections" />);
    const list = screen.getByRole('tablist', { name: 'Campaign sections' });
    expect(list).toBeInTheDocument();

    const tab = screen.getByRole('tab', { name: 'Overview' });
    const panel = screen.getByRole('tabpanel');
    // Both directions of the association, or the user sees four tab names and
    // no indication of which panel is which.
    expect(tab).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', tab.id);
  });

  it('marks only the selected tab as selected', async () => {
    const user = userEvent.setup();
    render(<Tabs tabs={tabs} defaultValue="overview" label="Sections" />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Detail' })).toHaveAttribute('aria-selected', 'false');

    await user.click(screen.getByRole('tab', { name: 'Detail' }));
    expect(screen.getByRole('tab', { name: 'Detail' })).toHaveAttribute('aria-selected', 'true');
  });

  it('moves between tabs with the arrow keys, not the Tab key', async () => {
    const user = userEvent.setup();
    render(<Tabs tabs={tabs} defaultValue="overview" label="Sections" />);
    const first = screen.getByRole('tab', { name: 'Overview' });
    first.focus();
    // Roving tabindex: the tablist is ONE tab stop. Tab should leave the
    // group, not walk through both tabs.
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Detail' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();
  });
});

describe('Tooltip', () => {
  it('opens on keyboard focus, not only on hover', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Refresh the report">
        <Button>Refresh</Button>
      </Tooltip>,
    );
    // Hover-only tooltips are the usual failure: a keyboard user never sees one.
    screen.getByRole('button', { name: 'Refresh' }).focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Refresh the report');
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Refresh the report">
        <Button>Refresh</Button>
      </Tooltip>,
    );
    screen.getByRole('button', { name: 'Refresh' }).focus();
    await screen.findByRole('tooltip');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });
});

describe('SegmentedControl', () => {
  it('is a radiogroup, so it announces which option is chosen', () => {
    render(
      <SegmentedControl
        legend="Date range"
        value="7d"
        onChange={() => {}}
        options={[
          { value: '7d', label: '7d' },
          { value: '30d', label: '30d' },
        ]}
      />,
    );
    // A row of buttons gives no "1 of 2" information and no arrow-key contract.
    expect(screen.getByRole('radiogroup', { name: 'Date range' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '7d' })).toBeChecked();
  });

  it('reports the chosen value on change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        legend="Date range"
        value="7d"
        onChange={onChange}
        options={[
          { value: '7d', label: '7d' },
          { value: '30d', label: '30d' },
        ]}
      />,
    );
    await user.click(screen.getByRole('radio', { name: '30d' }));
    expect(onChange).toHaveBeenCalledWith('30d');
  });
});

describe('Breadcrumbs', () => {
  it('is a labelled nav landmark containing a list', () => {
    render(
      <Breadcrumbs
        crumbs={[
          { label: 'Campaigns', href: '/campaigns' },
          { label: 'Spring launch' },
        ]}
      />,
    );
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    // A hierarchy, so it is a list and can be announced as "list of 2 items".
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('marks the last crumb as the current page and does not link to it', () => {
    render(
      <Breadcrumbs
        crumbs={[
          { label: 'Campaigns', href: '/campaigns' },
          { label: 'Spring launch' },
        ]}
      />,
    );
    const current = screen.getByText('Spring launch');
    expect(current).toHaveAttribute('aria-current', 'page');
    // A link to the page you are on is a dead control.
    expect(current.closest('a')).toBeNull();
    expect(screen.getByRole('link', { name: 'Campaigns' })).toBeInTheDocument();
  });
});

describe('Pagination', () => {
  it('is a nav landmark and marks the current page', () => {
    render(<Pagination page={2} pageCount={5} onPageChange={() => {}} />);
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
    expect(screen.getByText('Current page, page 2')).toBeInTheDocument();
  });

  it('spells out the page number for assistive tech rather than showing only "3"', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={2} pageCount={5} onPageChange={onPageChange} />);
    // The visual glyph is aria-hidden; the real name is in the sr-only span,
    // and it must be the WHOLE name — a leading comma meant to join it to the
    // visible digit gets announced as a leading comma.
    await user.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('names the current page position explicitly', () => {
    render(<Pagination page={2} pageCount={5} onPageChange={() => {}} />);
    expect(screen.getByText('Current page, page 2')).toBeInTheDocument();
  });

  it('marks the current page with aria-current, not only with words', () => {
    // The words "Current page, page 2" are read out, but a screen reader also
    // uses aria-current to expose position. Asserting only the text left the
    // attribute untested — the adversarial self-test found this by mutating
    // aria-current and watching the suite stay green.
    render(<Pagination page={2} pageCount={5} onPageChange={() => {}} />);
    // getByText resolves to the inner sr-only span; aria-current is on its
    // wrapper, so climb to it.
    expect(screen.getByText('Current page, page 2').closest('[aria-current]')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('disables the edges without hiding the current-page indicator', () => {
    const { rerender } = render(<Pagination page={1} pageCount={3} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();

    rerender(<Pagination page={3} pageCount={3} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    // A disabled current-page button would be skipped entirely by some screen
    // readers, so the position indicator has to survive.
    expect(screen.getByText('Current page, page 3')).toBeInTheDocument();
  });
});

describe('Separator', () => {
  it('is a real separator element', () => {
    render(<Separator label="Section break" />);
    expect(screen.getByRole('separator', { name: 'Section break' })).toBeInTheDocument();
  });
});
