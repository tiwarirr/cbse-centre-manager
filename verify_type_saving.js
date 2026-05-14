const state = { answerBook: { types: null, receipts: "im_not_an_array" } };

function defaultAnswerBookState() {
  return {
    types: [],
    subjectTypeMap: {},
    suppClassTypeMap: { X: '', XII: '' },
    receipts: [],
    receiptExceptions: [],
    dateLedger: {},
    serialRegistry: {},
    auditLog: [],
    nextTypeId: 1,
    nextReceiptId: 1,
    nextExceptionId: 1,
    nextAuditId: 1,
  };
}

function ensureAnswerBookState() {
  if (!state.answerBook || typeof state.answerBook !== 'object') {
    state.answerBook = defaultAnswerBookState();
    return state.answerBook;
  }
  const d = defaultAnswerBookState();
  Object.keys(d).forEach(k => {
    if (state.answerBook[k] === undefined || state.answerBook[k] === null) {
      state.answerBook[k] = d[k];
    } else if (Array.isArray(d[k]) && !Array.isArray(state.answerBook[k])) {
      state.answerBook[k] = d[k];
    } else if (typeof d[k] === 'object' && !Array.isArray(d[k]) && typeof state.answerBook[k] !== 'object') {
      state.answerBook[k] = d[k];
    }
  });
  return state.answerBook;
}

const before = JSON.stringify(state.answerBook);
const fixed = ensureAnswerBookState();
console.log('Before:', before);
console.log('After:', JSON.stringify(fixed));
if (Array.isArray(fixed.types) && Array.isArray(fixed.receipts)) {
   console.log('SUCCESS: Arrays are properly forced.');
} else {
   console.log('FAILURE: Arrays not forced.');
}
