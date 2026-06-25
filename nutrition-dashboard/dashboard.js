const TRACKER_FILE = "Jason's_Calorie_and_Macro_Intake.md";
const trendMetrics = {
  calories: {
    label: "Calories",
    heading: "Calories by date",
    unit: "calories",
    tickSize: 300,
    valueKey: "calories",
    valueDigits: 0,
  },
  protein: {
    label: "Protein",
    heading: "Protein by date",
    unit: "grams",
    tickSize: 25,
    valueKey: "protein",
    valueDigits: 1,
  },
};

let currentData = null;
let activeTrendMetric = "calories";
let activeTrendRange = "7";

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

  updateRangeInputs(days);
  renderTrend(days, activeTrendMetric);
  renderMacros(avgProtein, avgCarbs, avgFat);
  renderInsights(days, targets);
  renderDateFilter(days);
  renderFoodTable(days);
}

function toDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function offsetDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getFilteredTrendDays(days) {
  if (!days.length) return [];

  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const latestDate = toDate(sortedDays.at(-1).date);
  let startDate = null;
  let endDate = latestDate;

  if (activeTrendRange === "7") {
    startDate = offsetDays(latestDate, -6);
  } else if (activeTrendRange === "month") {
    startDate = offsetDays(latestDate, -29);
  } else {
    const startInput = document.getElementById("trend-start-date").value;
    const endInput = document.getElementById("trend-end-date").value;
    startDate = startInput ? toDate(startInput) : toDate(sortedDays[0].date);
    endDate = endInput ? toDate(endInput) : latestDate;
  }

  if (startDate > endDate) {
    [startDate, endDate] = [endDate, startDate];
  }

  return sortedDays.filter((day) => {
    const date = toDate(day.date);
    return date >= startDate && date <= endDate;
  });
}

function updateRangeInputs(days) {
  const startInput = document.getElementById("trend-start-date");
  const endInput = document.getElementById("trend-end-date");
  if (!days.length) return;

  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
  startInput.min = sortedDays[0].date;
  startInput.max = sortedDays.at(-1).date;
  endInput.min = sortedDays[0].date;
  endInput.max = sortedDays.at(-1).date;

  if (!startInput.value || startInput.value < startInput.min || startInput.value > startInput.max) {
    startInput.value = sortedDays[0].date;
  }

  if (!endInput.value || endInput.value < endInput.min || endInput.value > endInput.max) {
    endInput.value = sortedDays.at(-1).date;
  }
}

function renderTrend(days, metricName = "calories") {
  const chart = document.getElementById("trend-chart");
  const metric = trendMetrics[metricName] || trendMetrics.calories;
  const trendDays = getFilteredTrendDays(days);
  document.getElementById("trend-title-text").textContent = metric.heading;

  if (!trendDays.length) {
    chart.innerHTML = `<p class="empty-chart">No daily ${metric.label.toLowerCase()} data in this range.</p>`;
    return;
  }

  const width = Math.max(720, trendDays.length * 96);
  const height = 360;
  const padding = { top: 22, right: 28, bottom: 52, left: 62 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...trendDays.map((day) => day.totals[metric.valueKey]));
  const yMax = Math.max(metric.tickSize, Math.ceil(maxValue / metric.tickSize) * metric.tickSize);
  const xStep = trendDays.length > 1 ? plotWidth / (trendDays.length - 1) : 0;
  const yTicks = Array.from({ length: yMax / metric.tickSize + 1 }, (_, index) => index * metric.tickSize);
  const points = trendDays.map((day, index) => {
    const value = day.totals[metric.valueKey];
    const x = padding.left + (trendDays.length > 1 ? index * xStep : plotWidth / 2);
    const y = padding.top + plotHeight - (value / yMax) * plotHeight;
    return { ...day, value, x, y };
  });
  const pointString = points.map((point) => `${point.x},${point.y}`).join(" ");

  chart.innerHTML = `
    <svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="trend-title trend-desc">
      <title id="trend-title">Daily ${metric.label.toLowerCase()} trend</title>
      <desc id="trend-desc">Line chart showing ${metric.label.toLowerCase()} by date with ${metric.tickSize}-${metric.unit} y-axis increments.</desc>
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
      <polyline class="trend-line ${metricName}" points="${pointString}"></polyline>
      ${points
        .map(
          (point) => `
            <g>
              <circle class="trend-dot ${metricName}" cx="${point.x}" cy="${point.y}" r="5"></circle>
              <text class="point-value" x="${point.x}" y="${point.y - 12}">${formatNumber(point.value, metric.valueDigits)}</text>
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
  const previous = filter.value;
  filter.innerHTML = '<option value="all">All dates</option>';

  for (const day of days) {
    const option = document.createElement("option");
    option.value = day.date;
    option.textContent = day.date;
    filter.appendChild(option);
  }

  const hasPrevious = [...filter.options].some((option) => option.value === previous);
  filter.value = hasPrevious ? previous : days.at(-1)?.date || "all";
}

function renderFoodTable(days) {
  const filterValue = document.getElementById("date-filter").value;
  const selectedDay = days.find((day) => day.date === filterValue);
  const rows = filterValue === "all" ? days.flatMap((day) => day.foods) : selectedDay?.foods || [];
  const table = document.getElementById("food-table");
  const foodRows = rows
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
  const totalRow =
    filterValue !== "all" && selectedDay
      ? `
        <tr class="daily-total-row">
          <td>${escapeHtml(selectedDay.date)}</td>
          <td colspan="3">Daily total</td>
          <td>${formatNumber(selectedDay.totals.calories)}</td>
          <td>${formatNumber(selectedDay.totals.protein, 1)}g</td>
          <td>${formatNumber(selectedDay.totals.carbs, 1)}g</td>
          <td>${formatNumber(selectedDay.totals.fat, 1)}g</td>
        </tr>
      `
      : "";

  table.innerHTML = foodRows + totalRow;
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
  renderFoodTable(currentData.days);
});

document.getElementById("reset-data").addEventListener("click", loadAndRenderTracker);

document.querySelectorAll("[data-trend-metric]").forEach((button) => {
  button.addEventListener("click", () => {
    activeTrendMetric = button.dataset.trendMetric;
    document.querySelectorAll("[data-trend-metric]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    if (currentData) {
      renderTrend(currentData.days, activeTrendMetric);
    }
  });
});

document.querySelectorAll("[data-trend-range]").forEach((button) => {
  button.addEventListener("click", () => {
    activeTrendRange = button.dataset.trendRange;
    document.getElementById("custom-range").hidden = activeTrendRange !== "custom";
    document.querySelectorAll("[data-trend-range]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    if (currentData) {
      renderTrend(currentData.days, activeTrendMetric);
    }
  });
});

document.querySelectorAll("#trend-start-date, #trend-end-date").forEach((input) => {
  input.addEventListener("change", () => {
    activeTrendRange = "custom";
    document.getElementById("custom-range").hidden = false;
    document.querySelectorAll("[data-trend-range]").forEach((item) => {
      item.classList.toggle("active", item.dataset.trendRange === "custom");
    });

    if (currentData) {
      renderTrend(currentData.days, activeTrendMetric);
    }
  });
});

document.getElementById("markdown-file").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const markdown = await file.text();
  currentData = parseTracker(markdown);
  renderDashboard(currentData);
});

loadAndRenderTracker();
