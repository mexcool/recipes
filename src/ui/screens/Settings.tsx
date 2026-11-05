import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  FileJson,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import type { Food, Household, Question } from '@/core/model';
import { todayIso } from '@/core/dates';
import { useHousehold } from '@/store/store';
import { actions } from '@/store/actions';
import { ctxOf, type Ctx } from '@/store/selectors';
import { STORES } from '@/data/foods';
import { t } from '@/i18n/en';
import { Button } from '../components/Button';
import { Card, SectionTitle } from '../components/Card';
import { Badge, Chip } from '../components/Chip';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Feedback';
import { SyncCard } from '../components/SyncCard';

const INPUT =
  'tap w-full rounded-2xl border border-line bg-surface-2 px-4 py-2.5 text-[15px] text-ink placeholder:text-muted';

export function SettingsScreen() {
  const h = useHousehold();
  const ctx = ctxOf(h);
  return (
    <div className="space-y-6">
      <header className="safe-top px-1 pt-2">
        <h1 className="text-3xl font-semibold">{t.settings.title}</h1>
        <p className="text-sm text-muted">Household, plan, preferences and your data.</p>
      </header>
      <HouseholdSection h={h} />
      <PlanSection ctx={ctx} />
      <PrefsSection h={h} foods={ctx.foods} foodMap={ctx.foodMap} />
      <PantrySection h={h} foods={ctx.foods} foodMap={ctx.foodMap} />
      <QuestionsSection questions={h.questions} />
      <DataSection />
      <SyncSection h={h} />
      <AboutSection />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// 1. Household
// ---------------------------------------------------------------------------------------------

function HouseholdSection({ h }: { h: Household }) {
  return (
    <Section title={t.settings.household}>
      <Field label={t.settings.name}>
        <input
          key={h.name}
          className={INPUT}
          defaultValue={h.name}
          autoComplete="off"
          onKeyDown={blurOnEnter}
          onBlur={(e) => commitText(e.target.value, h.name, actions.setHouseholdName)}
        />
      </Field>
      <p className="mt-4 text-sm font-medium text-ink-2">{t.settings.members}</p>
      <ul className="divide-y divide-line">
        {h.members.map((m) => (
          <li key={m.id} className="py-3">
            <div className="flex items-center gap-2">
              <input
                key={m.name}
                className={clsx(INPUT, 'flex-1')}
                defaultValue={m.name}
                aria-label={`Name of ${m.name}`}
                autoComplete="off"
                onKeyDown={blurOnEnter}
                onBlur={(e) =>
                  commitText(e.target.value, m.name, (name) => actions.setMember(m.id, { name }))
                }
              />
              {m.constrained && <Badge tone="olive">On the plan</Badge>}
            </div>
            {!m.constrained && (
              <div className="mt-1">
                <Stepper
                  label={t.settings.multiplier}
                  value={m.multiplier}
                  min={0.5}
                  max={2.5}
                  step={0.1}
                  format={(v) => `×${v.toFixed(1)}`}
                  onChange={(multiplier) => actions.setMember(m.id, { multiplier })}
                />
                <p className="text-xs text-muted">Their plate = her plate × multiplier, same proportions.</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------
// 2. Diet plan
// ---------------------------------------------------------------------------------------------

function PlanSection({ ctx }: { ctx: Ctx }) {
  const { plan, rev } = ctx;
  const toast = useToast();
  const reviewed = rev.status === 'reviewed';
  return (
    <Section title={t.settings.plan}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight">{plan.name}</p>
          <p className="text-sm text-muted">
            {t.settings.revision} {rev.revision} · {rev.label} ·{' '}
            <span className="whitespace-nowrap">from {rev.validFrom}</span>
          </p>
        </div>
        <Badge tone={reviewed ? 'ok' : 'warn'} className="shrink-0 normal-case tracking-normal">
          {reviewed ? t.settings.reviewed : t.settings.draft}
        </Badge>
      </div>
      {rev.sourceNote && <p className="mt-2 text-sm text-muted">{rev.sourceNote}</p>}
      {!reviewed && (
        <Button
          className="mt-3"
          variant="primary"
          icon={<Check size={18} />}
          onClick={() => {
            actions.setRevisionStatus('reviewed');
            toast('Amounts marked as reviewed.', 'ok');
          }}
        >
          {t.settings.markReviewed}
        </Button>
      )}
      <div className="mt-4">
        <Field label={t.settings.nextAppointment}>
          <input
            type="date"
            className={INPUT}
            value={plan.nextAppointment ?? ''}
            onChange={(e) => actions.setNextAppointment(e.target.value || undefined)}
          />
        </Field>
      </div>
      <Link
        to="/settings/plan"
        className="tap mt-3 flex items-center justify-between gap-2 rounded-2xl bg-olive-soft/70 px-4 py-3 font-medium text-olive-2"
      >
        <span>{t.settings.amounts}</span>
        <ChevronRight size={20} />
      </Link>
      {rev.sourceDifferences.length > 0 && (
        <details className="mt-3 rounded-2xl border border-line">
          <summary className="tap flex cursor-pointer items-center px-4 py-3 text-[15px] font-medium text-ink-2">
            {t.settings.differences}
          </summary>
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-2 py-1 font-medium">Rule</th>
                  <th className="px-2 py-1 font-medium">Older</th>
                  <th className="px-2 py-1 font-medium">Newer</th>
                </tr>
              </thead>
              <tbody>
                {rev.sourceDifferences.map((d) => (
                  <tr key={d.rule} className="border-t border-line align-top">
                    <td className="px-2 py-1.5 text-ink-2">{d.rule}</td>
                    <td className="px-2 py-1.5 tabular-nums text-muted">{d.older}</td>
                    <td className="px-2 py-1.5 tabular-nums font-medium">{d.newer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {plan.revisions.length > 1 && (
        <p className="mt-3 text-xs text-muted">
          {plan.revisions.length} revisions. Weeks already planned keep the revision they were generated from.
        </p>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------
// 3. Preferences
// ---------------------------------------------------------------------------------------------

function PrefsSection({ h, foods, foodMap }: { h: Household; foods: Food[]; foodMap: Map<string, Food> }) {
  const p = h.prefs;
  return (
    <Section title={t.settings.prefs}>
      <div className="divide-y divide-line">
        <Switch
          checked={p.lunchbox}
          onChange={(lunchbox) => actions.setPrefs({ lunchbox })}
          label={t.settings.lunchbox}
          hint="Tonight shows tomorrow's lunch too, so you can pack it."
        />
        <Switch
          checked={p.splitFreshRun}
          onChange={(splitFreshRun) => actions.setPrefs({ splitFreshRun })}
          label={t.settings.freshRun}
          hint="Fresh produce for the second half of the week goes on a small second list."
        />
        <Switch
          checked={p.cookDouble}
          onChange={(cookDouble) => actions.setPrefs({ cookDouble })}
          label="Cook double once a week"
          hint="One dish that keeps well is cooked once and eaten again a day or two later; the list buys it once."
        />
        <div className="py-3">
          <p className="text-[15px] text-ink">{t.settings.store}</p>
          <p className="text-xs text-muted">Sets the order of the shopping list.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {STORES.map((s) => (
              <Chip key={s.id} selected={p.store === s.id} onClick={() => actions.setPrefs({ store: s.id })}>
                {s.name}
              </Chip>
            ))}
          </div>
        </div>
        <Stepper
          label={t.settings.vegEstimate}
          value={p.vegEstimateG}
          min={100}
          max={300}
          step={25}
          format={(v) => `${v} g`}
          onChange={(vegEstimateG) => actions.setPrefs({ vegEstimateG })}
        />
        <Stepper
          label="Weekday dinner, at most"
          hint="Longer dishes are kept for the weekend."
          value={p.maxMinutesWeekdayDinner}
          min={10}
          max={90}
          step={5}
          format={(v) => `${v} min`}
          onChange={(maxMinutesWeekdayDinner) => actions.setPrefs({ maxMinutesWeekdayDinner })}
        />
        <DislikesPicker dislikes={p.dislikes} foods={foods} foodMap={foodMap} />
      </div>
    </Section>
  );
}

function DislikesPicker({
  dislikes,
  foods,
  foodMap,
}: {
  dislikes: string[];
  foods: Food[];
  foodMap: Map<string, Food>;
}) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const selected = dislikes.map((id) => foodMap.get(id) ?? { id, nameEn: id, nameIt: id });
  const matches = query
    ? foods.filter((f) => !dislikes.includes(f.id) && foodMatches(f, query)).slice(0, 12)
    : [];
  const set = (next: string[]) => actions.setPrefs({ dislikes: next });
  return (
    <div className="py-3">
      <p className="text-[15px] text-ink">{t.settings.dislikes}</p>
      <p className="text-xs text-muted">The planner never puts these on a plate.</p>
      {selected.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {selected.map((f) => (
            <Chip
              key={f.id}
              tone="terra"
              onClick={() => set(dislikes.filter((x) => x !== f.id))}
              aria-label={`Allow ${f.nameEn} again`}
            >
              {f.nameEn} <X size={14} />
            </Chip>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink-2">Nothing excluded.</p>
      )}
      <div className="relative mt-2">
        <Search
          size={18}
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
        />
        <input
          className={clsx(INPUT, 'pl-11')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a food to exclude"
          aria-label="Search a food to exclude"
          autoComplete="off"
        />
      </div>
      {query && (
        <div className="mt-2 flex flex-wrap gap-2" aria-live="polite">
          {matches.length === 0 && <p className="text-sm text-muted">No food matches “{q.trim()}”.</p>}
          {matches.map((f) => (
            <Chip
              key={f.id}
              onClick={() => {
                set([...dislikes, f.id]);
                setQ('');
              }}
              aria-label={`Never use ${f.nameEn}`}
            >
              <Plus size={14} /> {f.nameEn}
              {f.nameIt !== f.nameEn && <span className="text-muted">· {f.nameIt}</span>}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function foodMatches(f: Food, q: string): boolean {
  return (
    f.nameEn.toLowerCase().includes(q) ||
    f.nameIt.toLowerCase().includes(q) ||
    f.aliases.some((a) => a.toLowerCase().includes(q))
  );
}

// ---------------------------------------------------------------------------------------------
// 4. Pantry
// ---------------------------------------------------------------------------------------------

function PantrySection({ h, foods, foodMap }: { h: Household; foods: Food[]; foodMap: Map<string, Food> }) {
  const entries = Object.entries(h.pantry).sort(([a], [b]) =>
    (foodMap.get(a)?.nameEn ?? a).localeCompare(foodMap.get(b)?.nameEn ?? b),
  );
  const low = new Set(h.prefs.runningLow);
  const staples = foods
    .filter((f) => f.staple || low.has(f.id))
    .sort((a, b) => a.nameEn.localeCompare(b.nameEn));
  return (
    <Section title={t.settings.pantry}>
      <p className="text-sm text-muted">
        Stock is deducted once from the next week's list; shelf-stable leftovers from pack rounding are added
        here automatically when you tick a purchase.
      </p>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">Nothing in stock yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {entries.map(([foodId, grams]) => (
            <PantryRow key={foodId} foodId={foodId} grams={grams} food={foodMap.get(foodId)} />
          ))}
        </ul>
      )}
      <h3 className="mt-5 text-[15px] font-medium text-ink">{t.shopping.runningLow}</h3>
      <p className="text-xs text-muted">Staples stay off the list until you flag them here.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {staples.map((f) => (
          <Chip key={f.id} selected={low.has(f.id)} onClick={() => actions.toggleRunningLow(f.id)}>
            {f.nameEn}
          </Chip>
        ))}
      </div>
    </Section>
  );
}

function PantryRow({ foodId, grams, food }: { foodId: string; grams: number; food: Food | undefined }) {
  const name = food?.nameEn ?? foodId;
  return (
    <li className="flex items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] text-ink">{name}</p>
        {food && food.nameIt !== food.nameEn && <p className="truncate text-xs text-muted">{food.nameIt}</p>}
      </div>
      <label className="flex items-center gap-1 text-sm text-muted">
        <input
          key={grams}
          type="number"
          inputMode="numeric"
          min={0}
          step={5}
          defaultValue={grams}
          aria-label={`${name} in stock, grams`}
          className={clsx(INPUT, 'w-24 text-right tabular-nums')}
          onKeyDown={blurOnEnter}
          onBlur={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= 0 && n !== grams) actions.setPantry(foodId, n);
          }}
        />
        g
      </label>
      <button
        type="button"
        className="tap -mr-2 flex items-center justify-center rounded-full text-muted hover:bg-surface-2"
        aria-label={`Remove ${name} from the pantry`}
        onClick={() => actions.setPantry(foodId, 0)}
      >
        <X size={20} />
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// 5. Questions for the nutritionist
// ---------------------------------------------------------------------------------------------

const SOURCE_LABEL: Record<Question['source'], { text: string; tone: 'neutral' | 'olive' | 'warn' }> = {
  validator: { text: 'From a dish check', tone: 'warn' },
  import: { text: 'From the import', tone: 'olive' },
  plan: { text: 'From the plan', tone: 'olive' },
  user: { text: 'Yours', tone: 'neutral' },
};

function QuestionsSection({ questions }: { questions: Question[] }) {
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const open = questions.filter((q) => !q.answered);
  const copyAll = async () => {
    const text = [
      `Questions for the nutritionist (${todayIso()})`,
      '',
      ...open.map((q, i) => `${i + 1}. ${q.text}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast(`${open.length} ${open.length === 1 ? 'question' : 'questions'} copied.`, 'ok');
    } catch {
      toast('Could not copy. Select the text and copy it by hand.', 'error');
    }
  };
  return (
    <Section title={t.settings.questions}>
      <p className="text-sm text-muted">
        Collected from dish checks and imports, plus anything you add. Take them to the next appointment.
      </p>
      {questions.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">Nothing to ask yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {questions.map((q) => (
            <QuestionRow key={q.id} q={q} />
          ))}
        </ul>
      )}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          actions.addQuestion(text);
          setDraft('');
          toast(t.recipes.questionAdded, 'ok');
        }}
      >
        <input
          className={clsx(INPUT, 'flex-1')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a question"
          aria-label="Add a question"
          autoComplete="off"
        />
        <Button type="submit" variant="primary" disabled={!draft.trim()} icon={<Plus size={18} />}>
          Add
        </Button>
      </form>
      <div className="mt-3">
        <Button icon={<Copy size={18} />} disabled={open.length === 0} onClick={() => void copyAll()}>
          Copy all
        </Button>
        {open.length === 0 && questions.length > 0 && (
          <p className="mt-1 text-xs text-muted">Every question has an answer.</p>
        )}
      </div>
    </Section>
  );
}

function QuestionRow({ q }: { q: Question }) {
  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState(q.answered ?? '');
  const src = SOURCE_LABEL[q.source];
  const save = () => {
    actions.answerQuestion(q.id, answer.trim() || undefined);
    setEditing(false);
  };
  return (
    <li className="py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] text-ink">{q.text}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone={src.tone}>{src.text}</Badge>
            <span className="text-xs text-muted">{q.createdAt.slice(0, 10)}</span>
          </div>
          {q.answered && !editing && (
            <p className="mt-2 rounded-2xl bg-ok-soft px-3 py-2 text-sm text-ok">
              <span className="font-medium">Answered:</span> {q.answered}
            </p>
          )}
        </div>
        <button
          type="button"
          className="tap -mr-2 flex items-center justify-center rounded-full text-muted hover:bg-surface-2"
          aria-label={`Remove question: ${q.text}`}
          onClick={() => actions.removeQuestion(q.id)}
        >
          <X size={20} />
        </button>
      </div>
      {editing ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            className={clsx(INPUT, 'flex-1')}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="What did the nutritionist say?"
            aria-label={`Answer to: ${q.text}`}
            autoFocus
          />
          <Button type="submit" variant="primary" size="sm">
            {t.common.save}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            {t.common.cancel}
          </Button>
        </form>
      ) : (
        <Button
          className="mt-2"
          size="sm"
          variant={q.answered ? 'ghost' : 'secondary'}
          onClick={() => setEditing(true)}
        >
          {q.answered ? 'Edit the answer' : 'Answered…'}
        </Button>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// 6. Your data
// ---------------------------------------------------------------------------------------------

function DataSection() {
  const toast = useToast();
  const importRef = useRef<HTMLInputElement>(null);
  const planRef = useRef<HTMLInputElement>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const exportJson = () => {
    const name = `stasera-${todayIso()}.json`;
    try {
      const blob = new Blob([actions.exportJson()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`Saved ${name}.`, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : t.common.error, 'error');
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>, kind: 'household' | 'plan') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const r = kind === 'household' ? actions.importJson(text) : actions.importPlanJson(text);
      toast(
        r.ok
          ? kind === 'household'
            ? `Imported ${file.name}.`
            : `Plan imported from ${file.name} and made active.`
          : r.reason,
        r.ok ? 'ok' : 'error',
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not read the file', 'error');
    }
  };

  return (
    <Section title={t.settings.data}>
      <p className="text-sm text-muted">Everything lives on this phone; exporting is the backup.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" icon={<Download size={18} />} onClick={exportJson}>
          {t.settings.export}
        </Button>
        <Button icon={<Upload size={18} />} onClick={() => importRef.current?.click()}>
          {t.settings.import}
        </Button>
        <Button icon={<FileJson size={18} />} onClick={() => planRef.current?.click()}>
          {t.settings.importPlan}
        </Button>
        <Button variant="danger" icon={<RotateCcw size={18} />} onClick={() => setResetOpen(true)}>
          {t.settings.reset}
        </Button>
      </div>
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void onFile(e, 'household')}
      />
      <input
        ref={planRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void onFile(e, 'plan')}
      />
      <Sheet open={resetOpen} onClose={() => setResetOpen(false)} title={t.settings.reset}>
        <p className="text-ink-2">
          This replaces the household, its weeks, pantry, recipes and questions with the demo plan. Export
          first if you want to keep anything.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="danger"
            size="lg"
            disabled={busy}
            icon={<RotateCcw size={18} />}
            onClick={async () => {
              setBusy(true);
              try {
                await actions.resetDemo();
                setResetOpen(false);
                toast('Demo plan restored.', 'ok');
              } catch (e) {
                toast(e instanceof Error ? e.message : t.common.error, 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? t.common.loading : 'Reset everything'}
          </Button>
          <Button variant="ghost" size="lg" onClick={() => setResetOpen(false)}>
            {t.common.cancel}
          </Button>
        </div>
      </Sheet>
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------
// 7. Sync, 8. About
// ---------------------------------------------------------------------------------------------

function SyncSection({ h }: { h: Household }) {
  return (
    <Section title={t.settings.sync}>
      <SyncCard h={h} />
      <p className="mt-3 text-xs text-muted">
        Household id <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-ink-2">{h.id}</code>
      </p>
    </Section>
  );
}

function AboutSection() {
  const version = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev';
  return (
    <Section title={t.settings.about}>
      <p className="font-display text-xl font-semibold">{t.app.name}</p>
      <p className="text-sm text-ink-2">{t.app.tagline}</p>
      <p className="mt-2 text-sm text-muted">Version {version}</p>
      <p className="mt-1 text-sm text-muted">
        No data leaves the phone: no account, no analytics, no server.
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------
// Local building blocks
// ---------------------------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <SectionTitle>{title}</SectionTitle>
      <Card>{children}</Card>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-2">{label}</span>
      {children}
    </label>
  );
}

function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="tap flex w-full items-center justify-between gap-3 py-3 text-left"
    >
      <span className="min-w-0">
        <span className="block text-[15px] text-ink">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <span
        aria-hidden="true"
        className={clsx(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors',
          checked ? 'bg-olive' : 'bg-line',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-surface shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </button>
  );
}

function Stepper({
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const decimals = (String(step).split('.')[1] ?? '').length;
  const go = (delta: number) =>
    onChange(Math.min(max, Math.max(min, Number((value + delta).toFixed(decimals)))));
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-[15px] text-ink">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1" role="group" aria-label={label}>
        <button
          type="button"
          className="tap flex items-center justify-center rounded-full border border-line bg-surface-2 text-ink disabled:opacity-40"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => go(-step)}
        >
          <Minus size={18} />
        </button>
        <span className="min-w-16 text-center font-medium tabular-nums" aria-live="polite">
          {format(value)}
        </span>
        <button
          type="button"
          className="tap flex items-center justify-center rounded-full border border-line bg-surface-2 text-ink disabled:opacity-40"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => go(step)}
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}

function commitText(raw: string, current: string, save: (v: string) => void) {
  const v = raw.trim();
  if (v && v !== current) save(v);
}

function blurOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') e.currentTarget.blur();
}
