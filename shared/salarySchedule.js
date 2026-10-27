// The monthly salary schedule for the civilian personnel of the national government (DILG
// included): DBM National Budget Circular No. 601 (January 22, 2026), Annex A, "The Third
// Tranche Monthly Salary Schedule for the Civilian Personnel of the National Government,
// Effective January 1, 2026", under Executive Order No. 64, s. 2024. Pesos per month, by
// salary grade (1–33) and step (1–8; grade 33 has steps 1 and 2 only). Replace it with the
// fourth tranche when that takes effect on January 1, 2027.
export const SALARY_SCHEDULE_SOURCE = 'DBM NBC No. 601, Annex A (EO No. 64, s. 2024, third tranche), effective January 1, 2026';

const SCHEDULE = {
  1: [14634, 14730, 14849, 14968, 15089, 15211, 15333, 15456],
  2: [15522, 15636, 15752, 15869, 15986, 16103, 16223, 16342],
  3: [16486, 16610, 16732, 16856, 16982, 17106, 17234, 17360],
  4: [17506, 17636, 17767, 17898, 18031, 18163, 18298, 18433],
  5: [18581, 18720, 18858, 18998, 19137, 19280, 19423, 19565],
  6: [19716, 19862, 20009, 20158, 20307, 20456, 20609, 20761],
  7: [20914, 21069, 21224, 21382, 21539, 21699, 21859, 22022],
  8: [22423, 22627, 22832, 23038, 23246, 23456, 23668, 23883],
  9: [24329, 24523, 24720, 24917, 25117, 25318, 25521, 25725],
  10: [26917, 27131, 27347, 27565, 27786, 28007, 28230, 28456],
  11: [31705, 31820, 32109, 32401, 32697, 32998, 33302, 33611],
  12: [33947, 34069, 34357, 34648, 34943, 35242, 35544, 35850],
  13: [36125, 36283, 36599, 36919, 37244, 37572, 37904, 38241],
  14: [38764, 39141, 39523, 39910, 40300, 40696, 41097, 41503],
  15: [42178, 42594, 43015, 43442, 43874, 44310, 44753, 45202],
  16: [45694, 46152, 46615, 47084, 47559, 48040, 48528, 49020],
  17: [49562, 50066, 50576, 51092, 51614, 52144, 52678, 53221],
  18: [53818, 54371, 54933, 55499, 56075, 56657, 57246, 57842],
  19: [59153, 59966, 60793, 61632, 62486, 63353, 64236, 65132],
  20: [66052, 66970, 67904, 68853, 69818, 70772, 71727, 72671],
  21: [73303, 74337, 75388, 76456, 77542, 78645, 79692, 80831],
  22: [81796, 82963, 84151, 85356, 86582, 87746, 89011, 90295],
  23: [91306, 92622, 93962, 95330, 96823, 98341, 99883, 101318],
  24: [102603, 104209, 105841, 107500, 109185, 110898, 112533, 114301],
  25: [116643, 118469, 120326, 122212, 124131, 126079, 128061, 130073],
  26: [131807, 133870, 135968, 138100, 140268, 142469, 144707, 146983],
  27: [148940, 151273, 153644, 155906, 158353, 160235, 162752, 165310],
  28: [167129, 169752, 172418, 174797, 177545, 180339, 182660, 185537],
  29: [187531, 190482, 193480, 196528, 199624, 202005, 205191, 208430],
  30: [210718, 214038, 217207, 220425, 223691, 227224, 230595, 234240],
  31: [300961, 306691, 312532, 318182, 323938, 329989, 336092, 342310],
  32: [356237, 363257, 370418, 377359, 384805, 392400, 400150, 408055],
  33: [449157, 462329]
};

export const SALARY_GRADE_OPTIONS = Object.keys(SCHEDULE).map(grade => `SG ${grade}`);
export const SALARY_STEP_OPTIONS = Array.from({ length: 8 }, (_, index) => `Step ${index + 1}`);

// The monthly salary of a salary grade and step (numbers), or null when there is none.
export const monthlySalary = (grade, step) => SCHEDULE[grade]?.[step - 1] ?? null;

// Pesos as written on the forms: "PHP 42,178" (or "PHP 1,917.18" with centavos).
export const pesoText = amount => `PHP ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// The daily rate for leave without pay and other salary deductions: the monthly salary over
// 22 working days.
export const dailyRate = monthly => Math.round((Number(monthly) / 22) * 100) / 100;

// What `days` without pay take from a person's pay, by their salary grade and step (as saved on
// their account), or null when no salary grade is set.
export const withoutPayAmount = (person, days) => {
  const { salaryGrade, salaryStep } = salaryFields(person?.salaryGrade, person?.salaryStep);
  if (!salaryGrade || !(Number(days) > 0)) return null;
  const monthly = monthlySalary(Number(salaryGrade.slice(3)), Number(salaryStep.slice(5)));
  return Math.round(dailyRate(monthly) * Number(days) * 100) / 100;
};

// The salary fields to save for a salary grade and step chosen by HR, such as "SG 15" and
// "Step 1": { salaryGrade, salaryStep, salary } with the monthly salary from the schedule, all
// empty when no grade is chosen, or { error }. A grade saved before the choices existed, such as
// "SG 15, Step 3", is read too, and a missing step is Step 1.
export const salaryFields = (gradeText = '', stepText = '') => {
  const gradeMatch = /(\d+)/.exec(String(gradeText || ''));
  if (!gradeMatch) return { salaryGrade: '', salaryStep: '', salary: '' };
  const grade = Number(gradeMatch[1]);
  const stepMatch = /(\d+)/.exec(String(stepText || '')) || /step\s*(\d+)/i.exec(String(gradeText));
  const step = stepMatch ? Number(stepMatch[1]) : 1;
  if (!SCHEDULE[grade]) return { error: 'Choose a salary grade from SG 1 to SG 33.' };
  const amount = monthlySalary(grade, step);
  if (amount === null) return { error: `SG ${grade} has steps 1 to ${SCHEDULE[grade].length} only.` };
  return { salaryGrade: `SG ${grade}`, salaryStep: `Step ${step}`, salary: pesoText(amount) };
};
