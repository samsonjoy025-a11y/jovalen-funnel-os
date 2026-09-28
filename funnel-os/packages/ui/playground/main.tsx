/**
 * The primitives gallery.
 *
 * This is NOT the application. There is no application yet — no router, no
 * server, no data. What exists is 26 of the plan's 39 design-system
 * primitives, and this page exists so they can be seen and operated in a real
 * browser rather than only asserted against in jsdom.
 *
 * What jsdom cannot tell you, and what this page can:
 *   - whether a focus ring is actually visible against its own background
 *   - whether a hover state fires at all
 *   - whether the dark theme is legible
 *   - whether anything reflows when text is long
 *
 * Both themes render side by side. Judging a dark theme means seeing it next
 * to the light one; with a toggle you end up comparing against memory.
 */

import * as React from 'react';
import { createRoot } from 'react-dom/client';

// The token stylesheet must come first: it defines the --ds-* variables that
// the interaction rules in ui/styles.css refer to. Note the subpath is
// `tokens.css`, not `styles.css`.
import '@funnelos/tokens/tokens.css';
import '@funnelos/ui/styles.css';
import './playground.css';

import {
  Alert,
  Avatar,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  Dialog,
  Field,
  IconButton,
  Input,
  Kbd,
  Pagination,
  Progress,
  RadioGroup,
  SegmentedControl,
  Separator,
  Skeleton,
  SkipLink,
  Spinner,
  StatusPill,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
  VisuallyHidden,
  type Crumb,
  type TabDefinition,
} from '../src/index.js';

/* -- small helpers --------------------------------------------------------- */

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="pg__section">
      <h2>{title}</h2>
      {note ? <p className="pg__note">{note}</p> : null}
      {children}
    </section>
  );
}

function Row({
  align = 'center',
  children,
}: {
  align?: 'center' | 'start';
  children: React.ReactNode;
}): React.ReactElement {
  return <div className={align === 'start' ? 'pg__row pg__row--start' : 'pg__row'}>{children}</div>;
}

const tones = ['neutral', 'brand', 'success', 'warning', 'danger', 'info'] as const;

/* -- the parts that need state --------------------------------------------- */

function DialogDemo(): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Row>
        <Button onClick={() => setOpen(true)}>Open dialog</Button>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Open a non-dismissible confirmation
        </Button>
      </Row>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this campaign?"
        description="The campaign, its 14 ad sets and their history are removed. This cannot be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setOpen(false)}>
              Delete campaign
            </Button>
          </>
        }
      >
        <p className="pg__note">
          Tab and Shift+Tab cycle inside this box and cannot reach the page behind it. Press
          Escape, then check that focus lands back on the button you opened it from — that last
          part is the one that is usually broken.
        </p>
      </Dialog>
    </>
  );
}

function TabsDemo(): React.ReactElement {
  const tabs: readonly TabDefinition[] = [
    { value: 'summary', label: 'Summary', content: 'Spend, clicks and conversions for the period.' },
    { value: 'creatives', label: 'Creatives', content: 'The twelve assets currently running.' },
    { value: 'audience', label: 'Audience', content: 'Segments, sizes and overlap.' },
    { value: 'history', label: 'History', content: 'Edits, disabled: needs a data source.', disabled: true },
  ];
  return (
    <Tabs tabs={tabs} defaultValue="summary" label="Campaign detail sections" />
  );
}

function SelectionDemo(): React.ReactElement {
  const [checked, setChecked] = React.useState(true);
  const [on, setOn] = React.useState(false);
  const [plan, setPlan] = React.useState('growth');
  const [range, setRange] = React.useState('30d');

  return (
    <div className="pg__stack">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => setChecked(v === true)}
        label="Include archived campaigns"
        description="Archived campaigns keep their history but stop reporting."
      />
      <Switch checked={on} onCheckedChange={setOn} label="Pause on budget exhaustion" />
      <RadioGroup
        legend="Billing plan"
        value={plan}
        onValueChange={setPlan}
        options={[
          { value: 'starter', label: 'Starter' },
          { value: 'growth', label: 'Growth', description: 'Most teams start here.' },
          { value: 'scale', label: 'Scale' },
          { value: 'enterprise', label: 'Enterprise', disabled: true },
        ]}
      />
      <SegmentedControl
        legend="Date range"
        value={range}
        onChange={setRange}
        options={[
          { value: '7d', label: '7 days' },
          { value: '30d', label: '30 days' },
          { value: '90d', label: '90 days' },
        ]}
      />
    </div>
  );
}

function PaginationDemo(): React.ReactElement {
  const [page, setPage] = React.useState(3);
  return <Pagination page={page} pageCount={8} onPageChange={setPage} />;
}

/* -- the gallery ----------------------------------------------------------- */

function Gallery(): React.ReactElement {
  return (
    <div className="pg__stack">
      <Section title="Buttons" note="Hover and focus each one. The focus ring is a token, not a value.">
        <Row>
          <Button>Solid</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Saving</Button>
          <Button href="https://example.com">Renders an anchor</Button>
        </Row>
        <Row>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </Row>
        <Row>
          <IconButton label="Refresh report">
            <span aria-hidden="true">⟳</span>
          </IconButton>
          <IconButton label="Edit campaign" variant="outline">
            <span aria-hidden="true">✎</span>
          </IconButton>
          <span className="pg__hit">
            <IconButton label="Settings" variant="ghost">
              <span aria-hidden="true">⚙</span>
            </IconButton>
          </span>
          <p className="pg__note">
            The dashed box shows the 24px minimum target. Every icon button is given an
            explicit label — there is no default, because an unlabelled icon button is an
            empty button to a screen reader.
          </p>
        </Row>
      </Section>

      <Section title="Fields" note="The error example is focusable on purpose. A disabled control is unreachable, so the user cannot reach the error that explains it.">
        <div className="pg__stack">
          <Field label="Campaign name" help="Shown to the client in weekly reports.">
            {(p) => <Input {...p} defaultValue="Spring launch" />}
          </Field>

          <Field label="Monthly budget" help="In whole pounds. Leave blank to use the default.">
            {(p) => <Input {...p} type="text" inputMode="numeric" defaultValue="2400" />}
          </Field>

          <Field label="Domain" error="That domain is already connected to another workspace.">
            {(p) => <Input {...p} defaultValue="jovalen.com" aria-required />}
          </Field>

          <Field label="Search" help="Type a name, or press / to focus this field from anywhere.">
            {(p) => (
              <Input
                {...p}
                type="search"
                placeholder="Search campaigns"
                leading={<span aria-hidden="true">⌕</span>}
              />
            )}
          </Field>

          <Field label="Notes">
            {(p) => <Textarea {...p} rows={3} defaultValue="Anything the operator should know." />}
          </Field>
        </div>
      </Section>

      <Section title="Selection" note="Radio groups and segmented controls announce which option is chosen and how many there are. Buttons would not.">
        <SelectionDemo />
      </Section>

      <Section title="Progress and status" note="A coloured dot never carries meaning alone; each has a text label beside it.">
        <div className="pg__stack">
          <Progress value={64} label="Monthly budget used" showValue />
          <Progress value={92} label="Pacing against target" showValue tone="warning" />
          <Progress value={18} label="Setup completion" tone="success" />
          <Row>
            {tones.map((t) => (
              <Badge key={t} tone={t}>
                {t}
              </Badge>
            ))}
          </Row>
          <Row>
            <StatusPill tone="success" dotLabel="Status">
              Live
            </StatusPill>
            <StatusPill tone="warning" dotLabel="Status">
              Paused
            </StatusPill>
            <StatusPill tone="danger" dotLabel="Status">
              Failed
            </StatusPill>
          </Row>
        </div>
      </Section>

      <Section title="Feedback">
        <div className="pg__stack">
          <Alert tone="info" title="Heads up" action={<Button size="sm">Dismiss</Button>}>
            Your trial ends in 6 days. Add a card to keep your history.
          </Alert>
          <Alert tone="warning" title="Budget is 92% spent" live="polite">
            Pacing suggests you will exceed the monthly cap by roughly £340.
          </Alert>
          <Alert tone="danger" title="Two ad sets failed to publish" live="assertive">
            Meta rejected both creatives. Check the image dimensions.
          </Alert>
          <Row>
            <Spinner label="Loading campaigns" />
            <Skeleton width={160} height={12} />
            <Skeleton lines={3} />
          </Row>
        </div>
      </Section>

      <Section title="Surfaces">
        <Row align="start">
          <Card>
            <h3 style={{ margin: '0 0 8px' }}>Flat card</h3>
            <p className="pg__note">The default. For content inside another surface.</p>
          </Card>
          <Card elevation="raised">
            <h3 style={{ margin: '0 0 8px' }}>Raised card</h3>
            <p className="pg__note">Lifts with a shadow. For something you act on.</p>
          </Card>
          <Card as="article" padding="none">
            <div style={{ padding: 16 }}>
              <h3 style={{ margin: '0 0 8px' }}>Rendered as an article</h3>
              <p className="pg__note">
                Inside a list, use <code>as=&quot;li&quot;</code> so the item count is right.
              </p>
            </div>
          </Card>
        </Row>
        <Separator label="End of surfaces" />
      </Section>

      <Section title="Navigation">
        <div className="pg__stack">
          <Breadcrumbs
            crumbs={[
              { label: 'Campaigns', href: '#' },
              { label: 'Spring launch', href: '#' },
              { label: 'Ad sets' },
            ]}
          />
          <TabsDemo />
          <PaginationDemo />
          <div className="pg__kbd-row">
            <Kbd keys={['Ctrl', 'K']} />
            <span className="pg__note">opens the command palette</span>
          </div>
        </div>
      </Section>

      <Section title="Overlays" note="Dialog, tooltip and the focus contract.">
        <div className="pg__stack">
          <DialogDemo />
          <Row>
            <Tooltip content="Re-runs the last query against the live API.">
              <Button variant="outline">Hover or focus me</Button>
            </Tooltip>
          </Row>
          <p className="pg__note">
            <VisuallyHidden>
              This sentence is in the accessibility tree and not on screen.
            </VisuallyHidden>
            <Avatar name="Samson Joy" size="md" />
            <Avatar name="Priya Raman" size="sm" />
            <Avatar name="Alex Whitfield" size="lg" />
          </p>
        </div>
      </Section>
    </div>
  );
}

function App(): React.ReactElement {
  return (
    <>
      <SkipLink />
      <div className="pg">
        <header className="pg__masthead">
          <div>
            <h1 className="pg__title">Jovalen — primitives gallery</h1>
            <p className="pg__lede">
              <strong>This is not the app.</strong> It is the Phase 1 design system — 26 of the
              plan&apos;s 39 primitives — rendered so they can be seen and operated. There is no
              login, no data and no server yet.
            </p>
            <p className="pg__disclaimer">
              Everything below is real, reachable by keyboard, and shown in both themes side by
              side.
            </p>
          </div>
        </header>

        <main id="main">
          <div className="pg__panels">
            <div className="pg__panel pg__panel--light" data-theme="light">
              <p className="pg__panel-label">Light theme</p>
              <Gallery />
            </div>
            <div className="pg__panel pg__panel--dark" data-theme="dark">
              <p className="pg__panel-label">Dark theme</p>
              <Gallery />
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

const host = document.getElementById('root');
if (!host) {
  throw new Error('#root is missing from index.html — the app has nothing to mount into');
}
createRoot(host).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
