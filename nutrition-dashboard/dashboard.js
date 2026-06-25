const TRACKER_FILE = "Jason's_Calorie_and_Macro_Intake.md";

let currentData = null;

const formatNumber = (value, digits = 0) =>
  Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

function toNumber(value) {
  return Number(String(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/)?.[0] || 0);
}

function splitMarkdownRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

async function loadTrackerMarkdown() {
  const response = await fetch(encodeURI(TRACKER_FILE), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Could not load ${TRACKER_FILE}: ${response.status}`);
  }

  return response.text();
}

function parseTracker(markdown) {
  const calorieTarget = toNumber(markdown.match(/Daily calorie target:\s*([\d,]+)/i)?.[1]);
  const proteinTarget = toNumber(markdown.match(/Daily protein target:\s*([\d.]+)/i)?.[1]);
  const lines = markdown.split(/\r?\n/);
  const weights = [];
  const days = [];
  let inWeightLog = false;
  let currentDay = null;

  for (const line of lines) {
    const dateHeading = line.match(/^###\s+(\d{4}-\d{2}-\d{2})/);

    if (line.startsWith("## Weight Log")) {
      inWeightLog = true;
      continue;
    }

    if (line.startsWith("## Daily Log")) {
      inWeightLog = false;
      continue;
    }

    if (inWeightLog && /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(line)) {
      const [date, weight] = splitMarkdownRow(line);
      weights.push({ date, weight });
      continue;
    }

    if (dateHeading) {
      currentDay = { date: dateHeading[1], foods: [], totals: null };
      days.push(currentDay);
      continue;
    }

    if (!currentDay) continue;

    if (/^\|.+\|$/.test(line) && !line.includes("---") && !line.includes("Food | Amount")) {
      const cells = splitMarkdownRow(line);
      if (cells.length >= 8) {
        currentDay.foods.push({
          date: currentDay.date,
          food: cells[0],
          amount: cells[1],
          basis: cells[2],
          calories: toNumber(cells[3]),
          protein: toNumber(cells[4]),
          carbs: toNumber(cells[5]),
          fat: toNumber(cells[6]),
        });
      }
      continue;
    }

    const total = line.match(
      /\*\*Daily Total:\*\*\s*([\d,.]+)\s*calories,\s*([\d,.]+)g protein,\s*([\d,.]+)g carbs,\s*([\d,.]+)g fat/i
    );
    if (total) {
      currentDay.totals = {
        calories: toNumber(total[1]),
        protein: toNumber(total[2]),
        carbs: toNumber(total[3]),
        fat: toNumber(total[4]),
      };
    }
  }

  return {
    targets: { calories: calorieTarget, protein: proteinTarget },
    weights,
    days: days.filter((day) => day.totals),
  };
}

function average(items, key) {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + item.totals[key], 0) / items.length;
}

function renderDashboard(data) {
  const { days, weights, targets } = data;
  const allFoods = days.flatMap((day) => day.foods);
  const avgCalories = average(days, "calories");
  const avgProtein = average(days, "protein");
  const avgCarbs = average(days, "carbs");
  const avgFat = average(days, "fat");
  const latestWeight = weights.at(-1);

  document.getElementById("logged-days").textContent = days.length;
  document.getElementById("date-range").textContent = days.length
    ? `${days[0].date} to ${days.at(-1).date}`
    : "No entries";
  document.getElementById("avg-calories").textContent = formatNumber(avgCalories);
  document.getElementById("calorie-target").textContent = `Target: ${formatNumber(targets.calories)} calories`;
  document.getElementById("avg-protein").textContent = `${formatNumber(avgProtein, 1)}g`;
  document.getElementById("protein-target").textContent = `Target: ${formatNumber(targets.protein)}g`;
  document.getElementById("latest-weight").textContent = latestWeight?.weight || "-";
  document.getElementById("latest-weight-date").textContent = latestWeight ? latestWeight.date : "No weigh-in";

  renderTrend(days, targets);
  renderMacros(avgProtein, avgCarbs, avgFat);
  renderInsights(days, targets);
  renderDateFilter(days);
  renderFoodTable(allFoods);
}

function renderTrend(days) {
  const chart = document.getElementById("trend-chart");
  if (!days.length) {
    chart.innerHTML = '<p class="empty-chart">No daily calorie data yet.</p>';
    return;
  }

  const width = Math.max(720, days.length * 96);
  const height = 360;
  const padding = { top: 22, right: 28, bottom: 52, left: 62 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxCalories = Math.max(...days.map((day) => day.totals.calories));
  const yMax = Math.max(300, Math.ceil(maxCalories / 300) * 300);
  const xStep = days.length > 1 ? plotWidth / (days.length - 1) : 0;
  const yTicks = Array.from({ length: yMax / 300 + 1 }, (_, index) => index * 300);
  const points = days.map((day, index) => {
    const x = padding.left + (days.length > 1 ? index * xStep : plotWidth / 2);
    const y = padding.top + plotHeight - (day.totals.calories / yMax) * plotHeight;
    return { ...day, x, y };
  });
  const pointString = points.map((point) => `${point.x},${point.y}`).join(" ");

  chart.innerHTML = `
    <svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="trend-title trend-desc">
      <title id="trend-title">Daily calorie trend</title>
      <desc id="trend-desc">Line chart showing calories by date with 300-calorie y-axis increments.</desc>
      ${yTicks
        .map((tick) => {
          const y = padding.top + plotHeight - (tick / yMax) * plotHeight;
          return `
            <line class="gridline" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>
            <text class="axis-label y-label" x="${padding.left - 12}" y="${y + 4}">${formatNumber(tick)}</text>
          `;
        })
        .join("")}
      <line class="axis-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"></line>
      <line class="axis-line" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>
      <polyline class="calorie-line" points="${pointString}"></polyline>
      ${points
        .map(
          (point) => `
            <g>
              <circle class="calorie-dot" cx="${point.x}" cy="${point.y}" r="5"></circle>
              <text class="point-value" x="${point.x}" y="${point.y - 12}">${formatNumber(point.totals.calories)}</text>
              <text class="axis-label x-label" x="${point.x}" y="${height - 20}">${point.date.slice(5)}</text>
            </g>
          `
        )
        .join("")}
    </svg>
  `;
}

function renderMacros(protein, carbs, fat) {
  const caloriesFromMacros = protein * 4 + carbs * 4 + fat * 9;
  const shares = {
    protein: caloriesFromMacros ? (protein * 4) / caloriesFromMacros : 0,
    carbs: caloriesFromMacros ? (carbs * 4) / caloriesFromMacros : 0,
    fat: caloriesFromMacros ? (fat * 9) / caloriesFromMacros : 0,
  };

  for (const macro of Object.keys(shares)) {
    const percent = Math.round(shares[macro] * 100);
    document.getElementById(`${macro}-bar`).style.width = `${percent}%`;
    document.getElementById(`${macro}-share`).textContent = `${percent}%`;
  }
}

function renderInsights(days, targets) {
  const byProtein = [...days].sort((a, b) => b.totals.protein - a.totals.protein)[0];
  const byCalories = [...days].sort((a, b) => b.totals.calories - a.totals.calories)[0];
  const underTarget = days.filter((day) => day.totals.calories <= targets.calories).length;

  document.getElementById("highest-protein").textContent = byProtein
    ? `${byProtein.date}, ${formatNumber(byProtein.totals.protein, 1)}g`
    : "-";
  document.getElementById("highest-calorie").textContent = byCalories
    ? `${byCalories.date}, ${formatNumber(byCalories.totals.calories)}`
    : "-";
  document.getElementById("under-target").textContent = `${underTarget} of ${days.length}`;
}

function renderDateFilter(days) {
  const filter = document.getElementById("date-filter");
  const previous = filter.value || "all";
  filter.innerHTML = '<option value="all">All dates</option>';

  for (const day of days) {
    const option = document.createElement("option");
    option.value = day.date;
    option.textContent = day.date;
    filter.appendChild(option);
  }

  filter.value = [...filter.options].some((option) => option.value === previous) ? previous : "all";
}

function renderFoodTable(foods) {
  const filterValue = document.getElementById("date-filter").value;
  const rows = filterValue === "all" ? foods : foods.filter((food) => food.date === filterValue);
  const table = document.getElementById("food-table");
  table.innerHTML = rows
    .map(
      (food) => `
        <tr>
          <td>${escapeHtml(food.date)}</td>
          <td>${escapeHtml(food.food)}</td>
          <td>${escapeHtml(food.amount)}</td>
          <td>${escapeHtml(food.basis)}</td>
          <td>${formatNumber(food.calories)}</td>
          <td>${formatNumber(food.protein, 1)}g</td>
          <td>${formatNumber(food.carbs, 1)}g</td>
          <td>${formatNumber(food.fat, 1)}g</td>
        </tr>
      `
    )
    .join("");
}

function renderLoadError(error) {
  console.error(error);
  document.getElementById("date-range").textContent = `Could not load ${TRACKER_FILE}`;
  document.getElementById("food-table").innerHTML = `
    <tr>
      <td colspan="8">
        Could not load the local markdown file. Open this dashboard through a local web server, or use Load updated markdown.
      </td>
    </tr>
  `;
}

async function loadAndRenderTracker() {
  try {
    const markdown = await loadTrackerMarkdown();
    currentData = parseTracker(markdown);
    renderDashboard(currentData);
  } catch (error) {
    renderLoadError(error);
  }
}

document.getElementById("date-filter").addEventListener("change", () => {
  if (!currentData) return;
  renderFoodTable(currentData.days.flatMap((day) => day.foods));
});

document.getElementById("reset-data").addEventListener("click", loadAndRenderTracker);

document.getElementById("markdown-file").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const markdown = await file.text();
  currentData = parseTracker(markdown);
  renderDashboard(currentData);
});

loadAndRenderTracker();
