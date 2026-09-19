const genderBatchCodes = { Male: 'MB', Female: 'FG', Transgender: 'TK' };

export function cityCode(city = '') {
  const normalized = city.trim().toLowerCase();
  const knownCodes = {
    sargodha: 'SGD', lahore: 'LHE', islamabad: 'ISB', rawalpindi: 'RWP',
    karachi: 'KHI', faisalabad: 'FSD', multan: 'MUX', peshawar: 'PEW',
    quetta: 'UET', gujranwala: 'GRW', sialkot: 'SKT'
  };
  if (knownCodes[normalized]) return knownCodes[normalized];
  const letters = normalized.toUpperCase().replace(/[^A-Z]/g, '');
  return (letters + 'XXX').slice(0, 3);
}

export function generateRegistrationNumber({ gender, city, serial, year = new Date().getFullYear() }) {
  const batchCode = genderBatchCodes[gender] || 'GN';
  const yearCode = String(year).slice(-2);
  const sequence = String(serial).padStart(6, '0');
  return `DN-${batchCode}${yearCode}${cityCode(city)}-${sequence}`;
}

export function buildLevelProfile({ level, stream, field, programName, year, semesterRange, status, nursingType, programDuration, programType }) {
  return { level: level || null, stream: stream || null, field: field || null, programName: programName || null, year: year || null, semesterRange: semesterRange || null, status: status || null, nursingType: nursingType || null, programDuration: programDuration || null, programType: programType || null };
}
