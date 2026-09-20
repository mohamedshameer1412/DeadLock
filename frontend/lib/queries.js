import { api, fetchSession } from "@/lib/api";
import { Account, Dashboard, Flashcards, Report, Revision, Saved, SearchAll, DocDetail, McqAnswer, McqJob, McqList, Progress, QuizHome, QuizResult, QuizState, DocList, QuestionDetail, QuestionList, SearchResult, Session, SubjectList, Subject, TopicList, check } from "@/lib/schemas";

export const keys = {
  session: ["session"],
  subjects: ["subjects"],
  subject: (id) => ["subject", id],
  docs: (id) => ["docs", id],
  doc: (id, doc) => ["doc", id, doc],
  topics: (id) => ["topics", id],
  search: (id, q) => ["search", id, q],
  account: ["account"],
  questions: (id) => ["questions", id],
  question: (id, q) => ["question", id, q],
  mcq: (id) => ["mcq", id],
  mcqJob: (id, j) => ["mcq-job", id, j],
  quiz: (id) => ["quiz", id],
  attempt: (id, a) => ["attempt", id, a],
  result: (id, a) => ["result", id, a],
  progress: (id) => ["progress", id],
  dashboard: ["dashboard"],
  saved: ["saved"],
  flashcards: (id) => ["flashcards", id],
  searchAll: (q) => ["search-all", q],
  revision: (id) => ["revision", id],
  report: (id) => ["report", id],
};

export const getSession = async () => check(Session, await fetchSession());
export const getSubjects = async () => check(SubjectList, await api("/subjects")).subjects;
export const getSubject = async (id) => check(Subject, await api(`/subjects/${id}`));
export const getDocs = async (id) => check(DocList, await api(`/subjects/${id}/materials`)).documents;
export const getDoc = async (id, doc) => check(DocDetail, await api(`/subjects/${id}/materials/${doc}`));
export const getTopics = async (id) => check(TopicList, await api(`/subjects/${id}/topics`)).topics;
export const getSearch = async (id, q) => check(SearchResult, await api(`/subjects/${id}/search?q=${encodeURIComponent(q)}`));
export const getAccount = async () => check(Account, await api("/account"));
export const getQuestions = async (id) => check(QuestionList, await api(`/subjects/${id}/questions`)).questions;
export const getQuestion = async (id, q) => check(QuestionDetail, await api(`/subjects/${id}/questions/${q}`));
export const getMcq = async (id) => check(McqList, await api(`/subjects/${id}/mcq`)).questions;
export const getMcqJob = async (id, job) => check(McqJob, await api(`/subjects/${id}/mcq/jobs/${job}`));
export const getMcqAnswer = async (id, item) => check(McqAnswer, await api(`/subjects/${id}/mcq/${item}/answer`));
export const getQuiz = async (id) => check(QuizHome, await api(`/subjects/${id}/quiz`));
export const getAttempt = async (id, a) => check(QuizState, await api(`/subjects/${id}/quiz/attempts/${a}`));
export const getResult = async (id, a) => check(QuizResult, await api(`/subjects/${id}/quiz/attempts/${a}/result`));
export const getProgress = async (id) => check(Progress, await api(`/subjects/${id}/progress`));
export const getDashboard = async () => check(Dashboard, await api("/dashboard"));
export const getRevision = async (id) => check(Revision, await api(`/subjects/${id}/revision`));
export const getReport = async (id) => check(Report, await api(`/subjects/${id}/report`));
export const getSaved = async () => check(Saved, await api("/saved"));
export const getFlashcards = async (id) => check(Flashcards, await api(`/subjects/${id}/flashcards`));
export const getSearchAll = async (q) => check(SearchAll, await api(`/search?q=${encodeURIComponent(q)}`));
