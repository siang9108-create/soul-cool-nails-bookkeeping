const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'soulcool_nails_FINAL_fixed_index.html'), 'utf8');
const core = html.match(/\/\* BIWEEKLY_CORE_START \*\/([\s\S]*?)\/\* BIWEEKLY_CORE_END \*\//);
assert.ok(core, 'biweekly core functions must remain available to tests');
const context = {};
vm.createContext(context);
vm.runInContext(`${core[1]};this.api={biweeklyPeriodForISO,moveBiweeklyPeriodFrom,calculateBiweeklySettlement}`, context);
const { biweeklyPeriodForISO, moveBiweeklyPeriodFrom, calculateBiweeklySettlement } = context.api;

test('page exposes the three Daily tabs in the requested order', () => {
  const dailySummary = html.indexOf('>每日總表</button>');
  const serviceDetail = html.indexOf('>服務費明細</button>');
  const biweekly = html.indexOf('>兩週結算</button>');
  assert.ok(dailySummary >= 0 && dailySummary < serviceDetail && serviceDetail < biweekly);
  assert.match(html, /服務費總額/);
  assert.match(html, /Tips 總額/);
  assert.match(html, /服務分成 55%/);
  assert.match(html, /應付美甲師/);
});

test('all inline scripts compile', () => {
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0);
  scripts.forEach((script, index) => assert.doesNotThrow(() => new vm.Script(script[1], { filename: `inline-${index}.js` })));
});

test('local UI switches to biweekly and renders existing tech data', () => {
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  const element = () => ({ hidden: false, textContent: '', classList: { toggle() {} }, setAttribute() {} });
  const ui = {
    iDate: { value: '2026-08-16' },
    today: () => '2026-08-16',
    num: value => Number(value || 0),
    dailyTechSummary: [{ date: '2026-08-16', tech: 'Eva', amount: 100, tip: 10 }],
    incomes: [],
    splitsOf: () => [],
    render() {},
    personalDailyCard: element(), serviceDetailPanel: element(), biweeklySettlementPanel: element(),
    dailySummaryTab: element(), serviceDetailTab: element(), biweeklySettlementTab: element(),
    biweeklyPeriod: element(), biweeklyServiceTotal: element(), biweeklyTipsTotal: element(),
    biweeklyCommission: element(), biweeklyPayable: element(), biweeklyTechName: element()
  };
  vm.createContext(ui);
  vm.runInContext(scripts.at(-1)[1], ui);
  vm.runInContext("showDailyResultTab('biweekly')", ui);
  assert.equal(ui.biweeklySettlementPanel.hidden, false);
  assert.equal(ui.personalDailyCard.hidden, true);
  assert.equal(ui.biweeklyPeriod.textContent, '2026/08/16 ～ 2026/08/31');
  assert.equal(ui.biweeklyServiceTotal.textContent, '$100.00');
  assert.equal(ui.biweeklyTipsTotal.textContent, '$10.00');
  assert.equal(ui.biweeklyCommission.textContent, '$55.00');
  assert.equal(ui.biweeklyPayable.textContent, '$65.00');
  assert.equal(ui.biweeklyTechName.textContent, '美甲師：Eva');
  vm.runInContext('moveBiweeklyPeriod(1)', ui);
  assert.equal(ui.biweeklyPeriod.textContent, '2026/09/01 ～ 2026/09/15');
});

test('2026/08/16 through 2026/08/31', () => {
  const period = biweeklyPeriodForISO('2026-08-16');
  assert.deepEqual({ start: period.start, end: period.end }, { start: '2026-08-16', end: '2026-08-31' });
});
test('2026/09/01 through 2026/09/15', () => {
  const period = biweeklyPeriodForISO('2026-09-01');
  assert.deepEqual({ start: period.start, end: period.end }, { start: '2026-09-01', end: '2026-09-15' });
});
test('2026/09/16 through 2026/09/30', () => {
  const period = biweeklyPeriodForISO('2026-09-16');
  assert.deepEqual({ start: period.start, end: period.end }, { start: '2026-09-16', end: '2026-09-30' });
});
test('February ends on day 28 in a common year', () => {
  assert.equal(biweeklyPeriodForISO('2026-02-16').end, '2026-02-28');
});
test('February ends on day 29 in a leap year', () => {
  assert.equal(biweeklyPeriodForISO('2028-02-16').end, '2028-02-29');
});
test('previous and next navigate between fixed half-month periods', () => {
  const period = biweeklyPeriodForISO('2026-08-16');
  assert.equal(moveBiweeklyPeriodFrom(period, -1).start, '2026-08-01');
  assert.equal(moveBiweeklyPeriodFrom(period, 1).start, '2026-09-01');
});
test('Tips and 55 percent commission use integer cents', () => {
  const result = calculateBiweeklySettlement([
    { date: '2026-08-16', serviceCents: 10001, tipsCents: 2500 },
    { date: '2026-08-31', serviceCents: 8999, tipsCents: 1500 },
    { date: '2026-09-01', serviceCents: 999999, tipsCents: 999999 }
  ], biweeklyPeriodForISO('2026-08-16'), 5500);
  assert.equal(result.serviceCents, 19000);
  assert.equal(result.tipsCents, 4000);
  assert.equal(result.commissionCents, 10450);
  assert.equal(result.payableCents, 14450);
});
