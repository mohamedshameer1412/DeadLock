import { BarChart3, FileText, GraduationCap, ListChecks, MessageCircleQuestion } from "lucide-react";

/** The five sections of a subject: used by the subject tabs and by the sidebar. */
export const SECTIONS = [
  { slug: "materials", label: "Materials", Icon: FileText },
  { slug: "ask", label: "Ask", Icon: MessageCircleQuestion },
  { slug: "practice", label: "Practice", Icon: ListChecks },
  { slug: "quiz", label: "Quiz", Icon: GraduationCap },
  { slug: "progress", label: "Progress", Icon: BarChart3 },
];
