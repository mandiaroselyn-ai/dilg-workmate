// The office hours, in minutes after midnight (Manila time): 7:00 AM to 12:00 NN and 1:00 PM
// to 4:30 PM. The server reads a Time In after `amStart` as late, and the app and the DTR
// count tardiness and undertime against all four, so they always agree.
export const OFFICE_HOURS = {
  amStart: 7 * 60,
  noon: 12 * 60,
  pmStart: 13 * 60,
  pmEnd: 16 * 60 + 30
};
