import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

export interface RunState {
  baseURL: string;
  mongoUri: string;
  mongoDb: string;
  secret: string;
}

export const AUTH_FILE = resolve(__dirname, "../.run/auth.json");

export function runState(): RunState {
  return JSON.parse(readFileSync(resolve(__dirname, "../.run/state.json"), "utf8")) as RunState;
}

let seq = 0;
/** Unique, readable titles so tests never collide inside the shared in-memory database. */
export const uniq = (label: string) => `${label}-${Date.now().toString(36)}${(seq++).toString(36)}`;

export interface Todo { id: string; title: string; date: string; status: string; weeklyPlanId: string | null }
export interface Plan { id: string; title: string; goalId: string | null; progress: { done: number; total: number; percent: number } }
export interface Goal { id: string; title: string; progress: { percent: number; weeklyPlanCount: number } }

async function ok<T>(res: { ok(): boolean; status(): number; json(): Promise<unknown>; text(): Promise<string> }, key: string): Promise<T> {
  if (!res.ok()) throw new Error(`API setup failed: ${res.status()} ${await res.text()}`);
  return ((await res.json()) as Record<string, T>)[key];
}

/** Seeds data through the real API (authenticated, same-origin) so tests stay independent and fast. */
export function seed(api: APIRequestContext) {
  return {
    goal: async (title: string, year = 2030) =>
      ok<Goal>(await api.post("/api/goals", { data: { title, year } }), "goal"),
    plan: async (title: string, goalId: string | null = null, startDate = "2030-03-04", endDate = "2030-03-10") =>
      ok<Plan>(await api.post("/api/weekly-plans", { data: { title, startDate, endDate, goalId } }), "weeklyPlan"),
    todo: async (title: string, date: string, weeklyPlanId: string | null = null, status?: string) =>
      ok<Todo>(await api.post("/api/todos", { data: { title, date, weeklyPlanId, ...(status ? { status } : {}) } }), "todo"),
    plans: async () => (await (await api.get("/api/weekly-plans")).json()).weeklyPlans as Plan[],
    getPlan: async (id: string) => (await (await api.get(`/api/weekly-plans/${id}`)).json()).weeklyPlan as Plan,
    getGoal: async (id: string) => (await (await api.get(`/api/goals/${id}`)).json()).goal as Goal,
    todos: async (date: string) => (await (await api.get(`/api/todos?date=${date}`)).json()).todos as Todo[],
  };
}

export const card = (page: Page, title: string): Locator =>
  page.getByTestId("todo-card").filter({ hasText: title });

export const column = (page: Page, status: "todo" | "doing" | "done"): Locator =>
  page.getByTestId(`column-list-${status}`);

/** Real mouse drag (dnd-kit needs intermediate pointer moves past the activation distance). */
export async function mouseDrag(page: Page, source: Locator, target: Locator) {
  const handle = source.getByTestId("todo-handle");
  const s = await handle.boundingBox();
  const t = await target.boundingBox();
  if (!s || !t) throw new Error("drag source or target is not visible");
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2 + 12, s.y + s.height / 2 + 4, { steps: 4 });
  await page.mouse.move(t.x + t.width / 2, t.y + Math.min(t.height / 2, 60), { steps: 12 });
  await page.mouse.up();
}

export async function noHorizontalScroll(page: Page) {
  const m = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }));
  expect(m.scroll, `documentElement.scrollWidth ${m.scroll} > clientWidth ${m.client}`).toBeLessThanOrEqual(m.client);
  expect(m.bodyScroll, `body.scrollWidth ${m.bodyScroll} > clientWidth ${m.client}`).toBeLessThanOrEqual(m.client);
}

/** Select the <option> whose text contains `text` (option labels embed dates, so exact match is brittle). */
export async function selectByText(select: Locator, text: string) {
  const option = select.locator("option", { hasText: text });
  await expect(option).toHaveCount(1);
  const value = await option.getAttribute("value");
  await select.selectOption(value!);
}

export async function createTodoViaUi(page: Page, title: string, date: string, planTitle?: string) {
  await page.getByTestId("add-todo-button").click();
  const dialog = page.getByTestId("todo-dialog");
  await dialog.getByTestId("todo-title-input").fill(title);
  await dialog.getByTestId("todo-date-input").fill(date);
  if (planTitle) await selectByText(dialog.getByTestId("todo-plan-select"), planTitle);
  await dialog.getByTestId("todo-submit").click();
  await expect(dialog).toBeHidden();
  await expect(card(page, title)).toBeVisible();
}
