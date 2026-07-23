import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type InterviewEvent = {
  elapsed_minutes: number;
  timestamp: string;
  speaker: 'candidate' | 'interviewer';
  kind: 'observation' | 'confirmation';
  text: string;
  track_id?: string;
  accepted?: boolean;
  checkpoint?: string | null;
};

type InterviewFixture = {
  title: string;
  started_at: string;
  ended_at: string;
  events: InterviewEvent[];
};

const fixturePath = resolve(
  process.cwd(),
  '../../crates/wasm4pm-cognition/tests/fixtures/full_hour_coordinate_interview.json',
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as InterviewFixture;

async function installDeterministicBrowserEnvironment(page: Page): Promise<void> {
  await page.clock.setFixedTime(fixture.started_at);
  await page.addInitScript(() => {
    let sequence = 0;
    const deterministicUuid = () => {
      sequence += 1;
      return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
    };
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: deterministicUuid,
    });
  });
}

async function admitObservation(page: Page, event: InterviewEvent): Promise<void> {
  const input = page.getByLabel('Admit transcript observation');
  await input.fill(event.text);
  await page.getByRole('button', { name: 'Admit observation' }).click();
  await page.getByRole('button', { name: 'Admit observation' }).waitFor();
}

async function admitConfirmation(page: Page, event: InterviewEvent): Promise<void> {
  if (event.accepted !== true || event.track_id !== 'coordinate_traversal') {
    throw new Error(`fixture confirmation is not the expected accepted coordinate track: ${event.text}`);
  }
  const confirmation = page.locator('.confirmation-card');
  await confirmation.waitFor();
  await confirmation.getByRole('button', { name: 'Yes' }).click();
  await confirmation.waitFor({ state: 'detached' });
}

async function captureCheckpoint(page: Page, event: InterviewEvent): Promise<void> {
  if (!event.checkpoint) return;
  await page.locator('.monaco-editor').waitFor();
  await expect(page).toHaveScreenshot(
    `${String(event.elapsed_minutes).padStart(2, '0')}m-${event.checkpoint}.png`,
    {
      fullPage: true,
    },
  );
}

test.describe('full interview visual contract', () => {
  test('an hour-long interview evolves from no evidence to committed Python code', async ({ page }) => {
    await installDeterministicBrowserEnvironment(page);
    await page.goto('/');
    await page.getByText('WASM ready', { exact: true }).waitFor();
    await page.locator('.monaco-editor').waitFor();

    for (const event of fixture.events) {
      await test.step(`${event.timestamp} · ${event.speaker} · ${event.text.slice(0, 72)}`, async () => {
        await page.clock.setFixedTime(event.timestamp);
        if (event.kind === 'observation') {
          await admitObservation(page, event);
        } else {
          await admitConfirmation(page, event);
        }
        await captureCheckpoint(page, event);
      });
    }
  });
});
