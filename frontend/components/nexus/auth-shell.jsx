"use client";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { BookCheck, GraduationCap, LineChart, ShieldCheck, Undo2 } from "lucide-react";

const SCENES = {
  login: { title: "Master your potential.", text: "Pick up where you left off." },
  register: { title: "Your journey starts here.", text: "Learn with purpose. Grow with confidence." },
  reset: { title: "Back in a minute.", text: "A one-time code brings you back into your account." },
};
const FEATURES = [
  { Icon: BookCheck, text: "Every answer quotes your own material, checked word for word" },
  { Icon: LineChart, text: "Confidence for each topic, not just one score" },
  { Icon: Undo2, text: "Quizzes step back to the basics when you miss a question" },
];

/** The split-screen frame (brand panel on the left, the form on the right) used by sign-in, sign-up and password reset. */
export function AuthShell({ scene = "login", direction = 1, children }) {
  const s = SCENES[scene] ?? SCENES.login;
  return (
    <MotionConfig reducedMotion="user">
      <main id="main" className="au-page">
        <section className="au-brand" aria-label="About Nexus">
          <div className="au-brand-content">
            <div className="au-logo">
              <span className="au-logo-mark" aria-hidden="true">N</span>
              <span>NEXUS</span>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={scene} className="au-message" initial={{ opacity: 0, x: direction * 45 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: direction * -45 }} transition={{ duration: 0.4 }}>
                <div className="au-eyebrow"><GraduationCap size={17} aria-hidden="true" /> INTELLIGENT LEARNING</div>
                <h2>{s.title}</h2>
                <p>{s.text}</p>
                <ul className="au-features">
                  {FEATURES.map(({ Icon, text }) => (
                    <li key={text} className="au-feature"><Icon size={17} aria-hidden="true" /><span>{text}</span></li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>

            <div className="au-footer"><span className="au-dot" aria-hidden="true" /> Private to your account</div>
          </div>
          <div className="au-circle au-circle-1" aria-hidden="true" />
          <div className="au-circle au-circle-2" aria-hidden="true" />
          <div className="au-grid" aria-hidden="true" />
        </section>

        <section className="au-form-panel">
          <div className="au-form-container">{children}</div>
        </section>
      </main>
    </MotionConfig>
  );
}

export function AuthHeader({ title, subtitle }) {
  return (
    <header className="au-header">
      <div className="au-mobile-brand" aria-hidden="true">NEXUS</div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  );
}

export function SecureNote() {
  return (
    <p className="au-secure">
      <ShieldCheck size={16} aria-hidden="true" />
      <span>Passwords are stored hashed, sessions use secure cookies, and repeated wrong attempts are locked out for a while.</span>
    </p>
  );
}
