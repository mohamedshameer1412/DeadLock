import { BarChart3, FileText, GraduationCap, ListChecks, MessageCircleQuestion, NotebookPen, Route } from "lucide-react";

/** The sections of a subject: used by the subject tabs and by the sidebar. */
export const SECTIONS = [
  { slug: "materials", label: "Materials", Icon: FileText },
  { slug: "ask", label: "Ask", Icon: MessageCircleQuestion },
  { slug: "notes", label: "Notes", Icon: NotebookPen },
  { slug: "practice", label: "Practice", Icon: ListChecks },
  { slug: "quiz", label: "Quiz", Icon: GraduationCap },
  { slug: "progress", label: "Progress", Icon: BarChart3 },
  { slug: "roadmap", label: "Roadmap", Icon: Route },
];
