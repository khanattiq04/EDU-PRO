// A quiz is open from `scheduled_at` until `closes_at` ("Available until").
// When no closes_at is set it behaves like a live event: open only for
// `duration_minutes` after the start time.
// Each student gets `duration_minutes` from the moment THEY start, but never
// past the quiz's closing time.
const ms = value => new Date(value).getTime();

export function quizWindow(quiz) {
  const opensAt = ms(quiz.scheduled_at);
  const durationMs = Number(quiz.duration_minutes || 0) * 60000;
  const closesAt = quiz.closes_at ? ms(quiz.closes_at) : opensAt + durationMs;
  return { opensAt, closesAt, durationMs };
}

export function quizState(quiz, at = Date.now()) {
  const { opensAt, closesAt } = quizWindow(quiz);
  return at < opensAt ? 'upcoming' : at < closesAt ? 'open' : 'closed';
}

export function attemptDeadline(quiz, attempt) {
  const { closesAt, durationMs } = quizWindow(quiz);
  const own = attempt?.started_at ? ms(attempt.started_at) + durationMs : Infinity;
  return Math.min(own, closesAt);
}

export const withWindow = quiz => {
  const { opensAt, closesAt } = quizWindow(quiz);
  return { ...quiz, opens_at: new Date(opensAt).toISOString(), window_closes_at: new Date(closesAt).toISOString() };
};
