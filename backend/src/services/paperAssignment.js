export function assignQuizPaper(levelProfile = {}) {
  const { level, stream, field, programName, semesterRange } = levelProfile;
  if (level === '9th' || level === '10th') return `${level}-${stream || 'General Science'}`;
  if (level === '11th' || level === '12th') return `${level}-${stream || 'General'}`;
  if (level === 'Diploma (DAE)') return `Diploma-${field || 'General'}`;
  if (level === 'BS' || level === 'BA / BSc' || level === 'MA / MSc') return `${level}-${programName || 'General'}-${semesterRange || 'General'}`;
  if (level === 'Medical' || level === 'Engineering') return `${level}-${field || 'General'}`;
  if (level === 'M.Phil' || level === 'PhD') return `${level}-General`;
  return 'General';
}
