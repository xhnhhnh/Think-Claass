/**
 * learning's account-deletion cleanup rule.
 *
 * `DELETE /api/admin/users/:id` deletes a teacher, their classes, their students and everything
 * those students own. Before this round the whole cascade was one Prisma transaction inside
 * `api/modules/admin/admin.repository.ts` that deleted from 58 tables by hard-coded name - atomic,
 * but invisible to every ownership check the plugin runtime enforces. The ruling in
 * `docs/migration/admin-cascade-decision.md` hands each table back to its owner and keeps the
 * atomicity by running the owners' rules in one transaction.
 *
 * This file is one of those rules. Its statements are the pre-migration ones, ported verbatim from
 * `admin.repository.ts` (the pre-migration line numbers are cited per block below) - the point is
 * *who* deletes, not *what* is deleted.
 *
 * ## The id sets are derived in dependency order, inside the transaction
 *
 * `CleanupSubject` names the teacher, their classes, their students and their logins. Everything
 * this rule deletes is found from those by a chain of lookups - papers from the class, paper items
 * from the paper, rubric points from the item, submissions from the paper *or* the student, answers
 * from the submission *or* the item, wrong questions from the student *or* the teacher's questions,
 * study plans from the student (`admin.repository.ts:242-336`). Each lookup is guarded exactly as
 * the pre-migration code guarded its `findMany`: the query only ran when the set it filters on was
 * non-empty, and the delete that followed only ran when its own set was non-empty. The guards are
 * preserved rather than collapsed because "no ids" has to stay "no rows".
 *
 * ## Two tables this rule adopts (P4.3b.14)
 *
 * `notes` and `rubric_point_scores` had **no owner at all**: the boot schema creates them and only
 * the old admin cascade ever touched them, through Prisma, which is why nothing noticed. They are
 * learning's because they belong to this plugin's schema cluster: `rubric_point_scores.answer_id ->
 * paper_answers.id` and `rubric_point_scores.rubric_point_id -> rubric_points.id` are foreign keys
 * into tables this plugin already owns, and `notes` references the teacher, the student and the
 * class whose papers and study plans are being deleted here. An unowned table cannot have a cleanup
 * rule - a rule may only name tables its plugin declared - so the ownership question had to be
 * answered rather than worked around. This is the same shape as classroom's P4.3b.14 adoption of
 * five orphan tables and identity's P4.3b.7 adoption of `users`/`activation_*`: giving an existing,
 * previously unowned table its first owner, not claiming someone else's.
 *
 * ## Order inside this rule
 *
 * Children before parents, and the two derivations that depend on an earlier delete stay last:
 * rubric_point_scores -> paper_answers/rubric_points -> paper_submissions/paper_items -> papers,
 * wrong_question_attempts -> wrong_questions, study_plan_items -> study_plans, then `notes` (line
 * 489) and finally `questions` (line 551) - `paper_items.question_id` and
 * `wrong_questions.question_id` both point at `questions`, so it goes after them. The registry
 * orders *rules*; ordering within one owner's set of tables is the owner's job, and is what the
 * pre-migration cascade did by hand.
 */

import type { CleanupRule, DbApi, SqlFragment } from '@thinkclass/plugin-sdk';
import { inList, orAll } from '@thinkclass/plugin-sdk';

/**
 * Tables this rule deletes from. Every one is declared in the manifest, and the runtime refuses to
 * register a rule that names anything else - which is what makes "it only touches its own data" a
 * checked property instead of a review habit.
 */
const TABLES = [
  'rubric_point_scores',
  'paper_answers',
  'rubric_points',
  'paper_submissions',
  'paper_items',
  'papers',
  'wrong_question_attempts',
  'wrong_questions',
  'study_plan_items',
  'study_plans',
  'notes',
  'questions',
];

/** `SELECT id FROM <table> WHERE <predicate>` - one pre-migration `findMany({ select: { id } })`. */
function idsOf(tx: DbApi, table: string, predicate: SqlFragment): number[] {
  return tx
    .query<{ id: number }>(`SELECT id FROM ${table} WHERE ${predicate.sql}`, predicate.params)
    .map((row) => row.id);
}

export function createLearningCleanupRule(): CleanupRule {
  return {
    tables: TABLES,

    run(tx: DbApi, subject): void {
      const teachers = inList('teacher_id', subject.teacherIds);
      const classes = inList('class_id', subject.classIds);
      const students = inList('student_id', subject.studentIds);

      // -- derived id sets, in the pre-migration dependency order -------------------------------

      // papers: `teacher_id = teacherId OR class_id IN classIds` (lines 242-249).
      const paperScope = orAll([teachers, classes]);
      const paperIds = paperScope ? idsOf(tx, 'papers', paperScope) : [];

      // paper_items: `paper_id IN paperIds`, only when paperIds is non-empty (lines 266-273).
      const paperItemScope = inList('paper_id', paperIds);
      const paperItemIds = paperItemScope ? idsOf(tx, 'paper_items', paperItemScope) : [];

      // rubric_points: `paper_item_id IN paperItemIds`, only when paperItemIds is non-empty
      // (lines 275-282).
      const rubricPointScope = inList('paper_item_id', paperItemIds);
      const rubricPointIds = rubricPointScope ? idsOf(tx, 'rubric_points', rubricPointScope) : [];

      // paper_submissions: `paper_id IN paperIds OR student_id IN studentIds`, only when one of the
      // two is non-empty (lines 284-297).
      const submissionScope = orAll([inList('paper_id', paperIds), students]);
      const paperSubmissionIds = submissionScope ? idsOf(tx, 'paper_submissions', submissionScope) : [];

      // paper_answers: `submission_id IN paperSubmissionIds OR paper_item_id IN paperItemIds`, only
      // when one of the two is non-empty (lines 299-312).
      const answerScope = orAll([inList('submission_id', paperSubmissionIds), inList('paper_item_id', paperItemIds)]);
      const paperAnswerIds = answerScope ? idsOf(tx, 'paper_answers', answerScope) : [];

      // questions: `teacher_id = teacherId` (lines 250-255) - one fragment, so no `orAll` needed.
      const questionIds = teachers ? idsOf(tx, 'questions', teachers) : [];

      // wrong_questions: `student_id IN studentIds OR question_id IN questionIds`, only when one of
      // the two is non-empty (lines 314-327).
      const wrongQuestionScope = orAll([students, inList('question_id', questionIds)]);
      const wrongQuestionIds = wrongQuestionScope ? idsOf(tx, 'wrong_questions', wrongQuestionScope) : [];

      // study_plans: `student_id IN studentIds`, only when studentIds is non-empty (lines 329-336).
      const studyPlanIds = students ? idsOf(tx, 'study_plans', students) : [];

      // -- deletes, in the pre-migration order --------------------------------------------------

      // rubric_point_scores: `if (paperAnswerIds.length || rubricPointIds.length)` -> `deleteMany({
      // OR: [answer_id IN paperAnswerIds, rubric_point_id IN rubricPointIds] })` (lines 347-356).
      const scores = orAll([inList('answer_id', paperAnswerIds), inList('rubric_point_id', rubricPointIds)]);
      if (scores) {
        tx.run(`DELETE FROM rubric_point_scores WHERE ${scores.sql}`, scores.params);
      }

      // paper_answers (lines 358-360), then rubric_points (lines 361-363).
      const answerRows = inList('id', paperAnswerIds);
      if (answerRows) {
        tx.run(`DELETE FROM paper_answers WHERE ${answerRows.sql}`, answerRows.params);
      }
      const rubricPointRows = inList('id', rubricPointIds);
      if (rubricPointRows) {
        tx.run(`DELETE FROM rubric_points WHERE ${rubricPointRows.sql}`, rubricPointRows.params);
      }

      // paper_submissions (lines 364-366), paper_items (lines 367-369), papers (lines 370-372).
      const submissionRows = inList('id', paperSubmissionIds);
      if (submissionRows) {
        tx.run(`DELETE FROM paper_submissions WHERE ${submissionRows.sql}`, submissionRows.params);
      }
      const paperItemRows = inList('id', paperItemIds);
      if (paperItemRows) {
        tx.run(`DELETE FROM paper_items WHERE ${paperItemRows.sql}`, paperItemRows.params);
      }
      const paperRows = inList('id', paperIds);
      if (paperRows) {
        tx.run(`DELETE FROM papers WHERE ${paperRows.sql}`, paperRows.params);
      }

      // wrong_question_attempts then wrong_questions, both inside the `wrongQuestionIds.length`
      // guard (lines 374-377).
      const attempts = inList('wrong_question_id', wrongQuestionIds);
      const wrongQuestionRows = inList('id', wrongQuestionIds);
      if (attempts && wrongQuestionRows) {
        tx.run(`DELETE FROM wrong_question_attempts WHERE ${attempts.sql}`, attempts.params);
        tx.run(`DELETE FROM wrong_questions WHERE ${wrongQuestionRows.sql}`, wrongQuestionRows.params);
      }

      // study_plan_items then study_plans, both inside the `studyPlanIds.length` guard
      // (lines 378-381).
      const planItems = inList('plan_id', studyPlanIds);
      const studyPlanRows = inList('id', studyPlanIds);
      if (planItems && studyPlanRows) {
        tx.run(`DELETE FROM study_plan_items WHERE ${planItems.sql}`, planItems.params);
        tx.run(`DELETE FROM study_plans WHERE ${studyPlanRows.sql}`, studyPlanRows.params);
      }

      // notes: `OR: [{ teacher_id: teacherId }, ...(studentIds.length ? [{ student_id }] : []),
      // ...(classIds.length ? [{ class_id }] : [])]` (lines 489-497), with the `else` branch
      // `deleteMany({ teacher_id: teacherId })` when there were neither students nor classes
      // (line 504). The combined `OR` with the empty lists dropped is exactly equivalent: with both
      // lists empty it reduces to `teacher_id = teacherId`, which is the else branch, and `orAll`
      // drops precisely the empty branches. `teachers` is a fragment (`teacher_id IN (?)`), which
      // for the subject's single teacher is the same predicate as the pre-migration equality.
      const notes = orAll([teachers, students, classes]);
      if (notes) {
        tx.run(`DELETE FROM notes WHERE ${notes.sql}`, notes.params);
      }

      // questions: only when the derived set is non-empty (lines 551-553) - last, because
      // `paper_items` and `wrong_questions` reference it.
      const questionRows = inList('id', questionIds);
      if (questionRows) {
        tx.run(`DELETE FROM questions WHERE ${questionRows.sql}`, questionRows.params);
      }
    },
  };
}
