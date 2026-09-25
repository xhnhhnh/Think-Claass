/**
 * Learning controller envelopes, delegation and status codes.
 *
 * Ported from `api/modules/learning/learning.controllers.test.ts` when the domain moved into
 * `plugins/learning`. The legacy suite asserted `{ success: true, data }` and the per-route
 * error translation; a plugin throws the kernel's `ApiError` instead, so the translation moved
 * to the composition's global filter and cannot be asserted here. What replaced it is the set of
 * things this domain's HTTP surface is contractually stuck with:
 *
 *   - `ok()` is `{ success: true, data }` and nothing else. This domain never flattened the
 *     payload onto the envelope the way pet and assignments did, so there are no duplicate keys
 *     to preserve - and none may appear.
 *   - Four routes answer the bare `{ success: true }` literal the legacy handlers returned
 *     (`PUT /api/paper-submissions/:id/answers`, `DELETE /api/knowledge/nodes/:id`,
 *     `DELETE /api/knowledge/edges/:id`, `POST /api/wrong-questions/:id/attempt`).
 *   - **No handler carries `@HttpCode`**, so Nest's defaults stand: POST answers 201, PUT and
 *     DELETE answer 200. The legacy controllers had no `@HttpCode` either, and adding one (as
 *     the pet domain had to, because *its* controllers pinned 200) would be a regression.
 *   - Authorization lives in the controller now - the legacy service gated first thing - with
 *     the same split: 401 for an unknown caller, 403 for a known one who may not. The three
 *     knowledge-graph reads were the domain's last open routes; the matrix rules them
 *     登录用户（teacher/student/admin）, so they too carry the gate now.
 *
 * The service fake mirrors the real service's sync/async split exactly (papers, subjects and the
 * knowledge graph are synchronous; submissions, wrong questions and study plans are async). That
 * is not cosmetic: `ok(this.service.createPaper(...))` is only correct while `createPaper` is
 * synchronous, so the fake would surface the mistake as a promise-typed `data`.
 */

import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { RequestMethod } from '@nestjs/common';

import { ApiError } from '@thinkclass/kernel';

import {
  KnowledgeController,
  PaperSubmissionsController,
  PapersController,
  StudyPlansController,
  WrongQuestionsController,
} from '../../plugins/learning/src/learning.controllers.js';

/** A request whose kernel context carries an actor, as the middleware would leave it. */
function fakeRequest(actor: { userId: number; role: string } | null): Request {
  return { context: { requestId: 'test', actor, authSource: actor ? 'session' : 'none' } } as unknown as Request;
}

/** The real service's public surface, with the same sync/async split. */
function fakeService() {
  return {
    // papers - synchronous (repository reads/writes over better-sqlite3)
    listPapers: vi.fn(async () => [{ id: 1, subjects: null }]),
    createPaper: vi.fn(() => ({ id: 2 })),
    getPaper: vi.fn(async () => ({ id: 1 })),
    updatePaper: vi.fn(() => ({ id: 1, status: 'published' })),
    savePaperStructure: vi.fn(() => ({ id: 1, paper_sections: [], paper_items: [] })),
    uploadPaperAsset: vi.fn(() => ({ id: 4, storage_path: '/uploads/papers/a.pdf' })),
    // submissions - asynchronous (they resolve the student through the classroom port)
    startPaperSubmission: vi.fn(async () => ({ submission: { id: 1 }, items: [] })),
    savePaperAnswers: vi.fn(async () => undefined),
    submitPaper: vi.fn(async () => ({ submission_id: 1, total_score: 5 })),
    // knowledge graph - synchronous
    listSubjects: vi.fn(() => [{ id: 1, name: '数学' }]),
    createSubject: vi.fn(() => ({ id: 2, name: '语文' })),
    listKnowledgeNodes: vi.fn(() => [{ id: 10 }]),
    createKnowledgeNode: vi.fn(() => ({ id: 11 })),
    updateKnowledgeNode: vi.fn(() => ({ id: 11, name: '函数' })),
    deleteKnowledgeNode: vi.fn(() => undefined),
    listKnowledgeEdges: vi.fn(() => [{ id: 20 }]),
    createKnowledgeEdge: vi.fn(() => ({ id: 21 })),
    deleteKnowledgeEdge: vi.fn(() => undefined),
    // wrong questions / study plans - asynchronous
    listWrongQuestions: vi.fn(async () => [{ id: 1 }]),
    attemptWrongQuestion: vi.fn(async () => undefined),
    generateWrongQuestionPractice: vi.fn(async () => [{ id: 9 }]),
    getMyStudyPlan: vi.fn(async () => ({ id: 2 })),
    createStudyPlan: vi.fn(async () => ({ id: 3 })),
    updateStudyPlanItem: vi.fn(async () => ({ id: 4, status: 'done' })),
  };
}

async function apiErrorOf(run: () => unknown): Promise<ApiError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('expected the call to throw, but it resolved');
}

const TEACHER_REQ = () => fakeRequest({ userId: 7, role: 'teacher' });
const STUDENT_REQ = () => fakeRequest({ userId: 8, role: 'student' });

// ---------------------------------------------------------------------------

describe('learning controllers: the data envelope', () => {
  it('keeps `{ success: true, data }` on all twenty data routes, with nothing flattened', async () => {
    const service = fakeService();
    const papers = new PapersController(service as never);
    const submissions = new PaperSubmissionsController(service as never);
    const knowledge = new KnowledgeController(service as never);
    const wrong = new WrongQuestionsController(service as never);
    const plans = new StudyPlansController(service as never);
    const staff = TEACHER_REQ();
    const student = STUDENT_REQ();

    const responses = [
      // papers
      await papers.listPapers(staff, '3'),
      await papers.createPaper(staff, { title: '周测' }),
      await papers.getPaper(staff, '1'),
      await papers.updatePaper(staff, '1', { status: 'published' }),
      await papers.saveStructure(staff, '1', { sections: [] }),
      await papers.uploadAsset(staff, '1', { originalname: 'a.pdf' } as never),
      // paper submissions
      await submissions.start(student, { paper_id: 1 }),
      await submissions.submit(student, '1'),
      // knowledge
      await knowledge.getSubjects(staff),
      await knowledge.createSubject(staff, { name: '语文' }),
      await knowledge.getNodes(staff, '1'),
      await knowledge.createNode(staff, { subject_id: 1, name: '函数' }),
      await knowledge.updateNode(staff, '11', { name: '导数' }),
      await knowledge.getEdges(staff, '1'),
      await knowledge.createEdge(staff, { subject_id: 1, from_node_id: 1, to_node_id: 2, edge_type: 'requires' }),
      // wrong questions
      await wrong.my(student),
      await wrong.generate(student, '1'),
      // study plans
      await plans.my(student),
      await plans.create(student, { target_score: 90 }),
      await plans.updateItem(student, '4', { status: 'done' }),
    ];

    for (const response of responses) {
      // Exactly two keys: this domain never spread the payload onto the envelope.
      expect(Object.keys(response)).toEqual(['success', 'data']);
      expect(response.success).toBe(true);
    }

    // No `data` may be a promise: that is what `return ok(this.service.someAsyncMethod(...))`
    // would produce, and it serialises as `data: {}` over HTTP without throwing anywhere.
    for (const response of responses) {
      expect((response as { data: unknown }).data).not.toBeInstanceOf(Promise);
    }

    expect(responses[0]).toEqual({ success: true, data: [{ id: 1, subjects: null }] });
    expect(responses[5]).toEqual({ success: true, data: { id: 4, storage_path: '/uploads/papers/a.pdf' } });
    expect(responses[6]).toEqual({ success: true, data: { submission: { id: 1 }, items: [] } });
    expect(responses[15]).toEqual({ success: true, data: [{ id: 1 }] });
    expect(responses[19]).toEqual({ success: true, data: { id: 4, status: 'done' } });
  });

  it('keeps the four bare `{ success: true }` legacy responses, with no `data` key', async () => {
    const service = fakeService();
    const submissions = new PaperSubmissionsController(service as never);
    const knowledge = new KnowledgeController(service as never);
    const wrong = new WrongQuestionsController(service as never);
    const staff = TEACHER_REQ();
    const student = STUDENT_REQ();

    await expect(submissions.saveAnswers(student, '1', { answers: [{ paper_item_id: 1, answer_json: 'A' }] })).resolves.toEqual(
      { success: true },
    );
    await expect(knowledge.deleteNode(staff, '11')).resolves.toEqual({ success: true });
    await expect(knowledge.deleteEdge(staff, '21')).resolves.toEqual({ success: true });
    await expect(wrong.attempt(student, '1', { is_correct: 1 })).resolves.toEqual({ success: true });

    // ...and each one really did reach its service method.
    expect(service.savePaperAnswers).toHaveBeenCalledTimes(1);
    expect(service.deleteKnowledgeNode).toHaveBeenCalledWith({ id: 7, role: 'teacher' }, '11');
    expect(service.deleteKnowledgeEdge).toHaveBeenCalledWith({ id: 7, role: 'teacher' }, '21');
    expect(service.attemptWrongQuestion).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------

describe('learning controllers: delegation', () => {
  it('forwards the legacy arguments unchanged, raw query strings included', async () => {
    const service = fakeService();
    const papers = new PapersController(service as never);
    const knowledge = new KnowledgeController(service as never);
    const plans = new StudyPlansController(service as never);
    const staff = TEACHER_REQ();
    const student = STUDENT_REQ();
    const actor = { id: 7, role: 'teacher' };
    const file = { originalname: 'a.pdf' } as never;

    await papers.listPapers(staff, '3');
    expect(service.listPapers).toHaveBeenCalledWith(actor, '3');
    await papers.listPapers(staff, undefined);
    expect(service.listPapers).toHaveBeenLastCalledWith(actor, undefined);

    // The service owns numeric validation, so the raw query value is what must arrive.
    await knowledge.getNodes(staff, '1');
    expect(service.listKnowledgeNodes).toHaveBeenCalledWith('1');
    await knowledge.getNodes(staff, undefined);
    expect(service.listKnowledgeNodes).toHaveBeenLastCalledWith(undefined);

    await knowledge.getEdges(staff, '2');
    expect(service.listKnowledgeEdges).toHaveBeenCalledWith('2');

    // `getSubjects` passes no request on to the service: the gate is a login gate, and the
    // subject list itself takes no scope.
    await knowledge.getSubjects(staff);
    expect(service.listSubjects).toHaveBeenCalledWith();

    await papers.createPaper(staff, { title: '周测', class_id: '3' });
    expect(service.createPaper).toHaveBeenCalledWith(actor, { title: '周测', class_id: '3' });

    await papers.uploadAsset(staff, '1', file);
    expect(service.uploadPaperAsset).toHaveBeenCalledWith(actor, '1', file);

    await plans.updateItem(student, '4', { status: 'done' });
    expect(service.updateStudyPlanItem).toHaveBeenCalledWith({ id: 8, role: 'student' }, '4', { status: 'done' });
  });
});

// ---------------------------------------------------------------------------

describe('learning controllers: authorization', () => {
  it('gates every staff route with 401/403 before the service is reached', async () => {
    const service = fakeService();
    const papers = new PapersController(service as never);
    const knowledge = new KnowledgeController(service as never);

    const anonymous = fakeRequest(null);
    const student = fakeRequest({ userId: 3, role: 'student' });
    const parent = fakeRequest({ userId: 4, role: 'parent' });

    const routes: Array<{ label: string; run: (req: Request) => Promise<unknown>; method: keyof ReturnType<typeof fakeService> }> = [
      { label: 'POST /api/papers', run: (req) => papers.createPaper(req, {}), method: 'createPaper' },
      { label: 'PUT /api/papers/:id', run: (req) => papers.updatePaper(req, '1', {}), method: 'updatePaper' },
      {
        label: 'PUT /api/papers/:id/structure',
        run: (req) => papers.saveStructure(req, '1', {}),
        method: 'savePaperStructure',
      },
      {
        label: 'POST /api/papers/:id/assets',
        run: (req) => papers.uploadAsset(req, '1', undefined),
        method: 'uploadPaperAsset',
      },
      {
        label: 'POST /api/knowledge/subjects',
        run: (req) => knowledge.createSubject(req, {}),
        method: 'createSubject',
      },
      { label: 'POST /api/knowledge/nodes', run: (req) => knowledge.createNode(req, {}), method: 'createKnowledgeNode' },
      {
        label: 'PUT /api/knowledge/nodes/:id',
        run: (req) => knowledge.updateNode(req, '1', {}),
        method: 'updateKnowledgeNode',
      },
      {
        label: 'DELETE /api/knowledge/nodes/:id',
        run: (req) => knowledge.deleteNode(req, '1'),
        method: 'deleteKnowledgeNode',
      },
      { label: 'POST /api/knowledge/edges', run: (req) => knowledge.createEdge(req, {}), method: 'createKnowledgeEdge' },
      {
        label: 'DELETE /api/knowledge/edges/:id',
        run: (req) => knowledge.deleteEdge(req, '1'),
        method: 'deleteKnowledgeEdge',
      },
    ];

    for (const route of routes) {
      expect({ label: route.label, error: (await apiErrorOf(() => route.run(anonymous))).message }).toEqual({
        label: route.label,
        error: '未登录或登录已过期',
      });
      expect((await apiErrorOf(() => route.run(student))).statusCode, route.label).toBe(403);
      expect((await apiErrorOf(() => route.run(parent))).statusCode, route.label).toBe(403);
      expect(service[route.method], route.label).not.toHaveBeenCalled();
    }
  });

  it('gates every student route with 401/403 before the service is reached', async () => {
    const service = fakeService();
    const submissions = new PaperSubmissionsController(service as never);
    const wrong = new WrongQuestionsController(service as never);
    const plans = new StudyPlansController(service as never);

    const anonymous = fakeRequest(null);
    const teacher = fakeRequest({ userId: 7, role: 'teacher' });

    const routes: Array<{ label: string; run: (req: Request) => Promise<unknown>; method: keyof ReturnType<typeof fakeService> }> = [
      { label: 'POST /api/paper-submissions/start', run: (req) => submissions.start(req, {}), method: 'startPaperSubmission' },
      {
        label: 'PUT /api/paper-submissions/:id/answers',
        run: (req) => submissions.saveAnswers(req, '1', {}),
        method: 'savePaperAnswers',
      },
      { label: 'POST /api/paper-submissions/:id/submit', run: (req) => submissions.submit(req, '1'), method: 'submitPaper' },
      { label: 'GET /api/wrong-questions/my', run: (req) => wrong.my(req), method: 'listWrongQuestions' },
      { label: 'POST /api/wrong-questions/:id/attempt', run: (req) => wrong.attempt(req, '1', {}), method: 'attemptWrongQuestion' },
      { label: 'POST /api/wrong-questions/:id/generate', run: (req) => wrong.generate(req, '1'), method: 'generateWrongQuestionPractice' },
      { label: 'GET /api/study-plans/my', run: (req) => plans.my(req), method: 'getMyStudyPlan' },
      { label: 'POST /api/study-plans', run: (req) => plans.create(req, {}), method: 'createStudyPlan' },
      { label: 'PUT /api/study-plans/items/:id', run: (req) => plans.updateItem(req, '4', {}), method: 'updateStudyPlanItem' },
    ];

    for (const route of routes) {
      expect((await apiErrorOf(() => route.run(anonymous))).statusCode, route.label).toBe(401);
      expect((await apiErrorOf(() => route.run(teacher))).statusCode, route.label).toBe(403);
      expect(service[route.method], route.label).not.toHaveBeenCalled();
    }
  });

  it('gates the three knowledge reads: logged-in teacher/student/admin, never anonymous or parent', async () => {
    const service = fakeService();
    const knowledge = new KnowledgeController(service as never);

    const anonymous = fakeRequest(null);
    const parent = fakeRequest({ userId: 4, role: 'parent' });
    const teacher = fakeRequest({ userId: 7, role: 'teacher' });
    const student = fakeRequest({ userId: 8, role: 'student' });
    const admin = fakeRequest({ userId: 9, role: 'admin' });

    const routes: Array<{
      label: string;
      run: (req: Request) => Promise<unknown>;
      method: keyof ReturnType<typeof fakeService>;
    }> = [
      { label: 'GET /api/knowledge/subjects', run: (req) => knowledge.getSubjects(req), method: 'listSubjects' },
      { label: 'GET /api/knowledge/nodes', run: (req) => knowledge.getNodes(req, '1'), method: 'listKnowledgeNodes' },
      { label: 'GET /api/knowledge/edges', run: (req) => knowledge.getEdges(req, '1'), method: 'listKnowledgeEdges' },
    ];

    for (const route of routes) {
      // The matrix's 应属角色 for these three reads is 登录用户（teacher/student/admin）: the graph
      // is course content with no user data, so the gate is "we know who you are" and there is no
      // scope to filter on.
      expect((await apiErrorOf(() => route.run(anonymous))).message, route.label).toBe('未登录或登录已过期');
      expect((await apiErrorOf(() => route.run(parent))).statusCode, route.label).toBe(403);
      expect(service[route.method], route.label).not.toHaveBeenCalled();

      for (const allowed of [teacher, student, admin]) {
        expect(((await route.run(allowed)) as { success: boolean }).success, route.label).toBe(true);
      }
      expect(service[route.method], route.label).toHaveBeenCalledTimes(3);
    }
  });

  it('leaves the two paper reads filtered rather than pre-gated: the actor reaches the service, which decides', async () => {
    const service = fakeService();
    const papers = new PapersController(service as never);
    const anonymous = fakeRequest(null);

    // The legacy service gated these itself (403 for an unknown role on `listPapers`, 403 for a
    // non-owner on `getPaper`), and it still does - so the controller must not pre-empt it.
    expect(await papers.listPapers(anonymous)).toEqual({ success: true, data: [{ id: 1, subjects: null }] });
    expect(service.listPapers).toHaveBeenCalledWith({ id: null, role: null }, undefined);

    expect(await papers.getPaper(anonymous, '1')).toEqual({ success: true, data: { id: 1 } });
    expect(service.getPaper).toHaveBeenCalledWith({ id: null, role: null }, '1');
  });
});

// ---------------------------------------------------------------------------

describe('learning controllers: status codes', () => {
  const routes: Array<{ label: string; handler: (...args: never[]) => unknown; verb: keyof typeof RequestMethod }> = [
    { label: 'PapersController.listPapers', handler: PapersController.prototype.listPapers, verb: 'GET' },
    { label: 'PapersController.createPaper', handler: PapersController.prototype.createPaper, verb: 'POST' },
    { label: 'PapersController.getPaper', handler: PapersController.prototype.getPaper, verb: 'GET' },
    { label: 'PapersController.updatePaper', handler: PapersController.prototype.updatePaper, verb: 'PUT' },
    { label: 'PapersController.saveStructure', handler: PapersController.prototype.saveStructure, verb: 'PUT' },
    { label: 'PapersController.uploadAsset', handler: PapersController.prototype.uploadAsset, verb: 'POST' },
    { label: 'PaperSubmissionsController.start', handler: PaperSubmissionsController.prototype.start, verb: 'POST' },
    { label: 'PaperSubmissionsController.saveAnswers', handler: PaperSubmissionsController.prototype.saveAnswers, verb: 'PUT' },
    { label: 'PaperSubmissionsController.submit', handler: PaperSubmissionsController.prototype.submit, verb: 'POST' },
    { label: 'KnowledgeController.getSubjects', handler: KnowledgeController.prototype.getSubjects, verb: 'GET' },
    { label: 'KnowledgeController.createSubject', handler: KnowledgeController.prototype.createSubject, verb: 'POST' },
    { label: 'KnowledgeController.getNodes', handler: KnowledgeController.prototype.getNodes, verb: 'GET' },
    { label: 'KnowledgeController.createNode', handler: KnowledgeController.prototype.createNode, verb: 'POST' },
    { label: 'KnowledgeController.updateNode', handler: KnowledgeController.prototype.updateNode, verb: 'PUT' },
    { label: 'KnowledgeController.deleteNode', handler: KnowledgeController.prototype.deleteNode, verb: 'DELETE' },
    { label: 'KnowledgeController.getEdges', handler: KnowledgeController.prototype.getEdges, verb: 'GET' },
    { label: 'KnowledgeController.createEdge', handler: KnowledgeController.prototype.createEdge, verb: 'POST' },
    { label: 'KnowledgeController.deleteEdge', handler: KnowledgeController.prototype.deleteEdge, verb: 'DELETE' },
    { label: 'WrongQuestionsController.my', handler: WrongQuestionsController.prototype.my, verb: 'GET' },
    { label: 'WrongQuestionsController.attempt', handler: WrongQuestionsController.prototype.attempt, verb: 'POST' },
    { label: 'WrongQuestionsController.generate', handler: WrongQuestionsController.prototype.generate, verb: 'POST' },
    { label: 'StudyPlansController.my', handler: StudyPlansController.prototype.my, verb: 'GET' },
    { label: 'StudyPlansController.create', handler: StudyPlansController.prototype.create, verb: 'POST' },
    { label: 'StudyPlansController.updateItem', handler: StudyPlansController.prototype.updateItem, verb: 'PUT' },
  ];

  it('pins the five legacy controller prefixes and the 24-route verb split', () => {
    expect(Reflect.getMetadata('path', PapersController)).toBe('api/papers');
    expect(Reflect.getMetadata('path', PaperSubmissionsController)).toBe('api/paper-submissions');
    expect(Reflect.getMetadata('path', KnowledgeController)).toBe('api/knowledge');
    expect(Reflect.getMetadata('path', WrongQuestionsController)).toBe('api/wrong-questions');
    expect(Reflect.getMetadata('path', StudyPlansController)).toBe('api/study-plans');

    const counts: Record<string, number> = {};
    for (const route of routes) {
      expect(typeof route.handler, route.label).toBe('function');
      expect(Reflect.getMetadata('method', route.handler), route.label).toBe(RequestMethod[route.verb]);
      counts[route.verb] = (counts[route.verb] ?? 0) + 1;
    }
    // The whole surface, pinned: adding a route has to touch this list.
    expect(counts).toEqual({ GET: 7, POST: 10, PUT: 5, DELETE: 2 });
  });

  it('carries no @HttpCode on any handler, so POST answers 201 and PUT/DELETE answer 200', () => {
    for (const route of routes) {
      // Nest's HttpCode decorator defines `__httpCode__` on the handler function itself.
      expect(Reflect.getMetadataKeys(route.handler), route.label).not.toContain('__httpCode__');
      expect(Reflect.getMetadata('__httpCode__', route.handler), route.label).toBeUndefined();
    }

    // Non-vacuity: the probe does read Nest's route metadata off these very functions, so a
    // third key written by @HttpCode would have shown up above.
    expect(Reflect.getMetadataKeys(PapersController.prototype.createPaper)).toEqual(
      expect.arrayContaining(['path', 'method']),
    );
  });
});

// ---------------------------------------------------------------------------

describe('learning controllers: errors', () => {
  it('lets a service ApiError reach the kernel with its status intact', async () => {
    const service = fakeService();
    service.getPaper.mockImplementation(() => {
      throw new ApiError(404, 'Paper not found');
    });
    service.savePaperAnswers.mockRejectedValue(new ApiError(400, 'Missing answers'));
    const papers = new PapersController(service as never);
    const submissions = new PaperSubmissionsController(service as never);

    const notFound = await apiErrorOf(() => papers.getPaper(TEACHER_REQ(), '99'));
    expect(notFound.statusCode).toBe(404);
    expect(notFound.message).toBe('Paper not found');

    const missingAnswers = await apiErrorOf(() => submissions.saveAnswers(STUDENT_REQ(), '1', { answers: [] }));
    expect(missingAnswers.statusCode).toBe(400);
    expect(missingAnswers.message).toBe('Missing answers');

    // The legacy controller wrapped both in a hand-built HttpException; the kernel's filter
    // renders `{success:false,message}` from the ApiError directly, so nothing may swallow it.
    expect(service.getPaper).toHaveBeenCalledWith({ id: 7, role: 'teacher' }, '99');
  });

  it('propagates a synchronous service throw from the un-awaited delete routes', async () => {
    const service = fakeService();
    service.deleteKnowledgeNode.mockImplementation(() => {
      throw new ApiError(500, 'knowledge_nodes.delete failed: no matching record');
    });
    service.deleteKnowledgeEdge.mockImplementation(() => {
      throw new ApiError(500, 'knowledge_edges.delete failed: no matching record');
    });
    const knowledge = new KnowledgeController(service as never);
    const staff = TEACHER_REQ();

    // `deleteNode` calls the service without `await`. That is only safe because the method is
    // synchronous: the throw still reaches the caller (and the global filter renders a 500)
    // rather than becoming an unhandled rejection answered with a 200 `{success:true}`.
    const nodeError = await apiErrorOf(() => knowledge.deleteNode(staff, '999'));
    expect(nodeError.statusCode).toBe(500);
    expect(nodeError.message).toBe('knowledge_nodes.delete failed: no matching record');
    expect(service.deleteKnowledgeNode).toHaveBeenCalledWith({ id: 7, role: 'teacher' }, '999');

    const edgeError = await apiErrorOf(() => knowledge.deleteEdge(staff, '999'));
    expect(edgeError.statusCode).toBe(500);
    expect(service.deleteKnowledgeEdge).toHaveBeenCalledWith({ id: 7, role: 'teacher' }, '999');
  });
});
