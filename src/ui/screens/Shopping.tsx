import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { CalendarDays, Check, ChevronDown, Copy, Plus, Share2, WifiOff, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { Food, ManualItem } from '@/core/model';
import { WEEKDAY_SHORT, weekdayIndex } from '@/core/dates';
import { listAsText, type ShoppingItem } from '@/core/shopping';
import { SECTION_LABELS, STORES } from '@/data/foods';
import { useHousehold } from '@/store/store';
import { useNow } from '@/store/now';
import { actions } from '@/store/actions';
import { ctxOf, currentWeek, shoppingFor, type Ctx } from '@/store/selectors';
import { t } from '@/i18n/en';
import { Button } from '../components/Button';
import { Badge, Chip } from '../components/Chip';
import { EmptyState, useOnline, useToast } from '../components/Feedback';

// ---------------------------------------------------------------------------------------------------
// Local helpers (presentation only; the numbers come from src/core/shopping.ts)
// ---------------------------------------------------------------------------------------------------

const MEAL_ORDER = ['breakfast', 'morning snack', 'pranzo', 'afternoon snack', 'cena'];

function mealWord(meal: string): string {
  if (meal === 'pranzo') return t.meals.pranzo.toLowerCase();
  if (meal === 'cena') return t.meals.cena.toLowerCase();
  return meal;
}

/** "Tue lunch · Couscous with chickpeas" — one line per occasion, deduplicated across plates. */
function whyLines(item: ShoppingItem): string[] {
  const seen = new Map<string, ShoppingItem['why'][number]>();
  for (const w of item.why) seen.set(`${w.date}|${w.meal}|${w.dish ?? ''}`, w);
  return [...seen.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || MEAL_ORDER.indexOf(a.meal) - MEAL_ORDER.indexOf(b.meal))
    .map((w) => `${WEEKDAY_SHORT[weekdayIndex(w.date)]} ${mealWord(w.meal)}${w.dish ? ` · ${w.dish}` : ''}`);
}

function packText(n: number, unitLabel: string): string {
  // "1 mela" / "1 banana" style labels read better as "3 × mela" than "3 × 1 mela".
  const bare = unitLabel.startsWith('1 ') ? unitLabel.slice(2) : null;
  if (bare) return n === 1 ? `1 ${bare}` : `${n} × ${bare}`;
  return `${n} × ${unitLabel}`;
}

/** What to put in the basket, in the words she reads on the shelf. */
function buyText(item: ShoppingItem, food: Food | undefined): string {
  if (item.toBuyG > 0) {
    if (item.buy) {
      if (item.buy.unitLabel.startsWith('al banco')) return `${item.toBuyG} g al banco`;
      return packText(item.buy.n, item.buy.unitLabel);
    }
    if (item.pieces) return item.pieces === 1 ? '1 piece' : `${item.pieces} pieces`;
    return `${item.toBuyG} g`;
  }
  if (item.haveIt) return 'already have';
  // Bought: reconstruct the packs from what the check recorded.
  const unit = food?.purchaseUnits[0];
  if (
    unit &&
    !unit.label.startsWith('al banco') &&
    item.purchasedCoveredG > 0 &&
    item.purchasedCoveredG % unit.usableG === 0
  ) {
    return `${t.shopping.bought} · ${packText(item.purchasedCoveredG / unit.usableG, unit.label)}`;
  }
  return `${t.shopping.bought} · ${item.purchasedCoveredG} g`;
}

function weekLabel(monday: string): string {
  return new Date(`${monday}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

function storeShortName(name: string): string {
  return name.split(/[\s(]/)[0] ?? name;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea method (older WebViews, insecure contexts).
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

const isDone = (i: ShoppingItem) => i.checked || i.haveIt;

// ---------------------------------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------------------------------

export function ShoppingScreen() {
  const h = useHousehold();
  const now = useNow();
  const ctx = ctxOf(h);
  const week = currentWeek(h, now);
  const online = useOnline();
  const toast = useToast();
  const [openKey, setOpenKey] = useState<string | null>(null);

  const list = week ? shoppingFor(ctx, week) : null;
  const empty = !week || !list || (list.items.length === 0 && list.manual.length === 0);

  if (!week || !list || empty) {
    return (
      <div className="space-y-4">
        <Header />
        <EmptyState
          title={t.shopping.empty}
          body={
            week
              ? `Week of ${weekLabel(week.monday)} has no meals planned yet.`
              : 'Stasera drafts the week, then turns it into packs in the order you walk the store.'
          }
          action={
            <Link to="/week" className="contents">
              <Button variant="primary" size="lg" icon={<CalendarDays size={18} />}>
                {t.week.title}
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const { lines, checked } = list.totals;
  const pct = lines ? Math.round((checked / lines) * 100) : 0;
  const text = () => listAsText(list, ctx.foodMap, (s) => SECTION_LABELS[s].it);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    const ok = await copyText(text());
    toast(ok ? t.shopping.copied : 'Could not copy on this phone.', ok ? 'ok' : 'error');
  };
  const share = async () => {
    try {
      await navigator.share({ title: `Spesa — week of ${weekLabel(week.monday)}`, text: text() });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      toast('Sharing is not available here; the list was copied instead.', 'info');
      await copyText(text());
    }
  };

  const toggleItem = (item: ShoppingItem) => {
    if (item.checked) actions.uncheckItem(week.id, item);
    else if (item.haveIt) actions.setPantry(item.foodId, (h.pantry[item.foodId] ?? 0) - item.pantryDeductedG);
    else actions.checkItem(week.id, item);
  };

  // Walk order: sections, then the fresh run; done rows sink to the cart group in that same order.
  const pendingSections = list.sections
    .map((s) => ({ section: s.section, items: s.items.filter((i) => !isDone(i)) }))
    .filter((s) => s.items.length > 0);
  const pendingFresh = list.freshRun.filter((i) => !isDone(i));
  const cartItems = [...list.sections.flatMap((s) => s.items), ...list.freshRun].filter(isDone);
  const pendingManual = list.manual.filter((m) => !m.checked);
  const cartManual = list.manual.filter((m) => m.checked);
  const staples = [...list.staplesUsed, ...list.items.filter((i) => i.staple).map((i) => i.foodId)];

  const rowProps = { ctx, openKey, setOpenKey, onToggle: toggleItem };

  return (
    <div className="space-y-5">
      <Header>
        <p className="mt-1 text-sm text-muted">Week of {weekLabel(week.monday)}</p>
        <div className="mt-3 flex items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={lines}
            aria-valuenow={checked}
            aria-label={t.shopping.inCart}
          >
            <div className="h-full rounded-full bg-olive transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm tabular-nums text-ink-2">
            <span className="font-semibold text-ink">{checked}</span>/{lines}{' '}
            {t.shopping.inCart.toLowerCase()}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" icon={<Copy size={16} />} onClick={copy}>
            {t.shopping.copy}
          </Button>
          {canShare && (
            <Button size="sm" icon={<Share2 size={16} />} onClick={share}>
              {t.shopping.share}
            </Button>
          )}
        </div>
      </Header>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label={t.shopping.store}>
        {STORES.map((s) => (
          <Chip
            key={s.id}
            selected={h.prefs.store === s.id}
            onClick={() => actions.setPrefs({ store: s.id })}
            title={s.name}
            className="shrink-0"
          >
            {storeShortName(s.name)}
          </Chip>
        ))}
      </div>

      {!online && (
        <p
          className="flex items-center gap-2 rounded-2xl bg-surface-2 px-3 py-2 text-sm text-muted"
          role="status"
        >
          <WifiOff size={16} /> {t.shopping.offline}
        </p>
      )}

      {pendingSections.map((s) => (
        <SectionCard
          key={s.section}
          title={SECTION_LABELS[s.section].en}
          subtitle={SECTION_LABELS[s.section].it}
        >
          <ul>
            {s.items.map((item) => (
              <Row key={item.key} item={item} {...rowProps} />
            ))}
          </ul>
        </SectionCard>
      ))}

      {pendingFresh.length > 0 && (
        <SectionCard
          title={t.shopping.freshRun}
          subtitle="Spesa fresca"
          hint="Bread and leaves bought Sunday don't last; buy these Wednesday or Thursday."
        >
          <ul>
            {pendingFresh.map((item) => (
              <Row key={item.key} item={item} {...rowProps} showSection />
            ))}
          </ul>
        </SectionCard>
      )}

      <ExtrasCard weekId={week.id} items={pendingManual} />

      {staples.length > 0 && <StaplesCard ctx={ctx} foodIds={staples} />}

      {(cartItems.length > 0 || cartManual.length > 0) && (
        <SectionCard title={t.shopping.inCart} subtitle="Nel carrello">
          <ul>
            {cartItems.map((item) => (
              <Row key={item.key} item={item} {...rowProps} inCart />
            ))}
            {cartManual.map((m) => (
              <ManualRow key={m.id} item={m} weekId={week.id} />
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="safe-top px-1 pt-2">
      <h1 className="text-3xl font-semibold">{t.shopping.title}</h1>
      {children}
    </header>
  );
}

function SectionCard({
  title,
  subtitle,
  hint,
  children,
}: {
  title: string;
  subtitle?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card px-3 pb-1 pt-3" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {subtitle && <span className="shrink-0 text-sm text-muted">{subtitle}</span>}
      </div>
      {hint && <p className="mt-0.5 px-1 text-sm text-muted">{hint}</p>}
      <div className="mt-1">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------------

function Row({
  ctx,
  item,
  openKey,
  setOpenKey,
  onToggle,
  inCart = false,
  showSection = false,
}: {
  ctx: Ctx;
  item: ShoppingItem;
  openKey: string | null;
  setOpenKey: (k: string | null) => void;
  onToggle: (item: ShoppingItem) => void;
  inCart?: boolean;
  showSection?: boolean;
}) {
  const food = ctx.foodMap.get(item.foodId);
  const done = isDone(item);
  const panelId = `why-${item.run}-${item.key}`;
  const open = openKey === panelId;
  const nameIt = food?.nameIt ?? item.foodId;
  const nameEn = food?.nameEn;

  return (
    <li className="border-b border-line last:border-b-0">
      <div className="flex items-stretch">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          onClick={() => onToggle(item)}
          className="tap flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2.5 pl-1 text-left active:bg-surface-2"
        >
          <span
            aria-hidden="true"
            className={clsx(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition',
              done ? 'border-olive bg-olive text-white' : 'border-line bg-surface',
            )}
          >
            {done && <Check size={14} strokeWidth={3} />}
          </span>
          <span className="min-w-0 flex-1">
            <span
              id={`${panelId}-name`}
              className={clsx('block leading-snug', done && 'line-through decoration-muted/70')}
            >
              <span className={clsx('font-semibold', done ? 'text-muted' : 'text-ink')}>{nameIt}</span>
              {nameEn && nameEn.toLowerCase() !== nameIt.toLowerCase() && (
                <span className="text-muted"> {nameEn}</span>
              )}
            </span>
            <span
              className={clsx(
                'mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm tabular-nums',
                done ? 'text-muted' : 'text-ink-2',
              )}
            >
              <span>{buyText(item, food)}</span>
              {!done && item.pantryDeductedG > 0 && (
                <span className="text-muted">· {item.pantryDeductedG} g from the pantry</span>
              )}
              {item.estimate && !done && <Badge>{t.shopping.estimate}</Badge>}
              {item.staple && !done && <Badge tone="warn">{t.shopping.runningLow}</Badge>}
              {showSection && <span className="text-muted">· {SECTION_LABELS[item.section].it}</span>}
            </span>
          </span>
        </button>
        <button
          type="button"
          aria-label={t.shopping.why}
          aria-describedby={`${panelId}-name`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpenKey(open ? null : panelId)}
          className="tap -mr-1 flex w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2"
        >
          <ChevronDown size={20} className={clsx('transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {open && (
        <WhyPanel
          id={panelId}
          item={item}
          nameIt={nameIt}
          pantryG={ctx.h.pantry[item.foodId] ?? 0}
          inCart={inCart}
          onClose={() => setOpenKey(null)}
        />
      )}
    </li>
  );
}

function WhyPanel({
  id,
  item,
  nameIt,
  pantryG,
  inCart,
  onClose,
}: {
  id: string;
  item: ShoppingItem;
  nameIt: string;
  pantryG: number;
  inCart: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [pantryOpen, setPantryOpen] = useState(false);
  const [grams, setGrams] = useState(String(pantryG));
  const why = whyLines(item);
  const inputId = `${id}-pantry`;

  const savePantry = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(grams);
    if (!Number.isFinite(n) || n < 0) {
      toast('Enter the grams you have, 0 or more.', 'error');
      return;
    }
    actions.setPantry(item.foodId, n);
    toast(n > 0 ? `${nameIt}: ${Math.round(n)} g in the pantry.` : `${nameIt}: nothing in the pantry.`, 'ok');
    setPantryOpen(false);
    onClose();
  };

  return (
    <div id={id} className="mb-2 ml-9 rounded-2xl bg-surface-2 p-3 text-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Needed for</p>
      {why.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-ink-2">
          {why.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-ink-2">Flagged as running low.</p>
      )}
      <p className="mt-2 tabular-nums text-muted">
        Needs {item.demandG} g{item.pantryDeductedG > 0 && ` · ${item.pantryDeductedG} g from the pantry`}
        {item.purchasedCoveredG > 0 && ` · ${item.purchasedCoveredG} g ${t.shopping.bought}`}
        {item.buy && item.buy.leftoverG > 0 && ` · ${item.buy.leftoverG} g left over`}
        {pantryG > 0 && item.pantryDeductedG === 0 && ` · ${pantryG} g in the pantry`}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {!inCart && (
          <Button
            size="sm"
            onClick={() => {
              actions.haveIt(item);
              toast(`${nameIt}: moved to the cart from the pantry.`, 'ok');
              onClose();
            }}
          >
            {t.shopping.haveIt}
          </Button>
        )}
        <Button size="sm" onClick={() => setPantryOpen((v) => !v)} aria-expanded={pantryOpen}>
          Set pantry amount
        </Button>
        {item.staple && (
          <Button
            size="sm"
            onClick={() => {
              actions.toggleRunningLow(item.foodId);
              toast(`${nameIt}: back among the staples.`, 'ok');
              onClose();
            }}
          >
            Not running low
          </Button>
        )}
      </div>
      {pantryOpen && (
        <form className="mt-2 flex items-center gap-2" onSubmit={savePantry}>
          <label htmlFor={inputId} className="text-ink-2">
            In the pantry
          </label>
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={0}
            step={10}
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="tap w-24 rounded-xl border border-line bg-surface px-3 py-2 text-right tabular-nums"
            autoFocus
          />
          <span className="text-muted">g</span>
          <Button size="sm" variant="primary" type="submit">
            {t.common.save}
          </Button>
        </form>
      )}
    </div>
  );
}

function ManualRow({ item, weekId }: { item: ManualItem; weekId: string }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <div className="flex items-stretch">
        <button
          type="button"
          role="checkbox"
          aria-checked={item.checked}
          onClick={() => actions.toggleManual(weekId, item.id)}
          className="tap flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2.5 pl-1 text-left active:bg-surface-2"
        >
          <span
            aria-hidden="true"
            className={clsx(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition',
              item.checked ? 'border-olive bg-olive text-white' : 'border-line bg-surface',
            )}
          >
            {item.checked && <Check size={14} strokeWidth={3} />}
          </span>
          <span
            className={clsx(
              'min-w-0 flex-1 leading-snug',
              item.checked ? 'text-muted line-through decoration-muted/70' : 'text-ink',
            )}
          >
            {item.text}
          </span>
        </button>
        <button
          type="button"
          aria-label={`Remove ${item.text}`}
          onClick={() => actions.removeManual(weekId, item.id)}
          className="tap -mr-1 flex w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2"
        >
          <X size={18} />
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------------------------------
// Extras and staples
// ---------------------------------------------------------------------------------------------------

function ExtrasCard({ weekId, items }: { weekId: string; items: ManualItem[] }) {
  const [text, setText] = useState('');
  const add = (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    actions.addManual(weekId, v);
    setText('');
  };
  return (
    <SectionCard title={t.shopping.extras} subtitle="Altro">
      {items.length > 0 && (
        <ul>
          {items.map((m) => (
            <ManualRow key={m.id} item={m} weekId={weekId} />
          ))}
        </ul>
      )}
      <form className="flex items-center gap-2 py-2" onSubmit={add}>
        <label htmlFor="extra-input" className="sr-only">
          {t.shopping.addExtra}
        </label>
        <input
          id="extra-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Dish soap, coffee…"
          enterKeyHint="done"
          autoComplete="off"
          className="tap min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-2 placeholder:text-muted"
        />
        <Button type="submit" variant="primary" icon={<Plus size={16} />} disabled={!text.trim()}>
          Add
        </Button>
      </form>
    </SectionCard>
  );
}

function StaplesCard({ ctx, foodIds }: { ctx: Ctx; foodIds: string[] }) {
  const [open, setOpen] = useState(false);
  const low = new Set(ctx.h.prefs.runningLow);
  const foods = foodIds.map((id) => ctx.foodMap.get(id)).filter((f): f is Food => !!f);
  const names = foods.map((f) => f.nameIt).join(', ');
  return (
    <section className="card px-3 py-1" aria-label={t.shopping.staples}>
      <button
        type="button"
        className="tap flex w-full items-center justify-between gap-3 rounded-xl px-1 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="staples-list"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">
            {t.shopping.staples} <span className="font-normal text-muted">· {foods.length}</span>
          </span>
          {!open && <span className="block truncate text-sm text-muted">{names}</span>}
        </span>
        <ChevronDown
          size={20}
          className={clsx('shrink-0 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div id="staples-list" className="px-1 pb-2">
          <p className="mb-2 text-sm text-muted">
            In the pantry already; tap when one is running low and it joins the list.
          </p>
          <ul className="divide-y divide-line">
            {foods.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 leading-snug">
                  <span className="font-medium text-ink">{f.nameIt}</span>
                  {f.nameEn.toLowerCase() !== f.nameIt.toLowerCase() && (
                    <span className="text-muted"> {f.nameEn}</span>
                  )}
                </span>
                <Chip
                  selected={low.has(f.id)}
                  tone="warn"
                  onClick={() => actions.toggleRunningLow(f.id)}
                  className="shrink-0"
                >
                  {t.shopping.runningLow}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
