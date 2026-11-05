import { Link } from '@tanstack/react-router';
import { ArrowLeft, PencilLine } from 'lucide-react';
import { useState } from 'react';
import type {
  DayTemplate,
  Food,
  FrequencyRule,
  FruitRule,
  MainMeal,
  MealTemplate,
  MenuOption,
  Qty,
  Slot,
  SlotOption,
  Subgroup,
} from '@/core/model';
import { isLibero } from '@/core/model';
import { todayIso } from '@/core/dates';
import { useHousehold } from '@/store/store';
import { actions } from '@/store/actions';
import { ctxOf, type Ctx } from '@/store/selectors';
import { methodLabel, ruleSourceLabel, t } from '@/i18n/en';
import { Button } from '../components/Button';
import { Card, SectionTitle } from '../components/Card';
import { Badge, Chip } from '../components/Chip';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Feedback';

type EditableQty = Exclude<Qty, { kind: 'free' }>;
interface EditTarget {
  templateN: number;
  which: MainMeal;
  slot: Slot;
  optionIndex: number;
  name: string;
  qty: EditableQty;
  food: Food | undefined;
}

export function PlanScreen() {
  const h = useHousehold();
  const ctx = ctxOf(h);
  const { plan, rev } = ctx;
  const toast = useToast();
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [value, setValue] = useState('');

  const openEdit = (target: EditTarget) => {
    setEdit(target);
    setValue(String(qtyNumber(target.qty)));
  };

  const nextRevision = Math.max(...plan.revisions.map((r) => r.revision)) + 1;
  const parsed = Number(value);
  const newQty: EditableQty | null =
    edit && Number.isFinite(parsed) && parsed > 0 ? withNumber(edit.qty, parsed) : null;
  const unchanged = !!edit && !!newQty && qtyNumber(newQty) === qtyNumber(edit.qty);

  const save = () => {
    if (!edit || !newQty) return;
    const label = `Edited ${todayIso()}`;
    // The action's `qty` parameter is typed through a non-distributive conditional on SlotOption and collapses to `never`;
    // the runtime contract is a Qty (see the request in the build report to type it as `Qty` in actions.ts).
    const r = actions.editOptionAmount(
      edit.templateN,
      edit.which,
      edit.slot.id,
      edit.optionIndex,
      newQty as never,
      label,
    );
    toast(
      r.ok ? `Saved as revision ${nextRevision}: ${edit.name} ${formatAmount(newQty, edit.food)}.` : r.reason,
      r.ok ? 'ok' : 'error',
    );
    if (r.ok) setEdit(null);
  };

  return (
    <div className="space-y-5">
      <header className="safe-top flex items-center gap-2 pt-2">
        <Link
          to="/settings"
          className="tap flex items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"
          aria-label={t.common.back}
        >
          <ArrowLeft size={22} />
        </Link>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted">
            {plan.name} · {t.settings.revision} {rev.revision}
          </p>
          <h1 className="text-2xl font-semibold leading-tight">{t.settings.amounts}</h1>
        </div>
      </header>
      <p className="px-1 text-sm text-muted">
        Raw, edible weights, read straight from the sheet. Tap an option to change its amount: that creates a
        new revision, and weeks already planned keep the one they were made with.
      </p>

      <DailyRules ctx={ctx} />
      <WeeklyRules rules={rev.exchange.frequency} />

      <div>
        <SectionTitle>Seven days</SectionTitle>
        <p className="mb-3 px-1 text-sm text-muted">
          <span className="font-medium text-olive-2">Green</span> is the sheet's reference option; the others
          are approved alternatives at their own amounts.
        </p>
        <div className="space-y-4">
          {rev.templates.map((tpl) => (
            <DayCard
              key={tpl.n}
              tpl={tpl}
              ctx={ctx}
              freeTemplate={rev.rules.pastoLibero.defaultTemplate}
              onEdit={openEdit}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>Fixed menus</SectionTitle>
        <div className="space-y-4">
          <MenuCard title={t.meals.colazione} options={rev.fixedMenus.colazione} ctx={ctx} />
          <FruitCard title={t.meals.spuntino} rule={rev.fixedMenus.spuntino} ctx={ctx} />
          <MenuCard title={t.meals.merenda} options={rev.fixedMenus.merenda} ctx={ctx} />
          {rev.fixedMenus.spuntinoSerale && (
            <FruitCard title={t.meals.spuntino_serale} rule={rev.fixedMenus.spuntinoSerale} ctx={ctx} />
          )}
        </div>
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Change the amount">
        {edit && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <p className="text-xs uppercase tracking-wide text-muted">
              {t.week.day} {edit.templateN} · {t.meals[edit.which]} · {t.roles[edit.slot.role]}
            </p>
            <p className="text-lg font-semibold leading-tight">{edit.name}</p>
            {edit.food && edit.food.nameIt !== edit.food.nameEn && (
              <p className="text-sm text-muted">{edit.food.nameIt}</p>
            )}
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-ink-2">
                Amount ({unitLabel(edit.qty, edit.food)})
              </span>
              <input
                type="number"
                inputMode={edit.qty.kind === 'count' ? 'decimal' : 'numeric'}
                min={0}
                step={edit.qty.kind === 'count' ? 0.5 : 5}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
                className="tap w-full rounded-2xl border border-line bg-surface-2 px-4 py-2.5 text-lg tabular-nums text-ink"
              />
            </label>
            <p className="mt-2 text-sm text-muted">
              On the sheet:{' '}
              <span className="font-medium tabular-nums text-ink-2">{formatAmount(edit.qty, edit.food)}</span>
              . Saving creates revision {nextRevision} (“Edited {todayIso()}”) and makes it the active one.
            </p>
            {value && !newQty && <p className="mt-1 text-sm text-terra">Enter an amount above zero.</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                icon={<PencilLine size={18} />}
                disabled={!newQty || unchanged}
              >
                Save as new revision
              </Button>
              <Button type="button" variant="ghost" size="lg" onClick={() => setEdit(null)}>
                {t.common.cancel}
              </Button>
            </div>
          </form>
        )}
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------

function DailyRules({ ctx }: { ctx: Ctx }) {
  const r = ctx.rev.rules;
  const oil = ctx.foodMap.get(r.oilFoodId)?.nameEn ?? r.oilFoodId;
  const rows: { label: string; value: string }[] = [
    { label: 'Oil', value: `${r.oilPerMealG} g per main meal, ${r.oilPerDayG} g a day (${oil})` },
    {
      label: 'Morning snack',
      value: r.morningSnack === 'weekdays_only' ? 'Weekdays only; none on Saturday and Sunday' : 'Every day',
    },
    {
      label: 'Vegetables',
      value: `Free, required at ${r.veg.requiredAt.map((m) => t.meals[m].toLowerCase()).join(' and ')}`,
    },
    { label: 'Cooking', value: r.methods.map(methodLabel).join(' · ') },
    {
      label: 'Condiments',
      value: `${r.condiments.length} allowed · grated cheese up to ${r.gratedCheeseMaxTsp} tsp`,
    },
    {
      label: 'Free meal',
      value: `One a week, by default on ${t.week.day.toLowerCase()} ${r.pastoLibero.defaultTemplate}`,
    },
  ];
  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">Every day</h2>
      <dl className="divide-y divide-line">
        {rows.map((row) => (
          <div key={row.label} className="py-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">{row.label}</dt>
            <dd className="mt-0.5 text-[15px] tabular-nums text-ink-2">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function WeeklyRules({ rules }: { rules: FrequencyRule[] }) {
  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">Weekly frequencies</h2>
      {rules.length === 0 ? (
        <p className="text-sm text-muted">This plan sets no weekly limits.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rules.map((r) => (
            <li key={r.id} className="py-2">
              <p className="text-[15px] text-ink">{r.label}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                <span className="tabular-nums">{boundsText(r)}</span>
                <span aria-hidden="true">·</span>
                <span>{r.scope === 'main_meals' ? 'main meals only' : 'every meal counts'}</span>
                <Badge>{ruleSourceLabel(r.source)}</Badge>
                {r.review && <Badge tone="warn">{t.week.review}</Badge>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function boundsText(r: FrequencyRule): string {
  const unit = r.countBy === 'units' ? (r.max === 1 && r.min === undefined ? 'unit' : 'units') : 'meals';
  const per = r.per === 'week' ? 'a week' : 'a day';
  if (r.min !== undefined && r.max !== undefined) return `${r.min}–${r.max} ${unit} ${per}`;
  if (r.min !== undefined) return `at least ${r.min} ${unit} ${per}`;
  if (r.max !== undefined) return `at most ${r.max} ${unit} ${per}`;
  return `counted ${per}`;
}

// ---------------------------------------------------------------------------------------------
// Day templates
// ---------------------------------------------------------------------------------------------

function DayCard({
  tpl,
  ctx,
  freeTemplate,
  onEdit,
}: {
  tpl: DayTemplate;
  ctx: Ctx;
  freeTemplate: number;
  onEdit: (e: EditTarget) => void;
}) {
  const libero = isLibero(tpl);
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">
            {t.week.day} {tpl.n}
          </h2>
          {tpl.hint && <p className="text-sm text-muted">{tpl.hint}</p>}
        </div>
        {tpl.weekendStyle && <Badge className="shrink-0">Weekend style</Badge>}
      </div>
      <MealBlock title={t.meals.pranzo} mt={tpl.pranzo} which="pranzo" tpl={tpl} ctx={ctx} onEdit={onEdit} />
      {libero || !('slots' in tpl.cena) ? (
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">{t.meals.cena}</h3>
            <Badge tone="terra">{t.week.freeMeal}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-2">
            {t.tonight.freeHint}
            {tpl.n !== freeTemplate && ' The planner can move it to another day.'}
          </p>
        </div>
      ) : (
        <MealBlock title={t.meals.cena} mt={tpl.cena} which="cena" tpl={tpl} ctx={ctx} onEdit={onEdit} />
      )}
    </Card>
  );
}

function MealBlock({
  title,
  mt,
  which,
  tpl,
  ctx,
  onEdit,
}: {
  title: string;
  mt: MealTemplate;
  which: MainMeal;
  tpl: DayTemplate;
  ctx: Ctx;
  onEdit: (e: EditTarget) => void;
}) {
  return (
    <div className="mt-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted">{title}</h3>
      {mt.note && <p className="mt-0.5 text-sm text-muted">{mt.note}</p>}
      <div className="mt-1 divide-y divide-line">
        {mt.slots.map((slot) => (
          <div key={slot.id} className="py-2">
            <p className="text-sm font-medium text-ink-2">{t.roles[slot.role]}</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {slot.options.map((o, i) => (
                <OptionChip
                  key={i}
                  option={o}
                  index={i}
                  ctx={ctx}
                  onClick={(name, qty, food) =>
                    onEdit({ templateN: tpl.n, which, slot, optionIndex: i, name, qty, food })
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OptionChip({
  option,
  index,
  ctx,
  onClick,
}: {
  option: SlotOption;
  index: number;
  ctx: Ctx;
  onClick: (name: string, qty: EditableQty, food: Food | undefined) => void;
}) {
  const tone = index === 0 ? 'olive' : 'neutral';
  if (option.kind === 'free' || option.qty.kind === 'free') {
    const name = option.kind === 'free' ? 'Free vegetables' : optionName(option, ctx);
    // Nothing to edit on a free option, so the chip is static text (no button, no label beyond its words).
    return (
      <Chip tone={tone}>
        {name} <span className="font-medium">· free</span>
      </Chip>
    );
  }
  const food = option.kind === 'food' ? ctx.foodMap.get(option.foodId) : undefined;
  const name = optionName(option, ctx);
  const qty = option.qty;
  const amount = formatAmount(qty, food);
  return (
    <Chip
      tone={tone}
      onClick={() => onClick(name, qty, food)}
      aria-label={`${itemText(name, qty, food)}${index === 0 ? ', reference' : ''}. Change the amount`}
    >
      {qty.kind !== 'count' && name} <span className="font-medium tabular-nums">{amount}</span>
    </Chip>
  );
}

// ---------------------------------------------------------------------------------------------
// Fixed menus
// ---------------------------------------------------------------------------------------------

function MenuCard({ title, options, ctx }: { title: string; options: MenuOption[]; ctx: Ctx }) {
  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">{title}</h2>
      {options.length === 0 ? (
        <p className="text-sm text-muted">No fixed options.</p>
      ) : (
        <ul className="divide-y divide-line">
          {options.map((o) => (
            <li key={o.id} className="py-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15px] text-ink">{o.label}</p>
                {o.when === 'post_workout' && <Badge tone="olive">Post-workout</Badge>}
              </div>
              <p className="mt-0.5 text-sm tabular-nums text-muted">
                {o.items
                  .map((it) => {
                    const f = ctx.foodMap.get(it.foodId);
                    return itemText(f?.nameEn ?? it.foodId, it.qty, f);
                  })
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FruitCard({ title, rule, ctx }: { title: string; rule: FruitRule; ctx: Ctx }) {
  const notes = [rule.weekdaysOnly ? 'weekdays only' : 'every day', rule.optional ? 'optional' : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mb-1 text-sm text-muted">One portion of fruit, {notes}.</p>
      <ul className="divide-y divide-line">
        {rule.tiers.map((tier, i) => (
          <li key={i} className="flex items-baseline gap-3 py-2">
            <span className="w-16 shrink-0 font-medium tabular-nums">{formatAmount(tier.qty)}</span>
            <span className="text-sm text-ink-2">
              {tier.foodIds.map((id) => ctx.foodMap.get(id)?.nameEn ?? id).join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------

const SUBGROUP_LABEL: Partial<Record<Subgroup, string>> = {
  cereal: 'cereal',
  bread: 'bread',
  bread_sub: 'bread substitute',
  tuber: 'potatoes',
  fresh_pasta: 'fresh pasta',
  legume_dry: 'dried legumes',
  legume_canned: 'canned legumes',
  cheese_fresh: 'fresh cheese',
  cheese_aged: 'aged cheese',
  meat_white: 'white meat',
  meat_red: 'red meat',
  cured: 'cured meat',
  veg: 'vegetables',
  frozen_soup: 'frozen soup',
};

function optionName(o: Exclude<SlotOption, { kind: 'free' }>, ctx: Ctx): string {
  if (o.kind === 'food') return ctx.foodMap.get(o.foodId)?.nameEn ?? o.foodId;
  return o.label ?? `any ${SUBGROUP_LABEL[o.subgroup] ?? o.subgroup.replace('_', ' ')}`;
}

export function formatAmount(q: Qty, food?: Pick<Food, 'nameEn'>): string {
  switch (q.kind) {
    case 'g':
      return `${q.g} g`;
    case 'ml':
      return `${q.ml} ml`;
    case 'count': {
      const n = Number.isInteger(q.count) ? String(q.count) : q.count.toFixed(1);
      const unit = food?.nameEn ?? 'pieces';
      return `${n} ${q.count === 1 && unit.endsWith('s') && !unit.endsWith('ss') ? unit.slice(0, -1) : unit}`;
    }
    case 'free':
      return 'free';
  }
}

/** "basmati rice 70 g", but "2 eggs" (a count already names the food) and "1 honey (7 g)" for spoon-like units. */
function itemText(name: string, q: Qty, food?: Pick<Food, 'nameEn' | 'pieceG'>): string {
  if (q.kind !== 'count') return `${name} ${formatAmount(q, food)}`;
  const grams = q.unitG && !food?.pieceG ? ` (${Math.round(q.count * q.unitG)} g)` : '';
  return `${formatAmount(q, food)}${grams}`;
}

function unitLabel(q: EditableQty, food?: Pick<Food, 'nameEn'>): string {
  if (q.kind === 'g') return 'grams';
  if (q.kind === 'ml') return 'ml';
  return food?.nameEn ?? 'pieces';
}

function qtyNumber(q: EditableQty): number {
  return q.kind === 'g' ? q.g : q.kind === 'ml' ? q.ml : q.count;
}

function withNumber(q: EditableQty, n: number): EditableQty {
  if (q.kind === 'g') return { kind: 'g', g: Math.round(n) };
  if (q.kind === 'ml') return { kind: 'ml', ml: Math.round(n) };
  return { ...q, count: Math.round(n * 2) / 2 };
}
