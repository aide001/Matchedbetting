const test = require('node:test');
const assert = require('node:assert/strict');
const { toCSV, parseCSV } = require('../public/js/csv.js');

test('round-trips quotes, commas, newlines and formulas', () => {
  const rows = [
    { a: 'plain', b: '-4.50' },
    { a: 'has, comma', b: 'say "hi"' },
    { a: 'multi\nline', b: '=SUM(A1)' }
  ];
  const csv = toCSV(rows, ['a', 'b']);
  assert.match(csv, /'=SUM/);
  assert.deepEqual(parseCSV(csv), rows);
});

test('negative numbers are not escaped', () => {
  assert.equal(toCSV([{ p: -3.2 }], ['p']), 'p\r\n-3.2');
});

test('handles BOM, CRLF and blank lines', () => {
  assert.deepEqual(parseCSV('﻿x,y\r\n1,2\r\n\r\n'), [{ x: '1', y: '2' }]);
});
