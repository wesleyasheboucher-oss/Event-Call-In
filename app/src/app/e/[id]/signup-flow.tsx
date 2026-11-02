"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Loader2, PartyPopper, X } from "lucide-react";
import { signUpForEvent, type SignupPerson } from "@/app/actions/public-signup";
import { CLOSED_MESSAGE, type SignupState } from "@/lib/public-event";
import { isValidEmail, normalizePhone } from "@/lib/phone";
import { Portal } from "@/components/drawer";
import { cx } from "@/components/ui";

const EMPTY: SignupPerson = { first_name: "", last_name: "", phone: "", email: "" };

/** who: -1 is the person signing up, 0+ their guests. */
type Step = { kind: "field"; who: number; key: keyof SignupPerson } | { kind: "ask"; index: number };

const FIELDS: (keyof SignupPerson)[] = ["first_name", "last_name", "phone", "email"];
const INPUT: Record<keyof SignupPerson, { inputMode: "text" | "tel" | "email"; type: string; autoComplete: string }> = {
  first_name: { inputMode: "text", type: "text", autoComplete: "given-name" },
  last_name: { inputMode: "text", type: "text", autoComplete: "family-name" },
  phone: { inputMode: "tel", type: "tel", autoComplete: "tel" },
  email: { inputMode: "email", type: "email", autoComplete: "email" },
};

/**
 * The "I'm going" button and the one-question-at-a-time sign-up behind it: first name,
 * last name, phone, email, then (if the event allows plus-ones) who they're bringing.
 * Enter moves to the next question. A guest's phone and email can be skipped.
 */
export function SignupFlow({
  eventId,
  eventName,
  state,
  maxGuests,
  onlineUrl,
}: {
  eventId: number;
  eventName: string;
  state: SignupState;
  /** 0 when plus-ones aren't allowed. */
  maxGuests: number;
  onlineUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [me, setMe] = useState<SignupPerson>(EMPTY);
  const [guests, setGuests] = useState<SignupPerson[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const trap = useRef<HTMLInputElement>(null);

  const steps = useMemo(() => {
    const s: Step[] = FIELDS.map((key) => ({ kind: "field", who: -1, key }));
    if (maxGuests > 0) {
      s.push({ kind: "ask", index: 0 });
      guests.forEach((_, i) => {
        s.push(...FIELDS.map((key) => ({ kind: "field" as const, who: i, key })));
        if (i + 1 < maxGuests) s.push({ kind: "ask", index: i + 1 });
      });
    }
    return s;
  }, [guests, maxGuests]);
  const current = steps[Math.min(step, steps.length - 1)];

  const person = (who: number) => (who < 0 ? me : guests[who]);
  const setField = (who: number, key: keyof SignupPerson, value: string) => {
    setError("");
    if (who < 0) setMe((p) => ({ ...p, [key]: value }));
    else setGuests((g) => g.map((p, i) => (i === who ? { ...p, [key]: value } : p)));
  };

  const go = (to: number) => {
    setDir(to > step ? 1 : -1);
    setError("");
    setStep(to);
  };

  const submit = (finalGuests: SignupPerson[]) => {
    setGuests(finalGuests);
    startTransition(async () => {
      const res = await signUpForEvent(eventId, { person: me, guests: finalGuests, website: trap.current?.value });
      if (res.ok) setDone(true);
      else setError(res.error);
    });
  };

  const next = () => {
    if (current.kind !== "field") return;
    const p = person(current.who);
    const value = p[current.key].trim();
    const optional = current.who >= 0 && (current.key === "phone" || current.key === "email");
    if (!value && !optional) return setError("This one's needed.");
    if (value && current.key === "phone" && normalizePhone(value).length < 10) return setError("That doesn't look like a full phone number.");
    if (value && current.key === "email" && !isValidEmail(value)) return setError("That doesn't look like an email address.");
    if (step === steps.length - 1) submit(guests);
    else go(step + 1);
  };

  const answer = (index: number, yes: boolean) => {
    if (!yes) return submit(guests.slice(0, index));
    setGuests((g) => [...g.slice(0, index), g[index] ?? EMPTY]);
    setDir(1);
    setError("");
    setStep(step + 1);
  };

  const close = () => {
    if (pending) return;
    setOpen(false);
    if (done) {
      // Leave the page ready for the next person on the same phone.
      setStep(0);
      setMe(EMPTY);
      setGuests([]);
    }
  };

  const start = () => {
    setDone(false);
    setStep(0);
    setDir(1);
    setError("");
    setOpen(true);
  };

  if (state !== "open") {
    return (
      <div className="rounded-2xl bg-surface-2 px-5 py-4 text-center text-sm font-medium text-ink-2 ring-1 ring-border sm:text-left">
        {CLOSED_MESSAGE[state]}
      </div>
    );
  }

  const button = (
    <button
      type="button"
      onClick={start}
      className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-8 text-[17px] font-semibold text-white shadow-lg shadow-violet-600/25 transition-[background-color,transform] hover:bg-violet-700 active:scale-[0.98] sm:w-auto"
    >
      {done ? (
        <>
          <Check className="size-5" strokeWidth={3} /> You&apos;re going · Sign up someone else
        </>
      ) : (
        <>I&apos;m going</>
      )}
    </button>
  );

  return (
    <>
      <div className="hidden sm:block">{button}</div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        {button}
      </div>

      <Portal>
        <AnimatePresence>
          {open && (
            <Overlay onClose={close}>
              {/* Spam trap: hidden from people, often filled in by bots */}
              <input ref={trap} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />

              <div className="flex items-center justify-between px-4 pt-4 sm:px-6">
                <button
                  type="button"
                  onClick={() => go(step - 1)}
                  disabled={step === 0 || done || pending}
                  aria-label="Back"
                  className="flex size-10 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 disabled:invisible"
                >
                  <ArrowLeft className="size-5" />
                </button>
                {!done && <Progress value={step} total={steps.length} />}
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="flex size-10 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="relative flex-1 overflow-hidden px-6 pt-8 pb-8 sm:px-10 sm:pt-6">
                {done ? (
                  <Done name={me.first_name} eventName={eventName} guests={guests} onlineUrl={onlineUrl} onClose={close} />
                ) : (
                  <AnimatePresence mode="popLayout" initial={false} custom={dir}>
                    <motion.div
                      key={step}
                      custom={dir}
                      variants={{
                        enter: (d: number) => ({ opacity: 0, x: d * 40 }),
                        center: { opacity: 1, x: 0 },
                        exit: (d: number) => ({ opacity: 0, x: d * -40 }),
                      }}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                    >
                      {current.kind === "field" ? (
                        <FieldStep
                          step={current}
                          me={me}
                          guests={guests}
                          value={person(current.who)[current.key]}
                          onChange={(v) => setField(current.who, current.key, v)}
                          onNext={next}
                          onDropGuest={() => submit(guests.slice(0, current.who))}
                          last={step === steps.length - 1}
                          pending={pending}
                          error={error}
                        />
                      ) : (
                        <AskStep
                          first={current.index === 0}
                          maxGuests={maxGuests}
                          onAnswer={(yes) => answer(current.index, yes)}
                          pending={pending}
                          error={error}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            </Overlay>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}

/** Full screen on phones (room for the keyboard), a centered card on larger screens. */
function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef(onClose);
  useEffect(() => {
    ref.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && ref.current();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <motion.div
        className="absolute inset-0 hidden bg-stone-900/30 backdrop-blur-[2px] sm:block"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="relative flex h-dvh w-full flex-col bg-surface sm:h-auto sm:min-h-[420px] sm:max-w-lg sm:rounded-3xl sm:shadow-[var(--shadow-drawer)] sm:ring-1 sm:ring-border"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ type: "spring", stiffness: 420, damping: 40 }}
      >
        {children}
      </motion.div>
    </div>
  );
}

function Progress({ value, total }: { value: number; total: number }) {
  return (
    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-2 ring-1 ring-border ring-inset">
      <motion.div
        className="h-full rounded-full bg-violet-600"
        animate={{ width: `${Math.max(8, ((value + 1) / (total + 1)) * 100)}%` }}
        transition={{ duration: 0.3 }}
      />
    </div>
  );
}

function FieldStep({
  step,
  me,
  guests,
  value,
  onChange,
  onNext,
  onDropGuest,
  last,
  pending,
  error,
}: {
  step: Extract<Step, { kind: "field" }>;
  me: SignupPerson;
  guests: SignupPerson[];
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onDropGuest: () => void;
  last: boolean;
  pending: boolean;
  error: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  // Focus in a layout effect so the phone keyboard opens (and stays open between questions).
  useLayoutEffect(() => input.current?.focus(), []);

  const guest = step.who >= 0;
  const g = guest ? guests[step.who] : null;
  const gName = g?.first_name.trim() || "Your guest";
  const optional = guest && (step.key === "phone" || step.key === "email");

  const copy: Record<keyof SignupPerson, { title: string; label: string; placeholder: string }> = guest
    ? {
        first_name: { title: step.who === 0 ? "Who are you bringing?" : "Who else is coming?", label: "Their first name", placeholder: "First name" },
        last_name: { title: `And ${gName}'s last name?`, label: "Their last name", placeholder: "Last name" },
        phone: { title: `${gName}'s phone number`, label: "Phone (optional)", placeholder: "(555) 123-4567" },
        email: { title: `${gName}'s email`, label: "Email (optional)", placeholder: "name@example.com" },
      }
    : {
        first_name: { title: "We are excited to see you! What is your name?", label: "First name", placeholder: "First name" },
        last_name: { title: `Nice to meet you, ${me.first_name.trim()}.`, label: "And your last name?", placeholder: "Last name" },
        phone: { title: "What's your phone number?", label: "Phone", placeholder: "(555) 123-4567" },
        email: { title: "And your email?", label: "Email", placeholder: "you@example.com" },
      };
  const c = copy[step.key];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
    >
      <h2 className="text-[28px] leading-tight font-semibold tracking-tight text-balance">{c.title}</h2>
      <label className="mt-6 block">
        <span className="mb-2 block text-sm font-medium text-ink-2">{c.label}</span>
        <input
          ref={input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={c.placeholder}
          enterKeyHint={last ? "done" : "next"}
          maxLength={step.key === "email" ? 120 : step.key === "phone" ? 30 : 80}
          autoCapitalize={step.key === "first_name" || step.key === "last_name" ? "words" : "off"}
          autoCorrect="off"
          spellCheck={false}
          {...INPUT[step.key]}
          autoComplete={guest ? "off" : INPUT[step.key].autoComplete}
          className={cx(
            "h-14 w-full rounded-2xl bg-surface px-4 text-lg text-ink ring-1 ring-border transition-shadow ring-inset placeholder:text-ink-3 focus:ring-2 focus:ring-violet-600 focus:outline-none",
            error && "ring-rose-400",
          )}
        />
      </label>
      <div className="mt-2 min-h-5 text-sm text-rose-600" aria-live="polite">
        {error}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {guest && step.key === "first_name" ? (
          <button type="button" onClick={onDropGuest} disabled={pending} className="text-sm font-medium text-ink-2 hover:text-ink">
            {step.who === 0 ? "Never mind, just me" : "Never mind"}
          </button>
        ) : optional && !value.trim() ? (
          <span className="text-sm text-ink-3">You can skip this</span>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-violet-600 px-6 text-[15px] font-semibold text-white transition-[background-color,transform] hover:bg-violet-700 active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {last ? "Sign me up" : optional && !value.trim() ? "Skip" : "Next"}
          {!pending && !last && <ArrowRight className="size-4" />}
        </button>
      </div>
    </form>
  );
}

function AskStep({
  first,
  maxGuests,
  onAnswer,
  pending,
  error,
}: {
  first: boolean;
  maxGuests: number;
  onAnswer: (yes: boolean) => void;
  pending: boolean;
  error: string;
}) {
  const yes = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => yes.current?.focus(), []);
  return (
    <div>
      <h2 className="text-[28px] leading-tight font-semibold tracking-tight text-balance">
        {first ? "Are you bringing anyone with you?" : "Bringing anyone else?"}
      </h2>
      {first && maxGuests > 1 && <p className="mt-2 text-ink-2">You can bring up to {maxGuests}.</p>}
      <div className="mt-8 grid grid-cols-2 gap-3">
        <button
          ref={yes}
          type="button"
          disabled={pending}
          onClick={() => onAnswer(true)}
          className="h-14 rounded-2xl bg-violet-600 text-[17px] font-semibold text-white transition-[background-color,transform] hover:bg-violet-700 active:scale-[0.98] disabled:opacity-60"
        >
          Yes
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onAnswer(false)}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-surface text-[17px] font-semibold text-ink ring-1 ring-border transition-[background-color,transform] ring-inset hover:bg-surface-2 active:scale-[0.98] disabled:opacity-60"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          No{first ? ", just me" : ""}
        </button>
      </div>
      <div className="mt-3 min-h-5 text-sm text-rose-600" aria-live="polite">
        {error}
      </div>
    </div>
  );
}

function Done({
  name,
  eventName,
  guests,
  onlineUrl,
  onClose,
}: {
  name: string;
  eventName: string;
  guests: SignupPerson[];
  onlineUrl: string;
  onClose: () => void;
}) {
  const named = guests.filter((g) => g.first_name.trim());
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center pt-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-violet-100 text-violet-700">
        <PartyPopper className="size-8" />
      </div>
      <h2 className="mt-5 text-[28px] leading-tight font-semibold tracking-tight">You&apos;re going, {name.trim()}!</h2>
      <p className="mt-2 text-ink-2">
        Your spot at <span className="font-medium text-ink">{eventName}</span> is saved
        {named.length > 0 && <> for you and {named.map((g) => g.first_name.trim()).join(" and ")}</>}.
      </p>
      {onlineUrl && (
        <a
          href={onlineUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 text-sm font-medium break-all text-violet-700 hover:underline"
        >
          Join online: {onlineUrl}
        </a>
      )}
      <button
        type="button"
        onClick={onClose}
        className="mt-8 h-12 rounded-xl bg-violet-600 px-8 text-[15px] font-semibold text-white transition-colors hover:bg-violet-700"
      >
        Done
      </button>
    </motion.div>
  );
}
