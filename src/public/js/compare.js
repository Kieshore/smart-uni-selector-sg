const compareState = {
  left: null,
  right: null,
  activeSide: null,
  allCourses: [],
};

function buildMetrics() {
  const interestMetrics = getWantedInterestSelections().map(interest => ({
    key: `interest_relevance_${normalizeInterestKey(interest.name)}`,
    label: `${interest.label}: ${interest.name}`,
    higherBetter: true,
    type: "interest_relevance",
    interestName: interest.name,
  }));

  return [
    ...interestMetrics,
    { key: "interest_score", label: "Overall interest score", higherBetter: true },
    { key: "matched_interest_count", label: "Matched interest count", higherBetter: true },
    { key: "intake_size", label: "Intake size", higherBetter: true },
    { key: "prestige", label: "Prestige score", higherBetter: true },
    { key: "salary", label: "Gross monthly median", higherBetter: true, type: "money" },
    { key: "employability", label: "Overall employment rate", higherBetter: true, type: "percent" },
    { key: "min_gpa", label: "GPA requirement", higherBetter: false },
    { key: "tenth_percentile_rp", label: "10th percentile RP", higherBetter: false },
    { key: "tenth_percentile_uas_70", label: "10th percentile UAS 70", higherBetter: false },
    { key: "cutoff_gap", label: "Cutoff gap", higherBetter: true },
  ];
}

function loadInitialCompareCourses() {
  const stored = getCompareCourses().map(normalizeCourseForCompare);

  compareState.left = stored[0] || null;
  compareState.right = stored[1] || null;
}

function getMetricValue(course, key, metric = null) {
  if (!course) return null;

  if (metric?.type === "interest_relevance") {
    const rows =
      course.interest_relevance_rows?.length
        ? course.interest_relevance_rows
        : getCourseInterestRelevanceRows(course);

    const matchedRow = rows.find(row =>
      normalizeInterestKey(row.name) === normalizeInterestKey(metric.interestName)
    );

    return matchedRow?.relevance_score ?? 0;
  }

  return course[key] ?? null;
}

function formatCompareValue(value, type = "text") {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "money") return `$${Number(value).toLocaleString()}`;
  if (type === "percent") return `${value}%`;
  if (type === "interest_relevance") return `${value}/3`;
  return value;
}

function getStatClass(side, metric) {
  const leftValue = Number(getMetricValue(compareState.left, metric.key, metric));
  const rightValue = Number(getMetricValue(compareState.right, metric.key, metric));

  if (!compareState.left || !compareState.right) return "";
  if (Number.isNaN(leftValue) || Number.isNaN(rightValue)) return "";
  if (leftValue === rightValue) return "";

  const sideValue = side === "left" ? leftValue : rightValue;
  const otherValue = side === "left" ? rightValue : leftValue;

  const isBetter = metric.higherBetter
    ? sideValue > otherValue
    : sideValue < otherValue;

  return isBetter ? "stat-better" : "stat-worse";
}

function renderInterestRelevanceRows(course) {
  const rows =
    course.interest_relevance_rows?.length
      ? course.interest_relevance_rows
      : getCourseInterestRelevanceRows(course);

  if (!rows.length) {
    return `
      <div class="compare-interest-block">
        <h3>Interest relevance</h3>
        <p class="muted">No profile interests selected.</p>
      </div>
    `;
  }

  return `
    <div class="compare-interest-block">
      <h3>Interest relevance</h3>

      <div class="interest-relevance-list">
        ${rows.map(row => `
          <div class="interest-relevance-row">
            <div>
              <span class="interest-tier-badge ${row.tier}">
                ${row.label}
              </span>
              <strong>${row.name}</strong>
            </div>

            <span class="interest-relevance-score">
              ${row.relevance_score}/3
            </span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderCourse(side) {
  const container = document.getElementById(`${side}Course`);
  const course = compareState[side];

  if (!course) {
    container.innerHTML = `
      <div class="empty-state">
        No course selected. Press the plus button to add one.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <h2 class="compare-course-title">${course.course_name}</h2>
    <p class="muted">${course.university_code || "—"}</p>


    <div class="compare-stat-list">
      ${buildMetrics().map(metric => {
  const value = getMetricValue(course, metric.key, metric);
  const statClass = getStatClass(side, metric);

  return `
    <div class="compare-stat ${statClass}">
      <strong>${metric.label}</strong>
      <span>${formatCompareValue(value, metric.type)}</span>
    </div>
  `;
}).join("")}
    </div>

    <button class="remove-course-btn" data-side="${side}">
      Remove course
    </button>
  `;

  container.querySelector(".remove-course-btn").addEventListener("click", () => {
    compareState[side] = null;
    saveCompareState();
    renderCompare();
  });
}

function renderCompare() {
  renderCourse("left");
  renderCourse("right");
}

function saveCompareState() {
  saveCompareCourses([compareState.left, compareState.right]);
}

async function searchCourses(search = "") {
  const json = await fetchJson(`/courses?search=${encodeURIComponent(search)}`);

  compareState.allCourses = json.data.map(normalizeCourseForCompare);

  renderCourseSearchResults();
}

function openCourseModal(side) {
  compareState.activeSide = side;

  document.getElementById("courseSearchModal").classList.add("active");
  document.getElementById("courseSearchInput").value = "";

  searchCourses();
}

function closeCourseModal() {
  document.getElementById("courseSearchModal").classList.remove("active");
}

function renderCourseSearchResults() {
  const results = document.getElementById("courseSearchResults");

  results.innerHTML = "";

  if (!compareState.allCourses.length) {
    results.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No courses found.</div>`;
    return;
  }

  compareState.allCourses.forEach(course => {
    const button = document.createElement("button");
    button.className = "interest-choice";

    button.innerHTML = `
      <strong>${course.course_name}</strong><br />
      <span class="muted">${course.university_code || "—"}</span>
    `;

    button.addEventListener("click", () => {
      compareState[compareState.activeSide] = course;
      saveCompareState();
      closeCourseModal();
      renderCompare();
    });

    results.appendChild(button);
  });
}

const debouncedCourseSearch = debounce(value => {
  searchCourses(value);
}, 300);

document.querySelectorAll(".add-course-btn").forEach(button => {
  button.addEventListener("click", () => openCourseModal(button.dataset.side));
});

document.getElementById("closeCourseModal").addEventListener("click", closeCourseModal);

document.getElementById("courseSearchModal").addEventListener("click", event => {
  if (event.target.id === "courseSearchModal") {
    closeCourseModal();
  }
});

document.getElementById("courseSearchInput").addEventListener("input", event => {
  debouncedCourseSearch(event.target.value);
});

loadInitialCompareCourses();
renderCompare();