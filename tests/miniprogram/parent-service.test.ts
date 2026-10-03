/**
 * The parent service layer: what it asks for, what it refuses to throw, and the two shapes that
 * differ from what a reader would guess.
 *
 * The parent screens were added last, against endpoints that already existed for the web console,
 * and three of them answer something other than the obvious:
 *
 *   - `GET /api/leaves` wraps its rows as `data`, not `leaves`;
 *   - `GET /api/pets/:id` also reports today's blessing as `has_parent_buff`;
 *   - `GET /api/family-tasks` is gated by a class flag and answers **403** when it is off, which must
 *     read as "this class does not use family time" and not as a broken page.
 *
 * Each of those was measured against the running server, and each is pinned here so a later
 * "cleanup" cannot quietly reintroduce the guess.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { installFakeWx, type FakeWx, type Responder } from './helpers/fake-wx';

async function loadService(respond: Responder) {
  const fake: FakeWx = installFakeWx({ respond });
  vi.resetModules();
  const parent = await import('../../miniprogram/services/parent');
  return { fake, parent };
}

function ok(data: unknown) {
  return { statusCode: 200, data: { success: true, ...(data as object) } };
}

function fail(message: string, statusCode = 403) {
  return { statusCode, data: { success: false, message } };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the child, the ledger and the pet', () => {
  it('unwraps the student row from its envelope', async () => {
    const { parent, fake } = await loadService(() =>
      ok({ student: { id: 11, class_id: 10, name: '演示学生', total_points: 30, available_points: 30 } }),
    );

    const child = await parent.parentChild(11);

    expect(child).toMatchObject({ id: 11, name: '演示学生' });
    expect(fake.requestsTo('/api/students/11')).toHaveLength(1);
  });

  it('names the child by query parameter, because there is no per-student records route', async () => {
    const { parent, fake } = await loadService(() => ok({ records: [] }));

    await parent.parentRecords(11);

    expect(fake.requestsTo('/api/students/records')[0].url).toContain('studentId=11');
  });

  it('reports today\'s blessing from the pet answer, which is where the flag actually lives', async () => {
    const { parent } = await loadService(() => ok({ pet: { name: '小豆' }, has_parent_buff: true }));

    const answer = await parent.parentPet(11);

    expect(answer.hasParentBuff).toBe(true);
    expect(answer.pet).toMatchObject({ name: '小豆' });
  });

  it('treats an absent pet as "no pet", never as a failure', async () => {
    const { parent } = await loadService(() => fail('宠物功能未开启', 404));

    await expect(parent.parentPet(11)).resolves.toEqual({ pet: null, hasParentBuff: false });
  });

  it('does not offer the blessing when the answer omits the flag', async () => {
    // The direction matters: a missing flag is read as "not blessed yet", which still shows the
    // button. The server refuses a second blessing with a clear 400, whereas the opposite default
    // would silently cost the parent that day's bonus.
    const { parent } = await loadService(() => ok({ pet: null }));

    await expect(parent.parentPet(11)).resolves.toEqual({ pet: null, hasParentBuff: false });
  });
});

describe('家庭时光 is a gated feature, not a broken page', () => {
  it('turns the 403 of a disabled class flag into an empty list', async () => {
    const { parent } = await loadService(() => fail('该功能当前已关闭'));

    await expect(parent.familyTasks(11)).resolves.toEqual([]);
  });

  it('still surfaces a real list when the flag is on', async () => {
    const { parent } = await loadService(() =>
      ok({ tasks: [{ id: 1, student_id: 11, title: '一起收拾书桌', status: 'pending' }] }),
    );

    const tasks = await parent.familyTasks(11);

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ title: '一起收拾书桌', status: 'pending' });
  });

  it('approves through the family-task route', async () => {
    const { parent, fake } = await loadService(() => ok({}));

    await parent.reviewFamilyTask(7, 'approved');

    const [request] = fake.requestsTo('/api/family-tasks/7');
    expect(request.method).toBe('PUT');
    expect(request.data).toEqual({ status: 'approved' });
  });
});

describe('请假假条', () => {
  it('unwraps data, which is what the route answers - not "leaves"', async () => {
    const { parent } = await loadService(() =>
      ok({ data: [{ id: 1, student_id: 11, start_date: '2026-10-02', end_date: '2026-10-03', status: 'pending' }] }),
    );

    const leaves = await parent.myLeaves();

    expect(leaves).toHaveLength(1);
    expect(leaves[0]).toMatchObject({ status: 'pending' });
  });

  it('reads an absent list as empty rather than throwing', async () => {
    const { parent } = await loadService(() => ok({}));

    await expect(parent.myLeaves()).resolves.toEqual([]);
  });

  it('sends exactly the four fields the route reads', async () => {
    // `type` is not one of them and the table has no such column, so a form that collected "病假/事假"
    // would drop it silently. Pinning the body keeps that from creeping back in.
    const { parent, fake } = await loadService(() => ok({}));

    await parent.createLeave({ student_id: 11, start_date: '2026-10-02', end_date: '2026-10-03', reason: '感冒' });

    const [request] = fake.requestsTo('/api/leaves');
    expect(request.method).toBe('POST');
    expect(request.data).toEqual({
      student_id: 11,
      start_date: '2026-10-02',
      end_date: '2026-10-03',
      reason: '感冒',
    });
  });
});

describe('今日祝福', () => {
  it('posts the child id the route requires', async () => {
    const { parent, fake } = await loadService(() => ok({}));

    await parent.blessChild(11);

    const [request] = fake.requestsTo('/api/parent-buff');
    expect(request.method).toBe('POST');
    expect(request.data).toEqual({ studentId: 11 });
  });

  it('lets the daily-limit refusal through, because its wording is the instruction', async () => {
    // The screen prints the server's sentence: "今日已经施放过祝福了" tells the parent the day is done,
    // and a generic failure would not.
    const { parent } = await loadService(() => fail('今日已经施放过祝福了', 400));

    await expect(parent.blessChild(11)).rejects.toMatchObject({ message: '今日已经施放过祝福了' });
  });
});
