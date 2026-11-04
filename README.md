# Stasera

A mobile-first web app (PWA) for a two-person household in Sanremo where one person follows a
nutritionist's exchange-based plan ("schema a grammature": fixed gram amounts of a carbohydrate source,
a protein source and oil per meal, vegetables unlimited) and the other eats the same dishes freely.

It answers one question every evening — *what's for dinner?* — with a dish that fits the plan to the gram,
keeps variety high over months, and produces one shopping list for the week in supermarket walking order.

- **Plan and design:** [`docs/PLAN.md`](docs/PLAN.md) — product concept, diet model, algorithms, UX, architecture, roadmap.
- **Research notes:** [`docs/research/`](docs/research/) — competitors, nutrition data sources, Sanremo stores and pack sizes, tech stack.

## Privacy

The real nutritionist documents are copyrighted and contain personal data. They are never committed:
the app loads the household's plan from a private, git-ignored file (`plans/private/`) or from an in-app
import. The repository ships only `plans/demo.json`, a generic plan with invented values that has the same
shape, used for development and tests.

## Status

Planning complete; implementation starts with the core domain package (see the build order in the plan).
