import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field } from '../primitives/Field.js';
import { Button, IconButton } from '../primitives/Button.js';
import { Input, Textarea } from '../primitives/Input.js';
import { Checkbox, Progress, RadioGroup, Switch } from '../primitives/Controls.js';
import { Alert, Avatar, Badge, Kbd, SkipLink, Spinner, StatusPill } from '../primitives/Display.js';
import { size } from '../tokens.js';

/**
 * These assert the specific accessibility properties claimed in each
 * component's doc comment. Each one exists because that property is a common
 * regression: it is the kind of thing that is correct until someone adds an
 * icon, changes a wrapper div to a span, or reaches for aria-label out of
 * habit.
 */

describe('Field — label and description wiring', () => {
  const withInput = (props: Partial<React.ComponentProps<typeof Field>> = {}) =>
    render(
      <Field label="Email address" {...props}>
        {(p) => <Input {...p} />}
      </Field>,
    );

  it('associates the label with the control via a real for/id pair', () => {
    withInput();
    const input = screen.getByLabelText('Email address');
    expect(input).toBeInTheDocument();
    // A <label for> points at the element, so the association is native and
    // survives a click.
    const label = screen.getByText('Email address').closest('label');
    expect(label).toHaveAttribute('for', input.id);
  });

  it('clicking the label focuses the control', async () => {
    const user = userEvent.setup();
    withInput();
    await user.click(screen.getByText('Email address'));
    expect(screen.getByLabelText('Email address')).toHaveFocus();
  });

  it('wires help text into aria-describedby', () => {
    withInput({ help: 'We never share this.' });
    const input = screen.getByLabelText('Email address');
    const described = input.getAttribute('aria-describedby');
    expect(described).toBeTruthy();
    expect(document.getElementById(described!)).toHaveTextContent('We never share this.');
  });

  it('announces the error and marks the control invalid', () => {
    withInput({ error: 'Enter a valid email address.' });
    const input = screen.getByLabelText('Email address');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const described = input.getAttribute('aria-describedby');
    expect(document.getElementById(described!)).toHaveTextContent('Enter a valid email address.');
  });

  it('keeps the error reachable even though help is suppressed', () => {
    // Help is hidden while an error shows. The error must still be described.
    withInput({ help: 'We never share this.', error: 'Required.' });
    const described = screen.getByLabelText('Email address').getAttribute('aria-describedby')!;
    const texts = described
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    expect(texts).toContain('Required.');
  });

  it('does NOT disable the control when invalid', () => {
    // A disabled control leaves the tab order and the accessibility tree, so a
    // user cannot find the field they are being told is wrong.
    withInput({ error: 'Required.' });
    expect(screen.getByLabelText('Email address')).toBeEnabled();
  });

  it('marks a required field with aria-required', () => {
    render(
      <Field label="Business name" required>
        {(p) => <Input {...p} />}
      </Field>,
    );
    expect(screen.getByLabelText(/Business name/)).toHaveAttribute('aria-required', 'true');
  });

  it('generates unique ids so two fields on a page do not collide', () => {
    render(
      <>
        <Field label="First" help="a">
          {(p) => <Input {...p} />}
        </Field>
        <Field label="Last" help="b">
          {(p) => <Input {...p} />}
        </Field>
      </>,
    );
    const boxes = screen.getAllByRole('textbox');
    expect(boxes).toHaveLength(2);
    const a = boxes[0]!;
    const b = boxes[1]!;
    expect(a.id).not.toBe(b.id);
    expect(a.getAttribute('aria-describedby')).not.toBe(b.getAttribute('aria-describedby'));
  });
});

describe('Button — semantics follow the element', () => {
  it('renders a button and defaults to type="button"', () => {
    render(<Button>Save</Button>);
    // A bare <button> in a form submits it, turning every secondary action in a
    // form into an unintended submit.
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('renders an anchor with an accessible role of link when given href', () => {
    render(<Button href="/reports">View reports</Button>);
    // Not a button: a navigation control must announce that it navigates.
    expect(screen.getByRole('link', { name: 'View reports' })).toHaveAttribute('href', '/reports');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('uses content-on-solid, never content-inverse, on a solid fill', () => {
    // The regression this guards: in dark mode --ds-content-inverse resolves to
    // neutral-900, which put dark text on saturated 600 fills at 3.70:1 (danger)
    // and 4.36:1 (info). The one dark `.solid` override had to go, and with it
    // any dependence on `inverse` for a saturated background.
    render(<Button variant="solid">Go</Button>);
    const style = screen.getByRole('button', { name: 'Go' }).getAttribute('style') ?? '';
    expect(style).toContain('--ds-content-on-solid');
    expect(style).not.toContain('--ds-content-inverse');
  });

  it('uses content-on-solid on a danger fill too', () => {
    // danger is the pair that actually failed the gate, so it gets its own
    // assertion rather than being covered by the brand case.
    render(<Button variant="danger">Delete</Button>);
    const style = screen.getByRole('button', { name: 'Delete' }).getAttribute('style') ?? '';
    expect(style).toContain('--ds-content-on-solid');
    expect(style).not.toContain('--ds-content-inverse');
  });

  it('IconButton requires a label and exposes it as the accessible name', () => {
    render(<IconButton label="Close dialog">✕</IconButton>);
    // Without the label this is an empty button to a screen reader.
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
  });

  it('marks a loading button aria-busy and aria-disabled without removing it from the tab order', () => {
    render(<Button loading>Saving</Button>);
    const btn = screen.getByRole('button', { name: 'Saving' });
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled, not the disabled attribute: a disabled button is removed
    // from the tab order, so a user who triggers a save cannot reach it to
    // cancel.
    expect(btn).not.toBeDisabled();
  });
});

describe('Checkbox, Switch, RadioGroup', () => {
  it('Checkbox exposes a native checkbox with a label', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Email me product updates" />);
    const box = screen.getByRole('checkbox', { name: 'Email me product updates' });
    await user.click(box);
    expect(box).toBeChecked();
  });

  it('Checkbox toggles with the Space key', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Agree" />);
    const box = screen.getByRole('checkbox', { name: 'Agree' });
    await user.tab();
    expect(box).toHaveFocus();
    await user.keyboard(' ');
    expect(box).toBeChecked();
  });

  it('Switch is a switch role, not a checkbox', () => {
    render(<Switch label="Dark mode" />);
    expect(screen.getByRole('switch', { name: 'Dark mode' })).toBeInTheDocument();
  });

  it('RadioGroup renders a legend and radios in one group', async () => {
    const user = userEvent.setup();
    render(
      <RadioGroup
        legend="Billing cycle"
        defaultValue="monthly"
        options={[
          { value: 'monthly', label: 'Monthly' },
          { value: 'annual', label: 'Annual' },
        ]}
      />,
    );
    const group = screen.getByRole('radiogroup');
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Monthly' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Annual' }));
    expect(screen.getByRole('radio', { name: 'Annual' })).toBeChecked();
  });
});

describe('Progress', () => {
  it('exposes progressbar semantics with an accessible name', () => {
    render(<Progress value={45} label="Import progress" />);
    const bar = screen.getByRole('progressbar', { name: 'Import progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '45');
  });

  it('clamps an out-of-range value instead of rendering a broken bar', () => {
    render(<Progress value={140} label="Overflow" showValue />);
    expect(screen.getByRole('progressbar', { name: 'Overflow' })).toHaveAttribute('aria-valuenow', '100');
  });
});

describe('non-interactive primitives', () => {
  it('Spinner is not announced as a bare image', () => {
    render(<Spinner label="Loading dashboard" />);
    expect(screen.getByText('Loading dashboard')).toBeInTheDocument();
  });

  it('Badge does not rely on colour alone for status', () => {
    render(<StatusPill tone="danger" dotLabel="Connection">Failed</StatusPill>);
    // The text is present AND the dot is labelled, so the status is never
    // carried by colour alone (WCAG 1.4.1).
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText(/Connection:/)).toBeInTheDocument();
  });

  it('Avatar names the person once', () => {
    render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toBeInTheDocument();
  });

  it('Alert defaults to role="note" and only becomes assertive when asked', () => {
    const { rerender } = render(<Alert tone="danger">Sync failed</Alert>);
    expect(screen.getByRole('note')).toBeInTheDocument();
    rerender(
      <Alert tone="danger" live="assertive">
        Sync failed
      </Alert>,
    );
    // role="alert" implies aria-live="assertive"; setting both is the safe form.
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('SkipLink is focusable, not display:none', () => {
    render(<SkipLink />);
    const link = screen.getByRole('link', { name: /skip to main content/i });
    // display:none would remove it from the tab order, making it not a skip link.
    expect(link).toHaveAttribute('href', '#main');
    expect(link).not.toHaveStyle({ display: 'none' });
  });

  it('Kbd renders a real <kbd> element with the keys joined', () => {
    render(<Kbd keys={['Ctrl', 'K']} />);
    // The text is split across the kbd and an aria-hidden separator, so a
    // getByText('Ctrl') cannot match. Assert on the element's own content.
    const kbd = document.querySelector('kbd');
    expect(kbd).toBeInTheDocument();
    expect(kbd).toHaveTextContent('Ctrl+K');
  });

  it('Textarea forwards the invalid state', () => {
    render(<Field label="Notes" error="Too long.">{(p) => <Textarea {...p} />}</Field>);
    expect(screen.getByLabelText('Notes')).toHaveAttribute('aria-invalid', 'true');
  });
});
