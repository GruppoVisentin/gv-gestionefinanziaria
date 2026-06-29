import fs from 'fs';
const data = JSON.parse(fs.readFileSync('gv-cashflow.gvcf', 'utf8'));
const transactions = data.transactions || [];

// Search for any transaction that has amount equal to or close to our numbers, or check sums
const checkNear = (num) => {
  return transactions.filter(t => Math.abs(t.amount - num) < 5);
};

console.log('Searching for transactions close to user totals:');
console.log('Close to 307818.70:', checkNear(307818.70));
console.log('Close to 334718.75:', checkNear(334718.75));
console.log('Close to 441683.08:', checkNear(441683.08));
console.log('Close to 351673.53:', checkNear(351673.53));
