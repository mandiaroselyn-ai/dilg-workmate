// Downloads rows as a CSV file. The byte order mark makes Excel read the file as UTF-8,
// so names with ñ stay intact.
export const downloadCsv = (filename, headers, rows) => {
  const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = `﻿${[headers, ...rows].map(row => row.map(escape).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
