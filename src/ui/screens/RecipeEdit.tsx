import { useNavigate, useParams } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { ArrowLeft, Check, ChevronDown, CircleAlert } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import {
  DISH_FLAVOURS,
  DISH_FORMATS,
  POT_POLICIES,
  type Dish,
  type DishBinding,
  type Food,
  type MainMeal,
  type PotPolicy,
  type Subgroup,
} from '@/core/model';
import { validateDish } from '@/core/validate';
import { useHousehold } from '@/store/store';
import { actions } from '@/store/actions';
import { ctxOf } from '@/store/selectors';
import { t } from '@/i18n/en';
import { Button } from '../components/Button';
import { Card, SectionTitle } from '../components/Card';
import { Chip } from '../components/Chip';
import { EmptyState, useToast } from '../components/Feedback';
import { prettyVerdictText, VerdictCard } from '../components/Verdict';
import { POT_HINT } from '../meal-view';

// ---------------------------------------------------------------------------------------------
// Form model
// ---------------------------------------------------------------------------------------------

const EDITABLE_ROLES = ['cereal', 'bread', 'protein', 'soup', 'topping'] as const;
type EditableRole = (typeof EDITABLE_ROLES)[number];

const ROLE_GROUPS: Record<EditableRole, { label?: string; subgroups: Subgroup[] }[]> = {
  cereal: [{ subgroups: ['cereal', 'fresh_pasta'] }],
  bread: [{ subgroups: ['bread', 'bread_sub', 'tuber'] }],
  protein: [
    { label: 'Legumes', subgroups: ['legume_canned', 'legume_dry'] },
    { label: 'Tofu & veggie burgers', subgroups: ['tofu', 'veg_burger'] },
    { label: 'Cheese', subgroups: ['cheese_fresh', 'cheese_aged'] },
    { label: 'Meat', subgroups: ['meat_white', 'meat_red'] },
    { label: 'Cured meats', subgroups: ['cured'] },
    { label: 'Eggs', subgroups: ['egg'] },
  ],
  soup: [{ subgroups: ['frozen_soup'] }],
  topping: [{ subgroups: ['cheese_aged'] }],
};

const ROLE_ANY: Partial<Record<EditableRole, { value: 'any_cereal' | 'any_bread'; label: string }>> = {
  cereal: { value: 'any_cereal', label: 'Any cereal' },
  bread: { value: 'any_bread', label: 'Any bread' },
};

const ROLE_HINT: Record<EditableRole, string> = {
  cereal: 'Pasta, rice, couscous, grains — the plan picks the amount.',
  bread: 'Bread, crackers or potatoes at their listed weight.',
  protein: 'Legumes, tofu, cheese, meat or eggs: the B item of the meal.',
  soup: 'A frozen vegetable soup as the vegetable of the meal.',
  topping: 'A teaspoon of grated cheese. Never counts as the protein.',
};

/** Same test as the validator's grams_in_steps check, so the live warning and the verdict agree. */
const GRAMS_IN_TEXT = /\d+\s?(g|gr|grams?|grammi|ml|cl|kg|l)\b/i;

interface BindingDraft {
  on: boolean;
  any: boolean;
  foods: string[];
  prep: string;
  pot: PotPolicy;
}

interface Draft {
  titleEn: string;
  titleIt: string;
  mealTypes: MainMeal[];
  bindings: Record<EditableRole, BindingDraft>;
  freeVeg: string[];
  condiments: string[];
  methods: string[];
  minutes: string;
  lunchboxOk: boolean;
  format: Dish['signature']['format'];
  temperature: Dish['signature']['temperature'];
  flavour: Dish['signature']['flavour'];
  stepsText: string;
}

const emptyBinding = (): BindingDraft => ({ on: false, any: false, foods: [], prep: '', pot: 'separate' });

function emptyDraft(): Draft {
  return {
    titleEn: '',
    titleIt: '',
    mealTypes: ['pranzo', 'cena'],
    bindings: {
      cereal: emptyBinding(),
      bread: emptyBinding(),
      protein: emptyBinding(),
      soup: emptyBinding(),
      topping: emptyBinding(),
    },
    freeVeg: [],
    condiments: ['olio_evo'],
    methods: [],
    minutes: '20',
    lunchboxOk: false,
    format: 'plate',
    temperature: 'hot',
    flavour: 'mediterranean',
    stepsText: '',
  };
}

function isEditableRole(r: DishBinding['role']): r is EditableRole {
  return (EDITABLE_ROLES as readonly string[]).includes(r);
}

function draftOf(d: Dish): Draft {
  const base = emptyDraft();
  for (const b of d.bindings) {
    if (!isEditableRole(b.role)) continue;
    // Only cereal and bread have an "Any" chip; a wildcard on another role falls back to an empty pick.
    const any = typeof b.foods === 'string' && ROLE_ANY[b.role] !== undefined;
    base.bindings[b.role] = {
      on: true,
      any,
      foods: typeof b.foods === 'string' ? [] : [...b.foods],
      prep: b.prep,
      pot: b.pot,
    };
  }
  return {
    ...base,
    titleEn: d.titleEn,
    titleIt: d.titleIt,
    mealTypes: [...d.mealTypes],
    freeVeg: [...d.freeVeg],
    condiments: [...d.condiments],
    methods: [...d.methods],
    minutes: String(d.minutes),
    lunchboxOk: d.lunchboxOk,
    format: d.signature.format,
    temperature: d.signature.temperature,
    flavour: d.signature.flavour,
    stepsText: d.steps.join('\n'),
  };
}

/** The dish the form describes right now; bindings that are switched on but empty are left out. */
function dishOf(draft: Draft, base: Dish | undefined, id: string): Dish {
  const bindings: DishBinding[] = [];
  for (const role of EDITABLE_ROLES) {
    const b = draft.bindings[role];
    if (!b.on) continue;
    const anyValue = ROLE_ANY[role]?.value;
    if (b.any && anyValue) bindings.push({ role, foods: anyValue, prep: b.prep.trim(), pot: b.pot });
    else if (b.foods.length > 0)
      bindings.push({ role, foods: [...b.foods], prep: b.prep.trim(), pot: b.pot });
  }
  // Roles the editor does not cover (a 'veg' binding on an imported dish) are kept as they were.
  for (const b of base?.bindings ?? []) if (!isEditableRole(b.role)) bindings.push(b);
  const minutes = Math.max(1, Math.round(Number(draft.minutes)) || 20);
  const steps = draft.stepsText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const titleEn = draft.titleEn.trim();
  return {
    id,
    titleEn,
    titleIt: draft.titleIt.trim() || titleEn,
    bindings,
    freeVeg: [...draft.freeVeg],
    condiments: [...draft.condiments],
    methods: [...draft.methods],
    signature: { format: draft.format, temperature: draft.temperature, flavour: draft.flavour },
    minutes,
    lunchboxOk: draft.lunchboxOk,
    mealTypes: draft.mealTypes.length ? [...draft.mealTypes] : ['pranzo', 'cena'],
    ...(base?.batchable ? { batchable: base.batchable } : {}),
    steps,
    origin: base?.origin ?? 'user',
    status: base?.status ?? 'approved',
    tags: base?.tags ?? [],
    createdAt: base?.createdAt ?? new Date().toISOString(),
  };
}

function slugOf(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'dish'
  );
}

function newDishId(titleEn: string): string {
  return `dish-${slugOf(titleEn)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------------------------

export function RecipeEditScreen() {
  const { id } = useParams({ strict: false }) as { id?: string };
  const h = useHousehold();
  const navigate = useNavigate();
  const toast = useToast();
  const ctx = useMemo(() => ctxOf(h), [h]);
  const base = id ? ctx.dishes.get(id) : undefined;
  const [draft, setDraft] = useState<Draft>(() => (base ? draftOf(base) : emptyDraft()));
  const [touched, setTouched] = useState(false);

  const preview = useMemo(() => dishOf(draft, base, base?.id ?? 'draft'), [draft, base]);
  const verdict = useMemo(() => validateDish(preview, ctx.rev, ctx.foods), [preview, ctx]);
  const problems = useMemo(() => validateDraft(draft, preview), [draft, preview]);

  if (id && !base) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="Dish not found"
          body="It may have been deleted, or the link is out of date."
          action={
            <Button variant="primary" onClick={() => navigate({ to: '/recipes' })}>
              Back to recipes
            </Button>
          }
        />
      </div>
    );
  }

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const patchBinding = (role: EditableRole, p: Partial<BindingDraft>) =>
    setDraft((d) => ({ ...d, bindings: { ...d.bindings, [role]: { ...d.bindings[role], ...p } } }));
  const toggleIn = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const cancel = () =>
    base ? navigate({ to: '/recipes/$id', params: { id: base.id } }) : navigate({ to: '/recipes' });

  const save = () => {
    setTouched(true);
    if (problems.length > 0) {
      toast(problems[0] ?? 'Check the form.', 'error');
      return;
    }
    const complete = !!verdict.best?.complete;
    const dish: Dish = {
      ...dishOf(draft, base, base?.id ?? newDishId(draft.titleEn)),
      origin: base?.origin ?? 'user',
      status: complete ? 'approved' : 'draft',
    };
    actions.saveDish(dish);
    for (const q of verdict.questions) actions.addQuestion(q, 'validator');
    if (complete) toast(`Saved. ${prettyVerdictText(verdict.summary)}`, 'ok');
    else
      toast(
        `Saved as a draft: the plan cannot place it yet. ${verdict.questions.length ? 'A question for the nutritionist was added.' : 'Fix the slots and save again.'}`,
        'info',
      );
    navigate({ to: '/recipes/$id', params: { id: dish.id } });
  };

  const gramLines = draft.stepsText
    .split('\n')
    .map((line, i) => ({ i, m: GRAMS_IN_TEXT.exec(line) }))
    .filter((x): x is { i: number; m: RegExpExecArray } => x.m !== null);
  const freeVegFoods = ctx.foods.filter((f) => f.isFreeVeg);
  const condimentFoods = ctx.rev.rules.condiments
    .map((c) => ctx.foodMap.get(c))
    .filter((f): f is Food => !!f);

  return (
    <div className="space-y-5">
      <div className="safe-top flex items-center justify-between gap-2 pt-2">
        <button
          type="button"
          onClick={cancel}
          className="tap -ml-2 flex items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"
          aria-label={t.common.back}
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={cancel}>
            {t.recipes.cancel}
          </Button>
          <Button variant="primary" size="sm" icon={<Check size={16} />} onClick={save}>
            {t.recipes.save}
          </Button>
        </div>
      </div>

      <header className="px-1">
        <h1 className="text-3xl font-semibold">{base ? 'Edit dish' : 'New dish'}</h1>
        <p className="text-sm text-muted">
          Bind each ingredient to a plan role by tapping. No amounts to type: the plan knows them.
        </p>
      </header>

      {touched && problems.length > 0 && (
        <div className="rounded-2xl bg-terra-soft p-3 text-sm text-terra" role="alert">
          <ul className="space-y-1">
            {problems.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card className="space-y-4">
        <Field
          label={t.recipes.titleEn}
          htmlFor="dish-title-en"
          hint="Name a food or write {{cereal}}, {{bread}} or {{protein}}: the title then shows the food chosen for the meal."
        >
          <input
            id="dish-title-en"
            className={INPUT}
            value={draft.titleEn}
            onChange={(e) => patch({ titleEn: e.target.value })}
            placeholder="Couscous with chickpeas and cherry tomatoes"
            autoComplete="off"
          />
        </Field>
        <Field
          label={t.recipes.titleIt}
          htmlFor="dish-title-it"
          hint="Optional; the English title is used when empty."
        >
          <input
            id="dish-title-it"
            className={INPUT}
            value={draft.titleIt}
            onChange={(e) => patch({ titleIt: e.target.value })}
            placeholder="Cous cous con ceci e pomodorini"
            autoComplete="off"
            lang="it"
          />
        </Field>
        <Field label="Meals">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Meals">
            {(['pranzo', 'cena'] as const).map((m) => (
              <Chip
                key={m}
                selected={draft.mealTypes.includes(m)}
                onClick={() => patch({ mealTypes: toggleIn(draft.mealTypes, m) as MainMeal[] })}
              >
                {t.meals[m]}
              </Chip>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minutes" htmlFor="dish-minutes">
            <input
              id="dish-minutes"
              type="number"
              inputMode="numeric"
              min={1}
              max={240}
              step={5}
              className={clsx(INPUT, 'tabular-nums')}
              value={draft.minutes}
              onChange={(e) => patch({ minutes: e.target.value })}
            />
          </Field>
          <Field label={t.recipes.lunchbox}>
            <Toggle
              checked={draft.lunchboxOk}
              onChange={(lunchboxOk) => patch({ lunchboxOk })}
              label={draft.lunchboxOk ? 'Packs well' : 'Eat it fresh'}
            />
          </Field>
        </div>
      </Card>

      <div>
        <SectionTitle>Ingredients by role</SectionTitle>
        <div className="space-y-3">
          {EDITABLE_ROLES.map((role) => {
            const b = draft.bindings[role];
            const any = ROLE_ANY[role];
            return (
              <Card key={role} className={clsx(!b.on && 'bg-surface-2/60')}>
                <Toggle
                  checked={b.on}
                  onChange={(on) => patchBinding(role, { on })}
                  label={t.roles[role]}
                  hint={ROLE_HINT[role]}
                  className="w-full"
                />
                {b.on && (
                  <div className="mt-3 space-y-3">
                    <div className="space-y-2">
                      {any && (
                        <div className="flex flex-wrap gap-2">
                          <Chip
                            selected={b.any}
                            tone="olive"
                            onClick={() => patchBinding(role, { any: !b.any })}
                          >
                            {any.label}
                          </Chip>
                        </div>
                      )}
                      {!b.any &&
                        ROLE_GROUPS[role].map((g) => {
                          const foods = ctx.foods.filter((f) => g.subgroups.includes(f.subgroup));
                          if (foods.length === 0) return null;
                          return (
                            <div key={g.label ?? g.subgroups.join('+')}>
                              {g.label && (
                                <p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">
                                  {g.label}
                                </p>
                              )}
                              <div
                                className="flex flex-wrap gap-2"
                                role="group"
                                aria-label={g.label ?? t.roles[role]}
                              >
                                {foods.map((f) => (
                                  <Chip
                                    key={f.id}
                                    selected={b.foods.includes(f.id)}
                                    onClick={() => patchBinding(role, { foods: toggleIn(b.foods, f.id) })}
                                  >
                                    {f.nameEn}
                                  </Chip>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      {b.any && (
                        <p className="text-sm text-muted">
                          Any {role} the plan lists for the meal; the planner picks one.
                        </p>
                      )}
                      {!b.any && b.foods.length === 0 && (
                        <p className="text-sm text-terra">Pick at least one, or switch the role off.</p>
                      )}
                    </div>
                    <Field
                      label="Preparation"
                      htmlFor={`prep-${role}`}
                      hint="How it is cooked, never how much."
                    >
                      <input
                        id={`prep-${role}`}
                        className={INPUT}
                        value={b.prep}
                        onChange={(e) => patchBinding(role, { prep: e.target.value })}
                        placeholder={
                          role === 'protein'
                            ? 'drained and rinsed'
                            : role === 'cereal'
                              ? 'cooked al dente'
                              : ''
                        }
                        autoComplete="off"
                      />
                    </Field>
                    <Field label="In the pot" htmlFor={`pot-${role}`}>
                      <Select
                        id={`pot-${role}`}
                        value={b.pot}
                        onChange={(v) => patchBinding(role, { pot: v as PotPolicy })}
                        options={POT_POLICIES.map((p) => ({ value: p, label: POT_HINT[p] ?? p }))}
                      />
                    </Field>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <SectionTitle>{t.recipes.freeVeg}</SectionTitle>
        <Card>
          <p className="mb-2 text-sm text-muted">
            As much as you like; the planner may swap for what is in season.
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t.recipes.freeVeg}>
            {freeVegFoods.map((f) => (
              <Chip
                key={f.id}
                selected={draft.freeVeg.includes(f.id)}
                onClick={() => patch({ freeVeg: toggleIn(draft.freeVeg, f.id) })}
              >
                {f.nameEn}
              </Chip>
            ))}
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle>{t.recipes.condiments}</SectionTitle>
        <Card>
          <p className="mb-2 text-sm text-muted">
            Only what the plan allows; oil counts against the meal allowance.
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t.recipes.condiments}>
            {condimentFoods.map((f) => (
              <Chip
                key={f.id}
                selected={draft.condiments.includes(f.id)}
                onClick={() => patch({ condiments: toggleIn(draft.condiments, f.id) })}
              >
                {f.nameEn}
              </Chip>
            ))}
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle>{t.recipes.methods}</SectionTitle>
        <Card>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t.recipes.methods}>
            {ctx.rev.rules.methods.map((m) => (
              <Chip
                key={m}
                selected={draft.methods.includes(m)}
                onClick={() => patch({ methods: toggleIn(draft.methods, m) })}
              >
                {m}
              </Chip>
            ))}
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle>Character</SectionTitle>
        <Card className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Format" htmlFor="dish-format">
            <Select
              id="dish-format"
              value={draft.format}
              onChange={(v) => patch({ format: v as Draft['format'] })}
              options={DISH_FORMATS.map((x) => ({ value: x, label: x }))}
            />
          </Field>
          <Field label="Temperature" htmlFor="dish-temperature">
            <Select
              id="dish-temperature"
              value={draft.temperature}
              onChange={(v) => patch({ temperature: v as Draft['temperature'] })}
              options={[
                { value: 'hot', label: 'hot' },
                { value: 'cold', label: 'cold' },
              ]}
            />
          </Field>
          <Field label="Flavour" htmlFor="dish-flavour">
            <Select
              id="dish-flavour"
              value={draft.flavour}
              onChange={(v) => patch({ flavour: v as Draft['flavour'] })}
              options={DISH_FLAVOURS.map((x) => ({ value: x, label: x }))}
            />
          </Field>
        </Card>
      </div>

      <div>
        <SectionTitle>{t.recipes.steps}</SectionTitle>
        <Card>
          <Field
            label="One step per line"
            htmlFor="dish-steps"
            hint="Write {{cereal}}, {{protein}}, {{bread}}, {{soup}} or {{topping}} where the food goes; the cook view fills in the food and her amount."
          >
            <textarea
              id="dish-steps"
              rows={6}
              className={clsx(INPUT, 'min-h-32 leading-snug')}
              value={draft.stepsText}
              onChange={(e) => patch({ stepsText: e.target.value })}
              placeholder={
                'Cook {{cereal}} and let it cool a little.\nToss with {{protein}}, the vegetables and the oil allowance.'
              }
            />
          </Field>
          {gramLines.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-terra" aria-live="polite">
              {gramLines.map(({ i, m }) => (
                <li key={i} className="flex items-start gap-2">
                  <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    Step {i + 1} mentions "{m[0]}" — amounts always come from the plan. Describe the food, not
                    the weight.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div>
        <SectionTitle>Live verdict</SectionTitle>
        <VerdictCard
          verdict={verdict}
          ctx={ctx}
          dish={{ titleEn: draft.titleEn.trim() || 'This dish' }}
          label="Live verdict"
        />
        <p className="mt-2 px-1 text-sm text-muted">
          {verdict.best?.complete
            ? 'Saves as approved: it can enter a planned week.'
            : 'Saves as a draft until every slot of a plan meal is filled.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="lg" icon={<Check size={18} />} onClick={save}>
          {t.recipes.save}
        </Button>
        <Button variant="ghost" size="lg" onClick={cancel}>
          {t.recipes.cancel}
        </Button>
      </div>
    </div>
  );
}

function validateDraft(draft: Draft, preview: Dish): string[] {
  const out: string[] = [];
  if (!draft.titleEn.trim()) out.push('Give the dish an English title.');
  if (draft.mealTypes.length === 0) out.push('Pick at least one meal: lunch, dinner or both.');
  if (preview.bindings.filter((b) => b.role !== 'veg').length === 0)
    out.push('Bind at least one ingredient to a plan role.');
  for (const role of EDITABLE_ROLES) {
    const b = draft.bindings[role];
    if (b.on && !b.any && b.foods.length === 0)
      out.push(`${t.roles[role]}: pick a food or switch the role off.`);
  }
  const n = Number(draft.minutes);
  if (!Number.isFinite(n) || n < 1) out.push('Minutes must be at least 1.');
  return out;
}

// ---------------------------------------------------------------------------------------------
// Form controls (local to this screen)
// ---------------------------------------------------------------------------------------------

const INPUT =
  'tap w-full rounded-2xl border border-line bg-surface-2 px-4 py-2.5 text-[15px] text-ink placeholder:text-muted';

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      {htmlFor ? (
        <label
          htmlFor={htmlFor}
          className="mb-1 block text-xs font-medium tracking-wide text-muted uppercase"
        >
          {label}
        </label>
      ) : (
        <p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      )}
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Select({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(INPUT, 'appearance-none pr-10')}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={18}
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx('tap flex items-center gap-3 rounded-2xl text-left', className)}
    >
      <span
        className={clsx(
          'relative inline-block h-7 w-12 shrink-0 rounded-full transition',
          checked ? 'bg-olive' : 'bg-line',
        )}
        aria-hidden="true"
      >
        <span
          className={clsx(
            'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </button>
  );
}
