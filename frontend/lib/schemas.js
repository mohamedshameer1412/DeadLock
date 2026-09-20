// Runtime checks of every API response (JavaScript has no compiler to catch a renamed field). A mismatch throws one clear error.
import { z } from "zod";

export const User = z.object({ id: z.number(), username: z.string(), cloud_consent: z.boolean() });
export const Session = z.object({ authenticated: z.boolean(), user: User.nullable(), csrf: z.string() });

export const Counts = z.object({ documents: z.number(), topics: z.number(), questions: z.number(), practice_questions: z.number() });
export const Subject = z.object({ id: z.number(), name: z.string(), description: z.string(), created_at: z.string(), counts: Counts });
export const SubjectList = z.object({ subjects: z.array(Subject) });

export const Doc = z.object({
  id: z.number(), kind: z.string(), title: z.string(), source: z.string(), pages: z.number().nullable(), status: z.string(),
  warnings: z.array(z.string()), bytes: z.number(), chunks: z.number(), created_at: z.string(),
});
export const DocList = z.object({ documents: z.array(Doc) });
export const Upload = z.object({ document: Doc, duplicate: z.boolean() });
export const Passage = z.object({
  id: z.number(), ordinal: z.number(), page_start: z.number().nullable(), page_end: z.number().nullable(), heading_path: z.string(),
  text: z.string(), quarantined: z.boolean(), flag_reason: z.string(),
});
export const DocDetail = z.object({ document: Doc, passages: z.array(Passage) });
export const TopicList = z.object({ topics: z.array(z.object({ id: z.number(), name: z.string(), path: z.string(), passages: z.number() })) });
export const SearchResult = z.object({
  query: z.string(), terms: z.array(z.string()),
  results: z.array(z.object({
    passage_id: z.number(), document_id: z.number(), document: z.string(), heading_path: z.string(), page_start: z.number().nullable(),
    page_end: z.number().nullable(), text: z.string(), matched: z.array(z.string()), relevant: z.boolean(),
  })),
});
export const Account = z.object({ user: User, key_configured: z.boolean(), allowed_models: z.array(z.string()) });

export const Citation = z.object({
  passage_id: z.number().nullable(), quote: z.string(), document: z.string(), heading_path: z.string(),
  page_start: z.number().nullable(), page_end: z.number().nullable(),
});
export const Claim = z.object({ text: z.string(), citations: z.array(Citation) });
export const Source = z.object({
  passage_id: z.number().nullable(), document: z.string(), heading_path: z.string(), page_start: z.number().nullable(),
  page_end: z.number().nullable(), text: z.string(), matched: z.array(z.string()),
});
export const QuestionItem = z.object({
  id: z.number(), question: z.string(), status: z.string(), tier: z.string().nullable().optional(), feedback: z.string().nullable().optional(), saved: z.boolean().optional(),
  created_at: z.string(),
});
export const QuestionList = z.object({ questions: z.array(QuestionItem) });
export const QuestionDetail = QuestionItem.extend({
  model: z.string().nullable().optional(), reason: z.string().optional(), kind: z.string().optional(), dropped: z.number().optional(),
  explanation: z.string().optional(), claims: z.array(Claim).optional(), sources: z.array(Source).optional(),
  verification: z.array(z.string()).optional(), steps: z.array(z.object({ by: z.string(), text: z.string() })).optional(),
});

// ---- practice (multiple-choice) ----
export const Mcq = z.object({ id: z.number(), topic_id: z.number().nullable(), topic_path: z.string(), question: z.string(), options: z.array(z.string()), created_at: z.string() });
export const McqList = z.object({ questions: z.array(Mcq) });
export const McqStarted = z.object({ id: z.number(), status: z.string() });
export const McqJob = z.object({
  id: z.number(), status: z.string(), scope: z.string(), requested: z.number(), produced: z.number(), rejected: z.number(), reason: z.string().nullable().optional(),
  model: z.string().nullable().optional(), tier: z.string().nullable().optional(), questions: z.array(Mcq), steps: z.array(z.object({ by: z.string(), text: z.string() })),
});
export const McqAnswer = z.object({
  id: z.number(), answer_index: z.number(), answer: z.string(), explanation: z.string(), quote: z.string(), document: z.string().nullable().optional(),
  heading_path: z.string().nullable().optional(), page_start: z.number().nullable().optional(), page_end: z.number().nullable().optional(), independently_checked: z.boolean(),
});

// ---- quiz and progress ----
export const Weak = z.object({ topic_id: z.number(), name: z.string(), path: z.string(), answered: z.number(), correct: z.number(), mastery: z.number(), state: z.string() });
export const Attempt = z.object({ id: z.number(), mode: z.enum(["practice", "assessment"]), kind: z.string().optional(), active: z.boolean(), started_at: z.string().nullable(), finished_at: z.string().nullable(), correct: z.number(), incorrect: z.number(), answered: z.number() });
export const QuizHome = z.object({
  questions_in_bank: z.number(), topics: z.array(z.object({ id: z.number(), path: z.string() })), active_attempt: z.number().nullable(), active_mode: z.string().nullable().optional(),
  attempts: z.array(Attempt), weak_topics: z.array(Weak),
});
export const QuizState = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("mcq"), attempt: Attempt, total_questions: z.number(), position: z.number(),
    item: z.object({
      answer_row_id: z.number(), item_id: z.number(), question: z.string(), options: z.array(z.string()), topic_path: z.string().nullable().optional(),
      topic: z.string().nullable().optional(), backtrack: z.object({ from: z.string().nullable(), topic: z.string().nullable() }).nullable().optional(),
    }),
  }),
  z.object({ state: z.literal("complete"), attempt: Attempt }),
]);
export const QuizResult = z.object({
  attempt: Attempt, skipped: z.number(), ended_reason: z.string().nullable(),
  answers: z.array(z.object({ question: z.string(), topic: z.string(), options: z.array(z.string()), chosen_index: z.number(), answer_index: z.number(), correct: z.boolean(), explanation: z.string(), backtrack: z.boolean().optional() })),
  focus_events: z.object({ tab_switch: z.number(), full_screen_exit: z.number(), copy_attempt: z.number(), paste_attempt: z.number() }),
  weak_topics: z.array(Weak),
});
const Topic = z.object({
  topic_id: z.number(), name: z.string(), path: z.string(), answered: z.number(), correct: z.number(), mastery: z.number(), state: z.string(),
  confidence: z.number().nullable(), theta: z.number().nullable(), se: z.number().nullable(), expected_accuracy: z.number().nullable(), label: z.string(),
  avg_seconds: z.number().nullable(), recent_accuracy: z.number().nullable(),
});
const Overall = z.object({ theta: z.number(), se: z.number(), confidence: z.number(), expected_accuracy: z.number(), answered: z.number(), correct: z.number() });
const Trend = z.object({ attempt_id: z.number(), at: z.number().nullable(), theta: z.number(), confidence: z.number(), accuracy: z.number(), answered: z.number() });
export const Progress = z.object({
  topics: z.array(Topic), weak_topics: z.array(Weak), overall: Overall.nullable(), ability_trend: z.array(Trend),
  prerequisites: z.array(z.object({ topic_id: z.number(), topic: z.string(), prereq_id: z.number(), prereq: z.string() })),
});
export const Revision = z.object({
  wrong: z.array(z.object({ item_id: z.number(), question: z.string(), options: z.array(z.string()), chosen_index: z.number().nullable(), answer_index: z.number(), explanation: z.string(), topic: z.string() })),
  shaky_topics: z.array(z.object({ topic_id: z.number(), name: z.string(), confidence: z.number(), answered: z.number(), correct: z.number() })),
});
export const Report = z.object({
  generated_at: z.string(), subject: z.string(), overall: Overall.nullable(), method: z.string(), recommendations: z.array(z.string()), wrong_questions: z.number(),
  topics: z.array(z.object({ topic_id: z.number(), name: z.string(), answered: z.number(), correct: z.number(), confidence: z.number().nullable(), theta: z.number().nullable(), label: z.string(), avg_seconds: z.number().nullable() })),
  ability_trend: z.array(Trend),
  attempts: z.array(Attempt.extend({ ended_reason: z.string().nullable() })),
  backtracking: z.array(z.object({ topic: z.string(), asked: z.number(), correct: z.number() })),
});

// ---- dashboard ----
export const Saved = z.object({ saved: z.array(z.object({ id: z.number(), subject_id: z.number(), subject: z.string(), question: z.string(), status: z.string(), created_at: z.string() })) });
export const Flashcards = z.object({
  cards: z.array(z.object({ item_id: z.number(), question: z.string(), options: z.array(z.string()), topic: z.string(), is_new: z.boolean() })),
  total: z.number(), due: z.number(), new: z.number(), next_due: z.string().nullable(),
});
export const SearchAll = z.object({
  query: z.string(), terms: z.array(z.string()),
  results: z.array(z.object({
    subject_id: z.number(), subject: z.string(), passage_id: z.number(), document_id: z.number(), document: z.string(), heading_path: z.string(),
    page_start: z.number().nullable(), page_end: z.number().nullable(), text: z.string(), matched: z.array(z.string()),
  })),
});
export const Dashboard = z.object({
  totals: z.object({ subjects: z.number(), materials: z.number(), questions: z.number(), practice_questions: z.number(), quizzes: z.number(), answered: z.number(), correct: z.number() }),
  subjects: z.array(z.object({ id: z.number(), name: z.string(), materials: z.number(), questions: z.number(), practice_questions: z.number(), quizzes: z.number(), answered: z.number(), correct: z.number() })),
  activity: z.array(z.object({ date: z.string(), asked: z.number(), answered: z.number() })),
  quiz_trend: z.array(z.object({ attempt_id: z.number(), subject_id: z.number(), subject: z.string(), finished_at: z.string().nullable(), correct: z.number(), answered: z.number() })),
  topic_states: z.object({ mastered: z.number(), learning: z.number(), weak: z.number(), unknown: z.number() }),
  question_outcomes: z.object({ answered: z.number(), extractive: z.number(), abstained: z.number(), failed: z.number(), pending: z.number() }),
  feedback: z.object({ helpful: z.number(), wrong: z.number() }),
  weak_topics: z.array(z.object({ topic_id: z.number(), subject_id: z.number(), subject: z.string(), name: z.string(), answered: z.number(), correct: z.number(), mastery: z.number(), state: z.string() })),
  streak: z.object({ days: z.number(), today: z.number(), goal: z.number() }).optional(),
});

/** @template T @param {import('zod').ZodType<T>} schema @param {unknown} data @returns {T} */
export function check(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) throw new Error(`The server sent an unexpected response (${r.error.issues[0]?.path.join(".") || "root"}).`);
  return r.data;
}
