document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const toINR = n => (typeof n === 'number' && !isNaN(n)) ? '₹' + n.toLocaleString('en-IN') : '—';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const elems = {
    name: $('name'), employment: $('employment'), income: $('income'),
    loanAmount: $('loanAmount'), tenure: $('tenure'), creditScore: $('creditScore'),
    age: $('age'), purpose: $('purpose'), coIncome: $('coIncome'), debts: $('debts'),
    emiPreview: $('emiPreview'), assessBtn: $('assessBtn'), csvBtn: $('csvBtn'),
    clearBtn: $('clearBtn'), sampleBtn: $('sampleBtn'),
    errName: $('err-name'), errIncome: $('err-income'), errLoan: $('err-loan'),
    errTenure: $('err-tenure'), errCredit: $('err-credit'), errAge: $('err-age'),
    resultContainer: $('resultContainer'), emiKPI: $('emiKPI'),
    emiRatioKPI: $('emiRatioKPI'), loanAnnualKPI: $('loanAnnualKPI'),
    totalRepKPI: $('totalRepKPI'), totalIntKPI: $('totalIntKPI'),
    probDisplay: $('probDisplay'), recommendations: $('recommendations'),
    amortTable: $('amortTable')
  };

  const WEIGHTS = { credit: 40, affordability: 35, loanSize: 15, employment: 7, age: 3 };
  const THRESHOLD = 65;
  const EMP_RATE = { govt: 0.085, salaried: 0.095, self: 0.11, student: 0.14 };

  const gaugeChart = new Chart($('gauge').getContext('2d'), {
    type: 'doughnut',
    data: { labels: ['Approval', 'Remaining'], datasets: [{ data: [0, 100], backgroundColor: ['#06b6d4', '#e6eef8'], borderWidth: 0 }] },
    options: { rotation: -90 * Math.PI / 180, circumference: 180 * Math.PI / 180, cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: false } }, maintainAspectRatio: false }
  });

  const breakdownChart = new Chart($('breakdown').getContext('2d'), {
    type: 'bar',
    data: { labels: ['Credit', 'Affordability', 'Loan-size', 'Employment', 'Age'], datasets: [{ label: 'Score', data: [0, 0, 0, 0, 0], backgroundColor: ['#60a5fa', '#06b6d4', '#ffd166', '#a78bfa', '#34d399'] }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100, ticks: { stepSize: 20 } } }, maintainAspectRatio: false }
  });

  let lastResult = null;

  function computeEMI(P, annualRate, months) {
    if (!P || months <= 0) return 0;
    const r = annualRate / 12;
    return r ? (P * r / (1 - Math.pow(1 + r, -months))) : (P / months);
  }

  function getAmortization(P, rAnnual, months) {
    const r = rAnnual / 12;
    const table = [];
    let balance = P, totalInterest = 0;
    for (let i = 1; i <= months; i++) {
      const interest = balance * r;
      const principal = computeEMI(P, rAnnual, months) - interest;
      balance = Math.max(0, balance - principal);
      totalInterest += interest;
      table.push({ month: i, principal: principal.toFixed(2), interest: interest.toFixed(2), cumulativePrincipal: (P - balance).toFixed(2), cumulativeInterest: totalInterest.toFixed(2), balance: balance.toFixed(2) });
    }
    return table;
  }

  function renderAmortization(data) {
    if (!data.length) { elems.amortTable.innerHTML = ''; return; }
    let html = '<table><thead><tr><th>Month</th><th>Principal</th><th>Interest</th><th>Cumulative P</th><th>Cumulative I</th><th>Balance</th></tr></thead><tbody>';
    data.forEach(r => { html += `<tr><td>${r.month}</td><td>${toINR(+r.principal)}</td><td>${toINR(+r.interest)}</td><td>${toINR(+r.cumulativePrincipal)}</td><td>${toINR(+r.cumulativeInterest)}</td><td>${toINR(+r.balance)}</td></tr>`; });
    html += '</tbody></table>';
    elems.amortTable.innerHTML = html;
  }

  function getFormData() {
    return {
      name: elems.name.value.trim(), employment: elems.employment.value,
      income: +elems.income.value, loanAmount: +elems.loanAmount.value,
      tenure: +elems.tenure.value, creditScore: +elems.creditScore.value,
      age: +elems.age.value, purpose: elems.purpose.value.trim(),
      coIncome: +elems.coIncome.value || 0, debts: +elems.debts.value || 0
    };
  }

  function validateForm(form) {
    const errorMap = { name: elems.errName, income: elems.errIncome, loanAmount: elems.errLoan, tenure: elems.errTenure, creditScore: elems.errCredit, age: elems.errAge };
    let valid = true;
    ['name', 'income', 'loanAmount', 'tenure', 'creditScore', 'age'].forEach(f => {
      const val = form[f];
      const err = errorMap[f];
      if (!val) { err.style.display = 'block'; valid = false; } else { err.style.display = 'none'; }
    });
    return valid;
  }

  function computeProbability(form) {
    const creditScore = clamp(form.creditScore, 300, 900);
    const incomeTotal = form.income + form.coIncome - form.debts;
    const affordabilityScore = clamp(100 * (incomeTotal / (form.loanAmount / (form.tenure || 1))), 0, 100);
    const loanSizeScore = clamp(100 * (1 - form.loanAmount / (form.income * 12)), 0, 100);
    const empScore = EMP_RATE[form.employment] || 0.1;
    const ageScore = clamp(100 * (form.age / 75), 0, 100);
    const weighted = (creditScore * WEIGHTS.credit / 100 + affordabilityScore * WEIGHTS.affordability / 100 + loanSizeScore * WEIGHTS.loanSize / 100 + (100 - empScore * 100) * WEIGHTS.employment / 100 + ageScore * WEIGHTS.age / 100);
    return clamp(weighted, 0, 100);
  }

  function updateDashboard(prob, factors) {
    gaugeChart.data.datasets[0].data = [prob, 100 - prob]; gaugeChart.update();
    breakdownChart.data.datasets[0].data = factors; breakdownChart.update();
    elems.probDisplay.textContent = prob.toFixed(1) + '%';
  }

  function updateKPIs(emi, P, tenure) {
    const totalRep = emi * tenure, totalInt = totalRep - P;
    elems.emiKPI.textContent = toINR(emi);
    elems.emiRatioKPI.textContent = ((emi / (elems.income.value || 1)) * 100).toFixed(1) + '%';
    elems.loanAnnualKPI.textContent = ((P / ((elems.income.value || 1) * 12)) * 100).toFixed(1) + '%';
    elems.totalRepKPI.textContent = toINR(totalRep);
    elems.totalIntKPI.textContent = toINR(totalInt);
  }

  function renderResult(prob) {
    let box = document.createElement('div');
    box.className = 'resultBox';
    if (prob >= THRESHOLD) { box.classList.add('ok'); box.textContent = `✅ Loan likely to be approved (Score: ${prob.toFixed(1)}%)`; }
    else { box.classList.add('review'); box.textContent = `⚠️ Loan may be risky (Score: ${prob.toFixed(1)}%)`; }
    elems.resultContainer.innerHTML = ''; elems.resultContainer.appendChild(box);
  }

  function generateCSV(form, emi) {
    const dateStr = new Date().toISOString().split('T')[0];
    const headers = ['Name', 'Employment', 'Income', 'CoIncome', 'Debts', 'Loan Amount', 'Tenure', 'Credit Score', 'Age', 'Purpose', 'EMI', 'Probability'];
    const values = [form.name, form.employment, form.income, form.coIncome, form.debts, form.loanAmount, form.tenure, form.creditScore, form.age, form.purpose, emi.toFixed(2), lastResult.toFixed(1)];
    const csvContent = [headers.join(','), values.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = `${form.name || 'applicant'}_${dateStr}.csv`; link.click();
  }

  function prefillExample() {
    elems.name.value = 'Rahul Sharma';
    elems.employment.value = 'salaried';
    elems.income.value = 50000;
    elems.loanAmount.value = 300000;
    elems.tenure.value = 36;
    elems.creditScore.value = 720;
    elems.age.value = 32;
    elems.purpose.value = 'Home repair';
    elems.coIncome.value = 20000;
    elems.debts.value = 5000;
    elems.emiPreview.textContent = 'EMI preview: ₹0';
    elems.resultContainer.innerHTML = '';
    elems.probDisplay.textContent = '—';
    elems.recommendations.textContent = '';
    elems.amortTable.innerHTML = '';
  }

  function assessLoan() {
    const form = getFormData();
    if (!validateForm(form)) return;

    const emi = computeEMI(form.loanAmount, EMP_RATE[form.employment], form.tenure);
    elems.emiPreview.textContent = `EMI preview: ${toINR(emi)}`;
    updateKPIs(emi, form.loanAmount, form.tenure);

    const prob = computeProbability(form);
    lastResult = prob;

    const factors = [
      clamp(form.creditScore / 9, 0, 100),
      clamp(100 * ((form.income + form.coIncome - form.debts) / (form.loanAmount / form.tenure)), 0, 100),
      clamp(100 * (1 - form.loanAmount / (form.income * 12)), 0, 100),
      (100 - EMP_RATE[form.employment] * 100),
      clamp(100 * (form.age / 75), 0, 100)
    ];
    updateDashboard(prob, factors);
    renderResult(prob);

    const recs = [];
    if (prob < THRESHOLD) recs.push('Consider reducing loan amount or improving credit score.');
    else recs.push('Loan likely to be approved.');
    elems.recommendations.textContent = recs.join(' ');

    renderAmortization(getAmortization(form.loanAmount, EMP_RATE[form.employment], form.tenure));
  }

  // Event listeners
  elems.assessBtn.addEventListener('click', assessLoan);
  elems.csvBtn.addEventListener('click', () => { if (lastResult !== null) generateCSV(getFormData(), computeEMI(getFormData().loanAmount, EMP_RATE[getFormData().employment], getFormData().tenure)); });
  elems.clearBtn.addEventListener('click', () => {
    document.querySelectorAll('input').forEach(i => i.value = '');
    elems.resultContainer.innerHTML = '';
    elems.emiPreview.textContent = 'EMI preview: ₹0';
    elems.probDisplay.textContent = '—';
    elems.recommendations.textContent = '';
    elems.amortTable.innerHTML = '';
  });
  elems.sampleBtn.addEventListener('click', prefillExample);

  // Live EMI preview
  ['loanAmount', 'tenure', 'employment'].forEach(id => {
    elems[id].addEventListener('input', () => {
      const form = getFormData();
      const emi = computeEMI(form.loanAmount, EMP_RATE[form.employment], form.tenure);
      elems.emiPreview.textContent = `EMI preview: ${toINR(emi)}`;
    });
  });
});
