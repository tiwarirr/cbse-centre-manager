const fs = require('fs');
const path = require('path');

const FILE_PATH = 'g:\\Users\\Suditi Exam\\Desktop\\RRT\\Seating Plan\\cbse-centre-manager-main\\CBSE_Centre_Manager.html';
const code = fs.readFileSync(FILE_PATH, 'utf-8');

const jsMatch = code.match(/<script>([\s\S]*?)<\/script>/);
let scriptContent = jsMatch[1];

// Remove init timeout that references DOM event listeners
scriptContent = scriptContent.replace('setTimeout(() => {', 'function initUI() {');

// Mock Browser Environment
global.window = {
  _savedPayload: null,
  addEventListener: () => {}
};

global.localStorage = {
  _data: {},
  setItem: function(id, val) { this._data[id] = String(val); },
  getItem: function(id) { return this._data.hasOwnProperty(id) ? this._data[id] : null; },
  removeItem: function(id) { delete this._data[id]; },
  get length() { return Object.keys(this._data).length; },
  key: function(i) { return Object.keys(this._data)[i] || null; }
};

const domStore = {
  'cfg-centre-code': { value: 'TEST_CODE' },
  'cfg-centre-name': { value: 'Test Centre' },
  'save-indicator': { style: {} },
  'save-time': { style: {}, textContent: '' },
  'cfg-per-room': { value: '24' },
  'cfg-rows': { value: '4' },
  'cfg-cols': { value: '6' },
  'cfg-class-order': { value: 'roll' },
  'cfg-split': { value: 'none' },
  'cfg-separate-plan': { checked: false },
  'cfg-show-vacant': { checked: true },
  'cfg-private': { checked: true },
  'cfg-seat-dir': { value: 'colwise' },
};

global.document = {
  getElementById: function(id) {
    if (domStore[id]) return domStore[id];
    // Generic mock for other event listeners
    return { 
      value: '', 
      style: {}, 
      addEventListener: () => {},
      classList: { add: () => {}, remove: () => {} }
    };
  },
  querySelectorAll: function() { return []; },
  createElement: function() { return { style: {} }; },
  head: { appendChild: () => {} },
  body: { appendChild: () => {} }
};

global.customSubjectOrder = {};
global.refreshSessionSelector = function() {};
global.showModal = function() {};

eval(scriptContent);

try {
   console.log('--- STARTING NODE PERSISTENCE TEST ---');
   const key = 'cbse_centre_TEST_CODE';
   
   ensureAnswerBookState();
   const ab = state.answerBook;
   
   ab.receipts.push({
     id: 1, date: '2024-03-01', typeId: 1, 
     startSerial: 'AB10001', endSerial: 'AB99999',
     challanNo: 'CH123', challanQty: 90000, createdAt: Date.now()
   });
   
   console.log('Building massive serialRegistry in memory...');
   rebuildAnswerBookRegistry();
   const memKeys = Object.keys(ab.serialRegistry).length;
   console.log('Generated Registry Keys in Memory:', memKeys);
   
   if (memKeys !== 90000) {
      console.error('Failed to generate mock memory registry. Found:', memKeys);
      process.exit(1);
   }
   
   console.log('Calling saveToBrowser...');
   saveToBrowser();
   
   const raw = localStorage.getItem(key);
   const payload = JSON.parse(raw);
   const savedRegKeys = Object.keys(payload.answerBook.serialRegistry || {}).length;
   
   console.log('Saved Payload Registry Keys:', savedRegKeys);
   console.log('Saved Payload Total Size (Chars):', raw.length);
   
   if (savedRegKeys === 0 && raw.length < 500000) {
     console.log('TEST PASSED: serialRegistry was correctly omitted from saved payload.');
     process.exit(0);
   } else {
     console.log('TEST FAILED: Payload is bloated or missing exclusion logic.');
     process.exit(1);
   }
} catch(e) {
   console.error('TEST FAILED W/ EXCEPTION:', e);
   process.exit(1);
}
