import { createHashHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { Shell } from './Shell';
import { TonightScreen } from './screens/Tonight';
import { CookScreen } from './screens/Cook';
import { WeekScreen } from './screens/Week';
import { ShoppingScreen } from './screens/Shopping';
import { RecipesScreen } from './screens/Recipes';
import { RecipeDetailScreen } from './screens/RecipeDetail';
import { RecipeEditScreen } from './screens/RecipeEdit';
import { SettingsScreen } from './screens/Settings';
import { PlanScreen } from './screens/Plan';

const rootRoute = createRootRoute({ component: Shell });
const tonight = createRoute({ getParentRoute: () => rootRoute, path: '/', component: TonightScreen });
const cook = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cook/$date/$meal',
  component: CookScreen,
});
const week = createRoute({ getParentRoute: () => rootRoute, path: '/week', component: WeekScreen });
const shopping = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shopping',
  component: ShoppingScreen,
});
const recipes = createRoute({ getParentRoute: () => rootRoute, path: '/recipes', component: RecipesScreen });
const recipeNew = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/new',
  component: RecipeEditScreen,
});
const recipeEdit = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/$id/edit',
  component: RecipeEditScreen,
});
const recipeDetail = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/$id',
  component: RecipeDetailScreen,
});
const settings = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsScreen,
});
const plan = createRoute({ getParentRoute: () => rootRoute, path: '/settings/plan', component: PlanScreen });

const routeTree = rootRoute.addChildren([
  tonight,
  cook,
  week,
  shopping,
  recipes,
  recipeNew,
  recipeEdit,
  recipeDetail,
  settings,
  plan,
]);

export const router = createRouter({ routeTree, history: createHashHistory(), scrollRestoration: true });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
