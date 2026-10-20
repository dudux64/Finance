import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const appSource = readFileSync(new URL('../script.js', import.meta.url), 'utf8');

function createApp(storage = new Map()) {
  const context = vm.createContext({
    console: { error() {}, warn() {}, log() {} },
    document: { addEventListener() {}, getElementById() { return null; } },
    localStorage: { getItem(key) { return storage.has(key) ? storage.get(key) : null; }, setItem(key, value) { storage.set(key, String(value)); } },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    setTimeout,
    clearTimeout,
    Date,
    Intl,
    Math,
    JSON,
    Number,
    String,
    Array,
    Map,
    Set
  });
  vm.runInContext(appSource, context, { filename: 'script.js' });
  const run = expression => vm.runInContext(expression, context);
  run.storage = storage;
  return run;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('parses Brazilian currency and rejects malformed calendar dates', () => {
  const run = createApp();
  assert.equal(run("parseBRL('R$ 1.234,56')"), 1234.56);
  assert.equal(run("isValidISODate('2024-02-29')"), true);
  assert.equal(run("isValidISODate('2025-02-29')"), false);
});

test('adds months while keeping the original end-of-month anchor', () => {
  const run = createApp();
  assert.equal(run("addMonthsISO('2026-01-31', 1)"), '2026-02-28');
  assert.equal(run("addMonthsISO('2026-01-31', 2)"), '2026-03-31');
  assert.equal(run("addMonthsISO('2026-12-31', 2)"), '2027-02-28');
});

test('month helpers handle year boundaries', () => {
  const run = createApp();
  assert.equal(run("monthKey('2027-01-14')"), '2027-01');
  assert.equal(run("monthOffset(new Date(2026, 11, 1), new Date(2027, 0, 1))"), 1);
});

test('debt occurrence and paid count follow the selected month', () => {
  const run = createApp();
  const debt = JSON.stringify({ firstDueDate: '2026-08-31', dueDate: '2026-09-30', totalParcels: 4, paidParcels: 1 });
  assert.deepEqual(plain(run(`debtOccurrence(${debt}, new Date(2026, 8, 1))`)), {
    number: 2, total: 4, date: '2026-09-30', paid: false
  });
  assert.deepEqual(plain(run(`debtOccurrence(${debt}, new Date(2026, 9, 1))`)), {
    number: 3, total: 4, date: '2026-10-31', paid: false
  });
  assert.equal(run(`debtDueInMonth(${debt}, new Date(2026, 9, 1))`), true);
  assert.equal(run(`debtOccurrence(${debt}, new Date(2026, 11, 1))`), null);
});

test('debt paid count is capped by installments due and total installments', () => {
  const run = createApp();
  const debt = JSON.stringify({ firstDueDate: '2026-08-10', dueDate: '2026-10-10', totalParcels: 3, paidParcels: 8 });
  assert.equal(run(`debtPaidAsOf(${debt}, new Date(2026, 6, 1))`), 0);
  assert.equal(run(`debtPaidAsOf(${debt}, new Date(2026, 8, 1))`), 2);
  assert.equal(run(`debtPaidAsOf(${debt}, new Date(2027, 0, 1))`), 3);
  assert.equal(run(`debtOccurrence(${debt}, new Date(2026, 9, 1)).paid`), true);
});

test('recurring subscription dates respect interval and paused status', () => {
  const run = createApp();
  assert.equal(run("subscriptionDueInMonth({period:'mensal',status:'ativa',nextDate:'2026-08-15'},new Date(2026,9,1))"), true);
  assert.equal(run("subscriptionDueInMonth({period:'trimestral',status:'ativa',nextDate:'2026-08-15'},new Date(2026,10,1))"), true);
  assert.equal(run("subscriptionDueInMonth({period:'trimestral',status:'ativa',nextDate:'2026-08-15'},new Date(2026,9,1))"), false);
  assert.equal(run("subscriptionDueInMonth({period:'mensal',status:'pausada',nextDate:'2026-10-15'},new Date(2026,9,1))"), false);
});

test('monthly dashboard totals include paid and pending income and expenses without duplicating paid totals', () => {
  const run = createApp();
  run(`dashboardMonth = new Date(2026, 9, 1);
    state = {
      transactions: [
        {type:'receita',status:'pago',date:'2026-10-03',value:2400},
        {type:'despesa',status:'pago',date:'2026-10-05',value:500},
        {type:'receita',status:'pendente',date:'2026-10-08',value:200},
        {type:'despesa',status:'pendente',date:'2026-10-09',value:250},
        {type:'despesa',status:'pago',date:'2026-09-20',value:1000}
      ],
      debts: [{total:1500,parcelValue:100,totalParcels:12,paidParcels:1,firstDueDate:'2026-08-31',dueDate:'2026-09-30'}],
      subscriptions: [
        {value:50,period:'mensal',status:'ativa',nextDate:'2026-08-15'},
        {value:400,period:'mensal',status:'pausada',nextDate:'2026-10-15'}
      ]
    };`);
  assert.deepEqual(plain(run('calculate()')), {
    balance: 1850,
    incomeMonth: 2600,
    expenseMonth: 750,
    debts: 400,
    pending: 600,
    projected: 1700
  });
});

test('open debts include only unpaid monthly transactions, installments, and active subscriptions', () => {
  const run = createApp();
  run(`dashboardMonth = new Date(2026, 9, 1);
    state = {
      transactions: [
        {type:'receita',status:'pendente',date:'2026-10-01',value:900},
        {type:'despesa',status:'pendente',date:'2026-10-02',value:120},
        {type:'despesa',status:'pago',date:'2026-10-03',value:75}
      ],
      debts: [
        {total:400,parcelValue:100,totalParcels:4,paidParcels:1,firstDueDate:'2026-09-10',dueDate:'2026-10-10'},
        {total:80,parcelValue:40,totalParcels:2,paidParcels:2,firstDueDate:'2026-09-10',dueDate:'2026-11-10'}
      ],
      subscriptions: [
        {value:35,period:'mensal',status:'ativa',nextDate:'2026-09-15'},
        {value:50,period:'mensal',status:'pausada',nextDate:'2026-09-15'}
      ]
    };`);
  const totals = plain(run('calculate()'));
  assert.equal(totals.debts, 255);
  assert.equal(totals.pending, 1155);
  assert.equal(totals.balance, 705);
});

test('monthly due list shows pending transactions and installments but omits subscriptions', () => {
  const run = createApp();
  run(`dashboardMonth = new Date(2026, 9, 1);
    state = {
      transactions: [{description:'Conta de luz',type:'despesa',status:'pendente',date:'2026-10-13',value:215}],
      debts: [{id:'debt-1',name:'Notebook',total:600,parcelValue:100,totalParcels:6,paidParcels:1,firstDueDate:'2026-09-20',dueDate:'2026-10-20'}],
      subscriptions: [{name:'Streaming',value:45,period:'mensal',status:'ativa',nextDate:'2026-09-14'}]
    };`);
  const rows = plain(run('pendingItemsForMonth()'));
  assert.deepEqual(rows.map(row => row.name).sort(), ['Conta de luz', 'Notebook']);
  assert.equal(plain(run('calculate()')).debts, 360);
});

test('calendar generates transaction, installment, and active subscription events for the selected range', () => {
  const run = createApp();
  run(`state = {
      transactions: [{date:'2026-10-05',description:'Aluguel',type:'despesa',status:'pendente',value:100}],
      debts: [{name:'Notebook',firstDueDate:'2026-08-31',totalParcels:4,paidParcels:1,parcelValue:80}],
      subscriptions: [
        {name:'Streaming',period:'mensal',status:'ativa',nextDate:'2026-08-15',value:20},
        {name:'Academia',period:'mensal',status:'pausada',nextDate:'2026-10-15',value:40}
      ]
    };`);
  const events = plain(run("calendarEvents(new Date(2026, 9, 1), new Date(2026, 9, 31))"));
  assert.deepEqual(events.map(event => [event.title, event.date, event.label]), [
    ['Aluguel', '2026-10-05', 'Pendente'],
    ['Notebook', '2026-10-31', 'Parcela 3/4 · Pendente'],
    ['Streaming', '2026-10-15', 'Cobrança de assinatura']
  ]);
});

const sortCases = [
  ['dateAsc', [{ date: '2026-10-03', name: 'B' }, { date: '2026-10-01', name: 'A' }], ['A', 'B']],
  ['dateDesc', [{ date: '2026-10-01', name: 'A' }, { date: '2026-10-03', name: 'B' }], ['B', 'A']],
  ['valueAsc', [{ value: 40, name: 'B' }, { value: 10, name: 'A' }], ['A', 'B']],
  ['valueDesc', [{ value: 10, name: 'A' }, { value: 40, name: 'B' }], ['B', 'A']],
  ['status', [{ status: 'pago', name: 'Pago' }, { status: 'pendente', name: 'Pendente' }], ['Pendente', 'Pago']],
  ['statusPaid', [{ status: 'pendente', name: 'Pendente' }, { status: 'pago', name: 'Pago' }], ['Pago', 'Pendente']],
  ['nameAsc', [{ name: 'Paloma' }, { name: 'Dudu' }], ['Dudu', 'Paloma']],
  ['remainingAsc', [{ remaining: 600, name: 'B' }, { remaining: 100, name: 'A' }], ['A', 'B']],
  ['remainingDesc', [{ remaining: 100, name: 'A' }, { remaining: 600, name: 'B' }], ['B', 'A']],
  ['paidAsc', [{ paidRatio: 0.75, name: 'B' }, { paidRatio: 0.25, name: 'A' }], ['A', 'B']],
  ['paidDesc', [{ paidRatio: 0.25, name: 'A' }, { paidRatio: 0.75, name: 'B' }], ['B', 'A']]
];

for (const [mode, items, expected] of sortCases) {
  test(`sorts rows using ${mode}`, () => {
    const run = createApp();
    run(`sortPreferences.transactions = ${JSON.stringify(mode)}`);
    const names = plain(run(`sortRows(${JSON.stringify(items)}, 'transactions').map(item => item.name)`));
    assert.deepEqual(names, expected);
  });
}

test('transaction table sorting supports date, value, category, status, and reverse order', () => {
  const run = createApp();
  const items = [
    {description:'Zebra',category:'Transporte',date:'2026-10-03',status:'pago',value:40},
    {description:'Aluguel',category:'Moradia',date:'2026-10-01',status:'pendente',value:100},
    {description:'Mercado',category:'Alimentação',date:'2026-10-02',status:'pago',value:10}
  ];
  run(`transactionTableSort={key:'value',direction:'asc'}`);
  assert.deepEqual(plain(run(`sortTransactionsForTable(${JSON.stringify(items)}).map(item=>item.description)`)), ['Mercado','Zebra','Aluguel']);
  run(`transactionTableSort={key:'date',direction:'desc'}`);
  assert.deepEqual(plain(run(`sortTransactionsForTable(${JSON.stringify(items)}).map(item=>item.description)`)), ['Zebra','Mercado','Aluguel']);
  run(`transactionTableSort={key:'category',direction:'asc'}`);
  assert.deepEqual(plain(run(`sortTransactionsForTable(${JSON.stringify(items)}).map(item=>item.description)`)), ['Mercado','Aluguel','Zebra']);
  run(`transactionTableSort={key:'status',direction:'asc'}`);
  assert.deepEqual(plain(run(`sortTransactionsForTable(${JSON.stringify(items)}).map(item=>item.description)`)), ['Aluguel','Mercado','Zebra']);
  run(`transactionTableSort={key:'description',direction:'desc'}`);
  assert.deepEqual(plain(run(`sortTransactionsForTable(${JSON.stringify(items)}).map(item=>item.description)`)), ['Zebra','Mercado','Aluguel']);
});

const emptyBackup = () => ({transactions:[],debts:[],subscriptions:[]});

test('backup accepts an empty profile and reports item counts in Portuguese', () => {
  const run = createApp();
  assert.deepEqual(plain(run(`normalizeBackup(${JSON.stringify(emptyBackup())})`)), emptyBackup());
  assert.equal(run(`backupCounts(${JSON.stringify(emptyBackup())})`), '0 lançamentos · 0 dívidas · 0 assinaturas');
  assert.equal(run(`backupCounts({transactions:[{}],debts:[{}],subscriptions:[{},{}]})`), '1 lançamento · 1 dívida · 2 assinaturas');
});

test('backup normalizes Brazilian values, trims text, and reconstructs old debt anchor dates', () => {
  const run = createApp();
  const backup = {
    transactions:[{type:'despesa',status:'pendente',description:'  Mercado  ',value:'R$ 1.234,56',category:'Alimentação',date:'2026-10-05',notes:' teste '}],
    debts:[{name:'Notebook',total:'2.400,00',parcelValue:'200,00',totalParcels:12,paidParcels:2,dueDate:'2026-10-31'}],
    subscriptions:[{name:'Streaming',value:'45,90',period:'mensal',nextDate:'2026-10-15'}]
  };
  const normalized = plain(run(`normalizeBackup(${JSON.stringify(backup)})`));
  assert.equal(normalized.transactions[0].description, 'Mercado');
  assert.equal(normalized.transactions[0].value, 1234.56);
  assert.equal(normalized.debts[0].firstDueDate, '2026-08-31');
  assert.equal(normalized.debts[0].dueDate, '2026-10-31');
  assert.equal(normalized.subscriptions[0].status, 'ativa');
  assert.ok(normalized.transactions[0].id);
});

test('backup rejects malformed structure, invalid items, zero values, invalid dates, and excessive item counts', () => {
  const run = createApp();
  const invalid = [
    null,
    {transactions:[],debts:[]},
    {transactions:[{type:'income'}],debts:[],subscriptions:[]},
    {transactions:[{type:'receita',status:'pago',description:'Salário',value:0,date:'2026-10-01'}],debts:[],subscriptions:[]},
    {transactions:[{type:'receita',status:'pago',description:'Salário',value:1,date:'2026-02-30'}],debts:[],subscriptions:[]},
    {transactions:[],debts:[{name:'Dívida',total:100,parcelValue:0,totalParcels:2,paidParcels:0,firstDueDate:'2026-10-01'}],subscriptions:[]},
    {transactions:[],debts:[],subscriptions:[{name:'App',value:0,period:'mensal',nextDate:'2026-10-01',status:'ativa'}]},
    {transactions:Array(10001).fill({}),debts:[],subscriptions:[]}
  ];
  for (const backup of invalid) assert.throws(() => run(`normalizeBackup(${JSON.stringify(backup)})`));
});

test('backup rejects invalid transaction, debt, and subscription fields at their boundaries', () => {
  const run = createApp();
  const tx = {type:'receita',status:'pago',description:'Salário',value:1,date:'2026-10-01'};
  const debt = {name:'Dívida',total:100,parcelValue:50,totalParcels:2,paidParcels:0,firstDueDate:'2026-10-01'};
  const subscription = {name:'App',value:10,period:'mensal',nextDate:'2026-10-01',status:'ativa'};
  const invalid = [
    {transactions:[{...tx,status:'aberto'}],debts:[],subscriptions:[]},
    {transactions:[{...tx,description:'  '}],debts:[],subscriptions:[]},
    {transactions:[{...tx,description:'x'.repeat(501)}],debts:[],subscriptions:[]},
    {transactions:[{...tx,value:-1}],debts:[],subscriptions:[]},
    {transactions:[{...tx,date:'2026-13-01'}],debts:[],subscriptions:[]},
    {transactions:[],debts:[{...debt,totalParcels:601}],subscriptions:[]},
    {transactions:[],debts:[{...debt,paidParcels:3}],subscriptions:[]},
    {transactions:[],debts:[{...debt,firstDueDate:'2026-02-30'}],subscriptions:[]},
    {transactions:[],debts:[],subscriptions:[{...subscription,period:'semanal'}]},
    {transactions:[],debts:[],subscriptions:[{...subscription,status:'excluida'}]},
    {transactions:[],debts:[],subscriptions:[{...subscription,nextDate:'2026-04-31'}]},
    {transactions:[],debts:[],subscriptions:[{...subscription,name:'x'.repeat(501)}]}
  ];
  for (const backup of invalid) assert.throws(() => run(`normalizeBackup(${JSON.stringify(backup)})`));
});

test('backup metadata is tied to the selected profile and rejects an unknown profile', () => {
  const run = createApp();
  const data = emptyBackup();
  const snapshot = plain(run(`createBackupSnapshot(${JSON.stringify(data)},'paloma','2026-10-19T12:00:00.000Z')`));
  assert.deepEqual(snapshot._backup, {format:'finance-dashboard',version:1,profileId:'paloma',profileName:'Paloma',exportedAt:'2026-10-19T12:00:00.000Z'});
  assert.equal(run(`assertBackupProfile(${JSON.stringify(snapshot)},'paloma')`), 'paloma');
  assert.throws(() => run(`assertBackupProfile(${JSON.stringify(snapshot)},'carlos')`), /Paloma/);
  assert.throws(() => run(`assertBackupProfile({_backup:{profileId:'unknown'}},'carlos')`), /perfil desconhecido/);
  assert.equal(run(`assertBackupProfile(${JSON.stringify(data)},'carlos')`), null);
  assert.throws(() => run(`createBackupSnapshot(${JSON.stringify(data)},'unknown')`), /identificar o perfil/);
});

test('local financial data saves and loads independently for Dudu and Paloma', () => {
  const storage = new Map();
  const run = createApp(storage);
  run(`state={transactions:[{description:'Salário Dudu'}],debts:[],subscriptions:[]};saveLocalData();currentProfile='paloma';state={transactions:[{description:'Salário Paloma'}],debts:[],subscriptions:[]};saveLocalData();`);
  assert.ok(storage.has('finance_dashboard_data_carlos'));
  assert.ok(storage.has('finance_dashboard_data_paloma'));
  run(`currentProfile='carlos';loadData()`);
  assert.equal(run('state.transactions[0].description'), 'Salário Dudu');
  run(`currentProfile='paloma';loadData()`);
  assert.equal(run('state.transactions[0].description'), 'Salário Paloma');
});

test('loading an older local debt record reconstructs its first installment date', () => {
  const storage = new Map([['finance_dashboard_data_carlos', JSON.stringify({transactions:[],debts:[{name:'Notebook',paidParcels:2,dueDate:'2026-10-31',totalParcels:6}],subscriptions:[]})]]);
  const run = createApp(storage);
  run('loadData()');
  assert.equal(run('state.debts[0].firstDueDate'), '2026-08-31');
});

test('backup import applies a valid snapshot locally without cloud access', async () => {
  const storage = new Map();
  const run = createApp(storage);
  await run(`(async()=>{refresh=()=>{};showToast=()=>{};state={transactions:[{description:'Anterior'}],debts:[],subscriptions:[]};currentProfile='carlos';await applyImportedBackup({transactions:[{type:'receita',status:'pago',description:'Restaurado',value:125,date:'2026-10-01'}],debts:[],subscriptions:[]});})()`);
  assert.equal(run('state.transactions[0].description'), 'Restaurado');
  assert.equal(JSON.parse(storage.get('finance_dashboard_data_carlos')).transactions[0].description, 'Restaurado');
  assert.equal(run('stateChangePending'), false);
});

test('backup import rolls state back when local persistence fails', async () => {
  const storage = new Map();
  storage.set = () => { throw new Error('storage full'); };
  const run = createApp(storage);
  await run(`(async()=>{refresh=()=>{};showToast=()=>{};state={transactions:[{description:'Preservado'}],debts:[],subscriptions:[]};currentProfile='carlos';await applyImportedBackup({transactions:[{type:'receita',status:'pago',description:'Novo',value:125,date:'2026-10-01'}],debts:[],subscriptions:[]});})()`);
  assert.equal(run('state.transactions[0].description'), 'Preservado');
  assert.equal(run('stateChangePending'), false);
});

test('financial text is escaped before it is rendered as HTML', () => {
  const run = createApp();
  assert.equal(run(`safe('<script>alert("x")</script>&')`), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;');
});

test('chart choices persist only supported values', () => {
  const storage = new Map();
  const run = createApp(storage);
  run(`setChartType('annual','area');setChartType('category','bar')`);
  assert.deepEqual(JSON.parse(storage.get('finance_dashboard_chart_types')), {annual:'area',category:'bar'});
  run(`setChartType('annual','unknown')`);
  assert.deepEqual(JSON.parse(storage.get('finance_dashboard_chart_types')), {annual:'area',category:'bar'});
});
