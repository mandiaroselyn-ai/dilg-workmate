// The office hours, in minutes after midnight (Manila time): the government's normal working
// hours, 8:00 AM to 12:00 NN and 1:00 PM to 5:00 PM, eight hours a day without the lunch break
// (CSC MC No. 21, s. 1991). The server reads a Time In after `amStart` as late, and the app and
// the DTR count tardiness and undertime against all four, so they always agree. An office with
// other hours approved by its head (flexitime, CSC MC No. 25, s. 2019) changes them here.
export const OFFICE_HOURS = {
  amStart: 8 * 60,
  noon: 12 * 60,
  pmStart: 13 * 60,
  pmEnd: 17 * 60
};
