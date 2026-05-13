let apiPayload = null;
let allCourses = [];
let latestCourseRequestId = 0;
let courseAbortController = null;

let compareMode = false;
let selectedCompareCourses = new Map();
let userAcademicValue = 0;
let userQualificationType = "";

function getCleanFinderState() {
  const saved = getFinderState();

  const priority =
    saved.priority &&
    typeof saved.priority === "object"
      ? {
          1: Array.isArray(saved.priority["1"]) ? saved.priority["1"] : [],
          2: Array.isArray(saved.priority["2"]) ? saved.priority["2"] : [],
          3: Array.isArray(saved.priority["3"]) ? saved.priority["3"] : [],
          4: Array.isArray(saved.priority["4"]) ? saved.priority["4"] : [],
        }
      : structuredClone(DEFAULT_FINDER_STATE.priority);

  const allUsed = Object.values(priority).flat();
  const validOptions = ["interest", "prestige", "salary", "employability"];
  const hasValidPriority = allUsed.every(option => validOptions.includes(option));

  return {
    ...DEFAULT_FINDER_STATE,
    ...saved,
    priority: hasValidPriority ? priority : structuredClone(DEFAULT_FINDER_STATE.priority),
  };
}

const savedFinderState = getCleanFinderState();

const state = {
  activeUni: savedFinderState.activeUni || "All",
  isLoadingCourses: false,
  apiError: null,
  draggedOption: null,
  priority: savedFinderState.priority,
  selectedInterests: getInterestState(),
};

function persistFinderState() {
  const selectedUniversities = [...document.getElementById("preferredUniversities").selectedOptions]
    .map(option => option.value)
    .filter(Boolean);

  saveFinderState({
    activeUni: state.activeUni,
    gpaBoost: document.getElementById("gpaBoost").value,
    selectedUniversities,
    onlyWanted: document.getElementById("onlyWanted").checked,
    excludeUnwanted: document.getElementById("excludeUnwanted").checked,
    courseKeyword: document.getElementById("courseKeyword").value,
    priority: state.priority,
  });
}

function applySavedFinderStateToInputs() {
  document.getElementById("gpaBoost").value = savedFinderState.gpaBoost ?? "0.17";
  document.getElementById("onlyWanted").checked = Boolean(savedFinderState.onlyWanted);
  document.getElementById("excludeUnwanted").checked = Boolean(savedFinderState.excludeUnwanted);
  document.getElementById("courseKeyword").value = savedFinderState.courseKeyword || "";

  const savedUnis = savedFinderState.selectedUniversities || [];

  [...document.getElementById("preferredUniversities").options].forEach(option => {
    option.selected = savedUnis.includes(option.value);
  });
}

function csv(values) {
  return values.map(value => String(value).trim()).filter(Boolean).join(",");
}

function getPriorityQueryParams(params) {
  Object.entries(state.priority).forEach(([priorityNumber, metrics]) => {
    if (!Array.isArray(metrics)) return;

    metrics.forEach(metric => {
      const normalizedMetric = metric === "interests" ? "interest" : metric;
      params.set(`${normalizedMetric}_priority`, priorityNumber);
    });
  });
}

function getSelectedUniversityCsv() {
  return [...document.getElementById("preferredUniversities").selectedOptions]
    .map(option => option.value)
    .filter(Boolean)
    .join(",");
}

function buildRecommendationQuery() {
  const params = new URLSearchParams();

  state.selectedInterests = getInterestState();

  params.set("userId", CURRENT_USER_ID);
  params.set("difference", document.getElementById("gpaBoost").value || "0");
  params.set("exclude_unwanted_interests", document.getElementById("excludeUnwanted").checked ? "true" : "false");
  params.set("only_wanted_interests", document.getElementById("onlyWanted").checked ? "true" : "false");

  const hasPrestige = Object.values(state.priority).flat().includes("prestige");
  const selectedUnis = getSelectedUniversityCsv();

  if (selectedUnis && !hasPrestige) {
    params.set("uni_code", selectedUnis);
  }

  params.set("high_interests", csv(state.selectedInterests.wanted.high));
  params.set("medium_interests", csv(state.selectedInterests.wanted.medium));
  params.set("low_interests", csv(state.selectedInterests.wanted.low));

  params.set("high_unwanted_interests", csv(state.selectedInterests.unwanted.high));
  params.set("medium_unwanted_interests", csv(state.selectedInterests.unwanted.medium));
  params.set("low_unwanted_interests", csv(state.selectedInterests.unwanted.low));

  getPriorityQueryParams(params);

  return params;
}

function flattenCoursesFromPayload(payload) {
  const results = payload?.data?.results || [];
  return results.flatMap(result => Array.isArray(result.courses) ? result.courses : []);
}

async function fetchRankedCourses() {
  const requestId = ++latestCourseRequestId;

  if (courseAbortController) {
    courseAbortController.abort();
  }

  courseAbortController = new AbortController();

  state.isLoadingCourses = true;
  state.apiError = null;
  renderCourses();

  try {
    persistFinderState();

    const params = buildRecommendationQuery();

    console.log("Fetching courses with:", params.toString());

    const response = await fetch(
      `/course-priority-recommendation/eligible-ranked-courses?${params.toString()}`,
      { signal: courseAbortController.signal }
    );

    const json = await response.json();

    if (requestId !== latestCourseRequestId) return;

    if (!response.ok) {
      throw new Error(json.error || json.message || "Failed to fetch recommendations");
    }

    apiPayload = json;
    allCourses = flattenCoursesFromPayload(json);

    renderUniversityFilters();
    renderCourses();
  } catch (error) {
    if (error.name === "AbortError") return;
    if (requestId !== latestCourseRequestId) return;

    console.error("Course fetch failed:", error);

    apiPayload = null;
    allCourses = [];
    state.apiError = error.message;

    renderUniversityFilters();
    renderCourses();
  } finally {
    if (requestId === latestCourseRequestId) {
      state.isLoadingCourses = false;
      renderCourses();
    }
  }
}

const debouncedFetchRankedCourses = debounce(fetchRankedCourses, 450);

function createPriorityPill(option) {
  const span = document.createElement("span");
  span.className = "pill priority-pill";
  span.draggable = true;
  span.dataset.option = option;
  span.textContent = option[0].toUpperCase() + option.slice(1);

  attachPriorityDrag(span);

  return span;
}

function attachPriorityDrag(element) {
  element.addEventListener("dragstart", () => {
    state.draggedOption = element.dataset.option;
  });
}

function renderPriority() {
  const allPriorityOptions = ["interest", "prestige", "salary", "employability"];

  document.querySelectorAll(".priority-zone").forEach(zone => {
    const priorityNumber = zone.dataset.priority;

    if (!Array.isArray(state.priority[priorityNumber])) {
      state.priority[priorityNumber] = [];
    }

    zone.innerHTML = "";

    state.priority[priorityNumber].forEach(option => {
      zone.appendChild(createPriorityPill(option));
    });
  });

  const priorityBank = document.getElementById("priorityBank");
  priorityBank.innerHTML = "";

  const usedOptions = Object.values(state.priority).flat();

  allPriorityOptions.forEach(option => {
    if (!usedOptions.includes(option)) {
      priorityBank.appendChild(createPriorityPill(option));
    }
  });
}

function updatePrestigeLock() {
  const hasPrestige = Object.values(state.priority).flat().includes("prestige");

  document.getElementById("preferredUniField").classList.toggle("disabled-field", hasPrestige);
  document.getElementById("prestigeError").classList.toggle("active", hasPrestige);

  if (hasPrestige) {
    [...document.getElementById("preferredUniversities").options].forEach(option => {
      option.selected = false;
    });
  }
}

function setupPriorityDragDrop() {
  document.querySelectorAll(".priority-zone, #priorityBank").forEach(zone => {
    zone.addEventListener("dragover", event => {
      event.preventDefault();
      zone.classList.add("drag-over");
    });

    zone.addEventListener("dragleave", () => {
      zone.classList.remove("drag-over");
    });

    zone.addEventListener("drop", event => {
      event.preventDefault();
      zone.classList.remove("drag-over");

      const option = state.draggedOption;
      if (!option) return;

      Object.keys(state.priority).forEach(key => {
        state.priority[key] = state.priority[key].filter(item => item !== option);
      });

      if (zone.id !== "priorityBank") {
        const priority = zone.dataset.priority;
        state.priority[priority].push(option);
      }

      state.draggedOption = null;

      renderPriority();
      updatePrestigeLock();
      fetchRankedCourses();
    });
  });
}

function renderUniversityFilters() {
  const universities = ["All", ...new Set(allCourses.map(course => course.university_code).filter(Boolean))];
  const wrapper = document.getElementById("universityFilters");

  wrapper.innerHTML = "";

  universities.forEach(uni => {
    const button = document.createElement("button");
    button.className = `filter-chip ${state.activeUni === uni ? "active" : ""}`;
    button.textContent = uni;

    button.addEventListener("click", () => {
      state.activeUni = uni;
      persistFinderState();
      renderUniversityFilters();
      renderCourses();
    });

    wrapper.appendChild(button);
  });
}

function getScore(course) {
  const score = course.total_score ?? course.priority_score;
  return score === null || score === undefined ? "—" : `${Number(score).toFixed(1)}/100`;
}

function renderCourses() {
  const list = document.getElementById("courseList");
  const keyword = document.getElementById("courseKeyword").value.trim().toLowerCase();

  if (state.isLoadingCourses) {
    list.innerHTML = `<div class="empty-state">Loading ranked eligible courses...</div>`;
    return;
  }

  if (state.apiError) {
    list.innerHTML = `<div class="empty-state" style="color: var(--danger);">${state.apiError}</div>`;
    return;
  }

  const filtered = allCourses.filter(course => {
    const uniMatch = state.activeUni === "All" || course.university_code === state.activeUni;
    const keywordMatch = !keyword || String(course.course_name || "").toLowerCase().includes(keyword);
    return uniMatch && keywordMatch;
  });

  list.innerHTML = "";

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">No eligible courses match the current filters.</div>`;
    return;
  }

  filtered.forEach((course, index) => {
    const card = document.createElement("article");
    card.className = "course-card";

    card.innerHTML = `
      <label class="compare-checkbox">
        <input type="checkbox" class="course-compare-input" value="${course.course_id}" />
      </label>

      <div class="rank">${course.rank_number || index + 1}</div>

      <div class="course-main">
        <div>
          <div class="course-name">${course.course_name}</div>
          <div class="course-meta">${course.university_code || "—"} · ${valueOrDash(course.matched_via)}</div>
        </div>

        <div>
          <div><strong>Median gross salary:</strong> ${moneyOrDash(course.ges?.gross_monthly_median)}</div>
          <div><strong>Employability:</strong> ${valueOrDash(course.ges?.employment_rate_overall, "%")}</div>
          <div class="course-meta">Cutoff gap: ${valueOrDash(course.cutoff_gap)} · Intake: ${valueOrDash(course.intake_size)}</div>
        </div>
      </div>

      <div class="score-box">
        <div class="score">${getScore(course)}</div>
        <button class="read-more">Read more</button>
      </div>

      <div class="details">
        <strong>Admissions</strong><br />
        Min GPA: ${valueOrDash(course.min_gpa)} · 10th percentile RP: ${valueOrDash(course.tenth_percentile_rp)} · UAS 70: ${valueOrDash(course.tenth_percentile_uas_70)}<br />
        Year recorded: ${valueOrDash(course.year_recorded)} · GES source year: ${valueOrDash(course.ges?.source_year)}<br /><br />

        <strong>Interest fit</strong><br />
        Interest score: ${valueOrDash(course.interest_fit?.score)} · Wanted score: ${valueOrDash(course.interest_fit?.wanted_score)} · Unwanted penalty: ${valueOrDash(course.interest_fit?.unwanted_penalty)}
      </div>
    `;

    card.querySelector(".read-more").addEventListener("click", () => {
      card.querySelector(".details").classList.toggle("active");
    });

    attachCompareCheckbox(card, course);
    list.appendChild(card);
  });
}

function attachCompareCheckbox(card, course) {
  const input = card.querySelector(".course-compare-input");

input.checked = selectedCompareCourses.has(String(course.course_id));
card.classList.toggle("compare-selected", input.checked);

input.addEventListener("change", () => {
  if (input.checked) {
    selectedCompareCourses.set(String(course.course_id), course);
    card.classList.add("compare-selected");
  } else {
    selectedCompareCourses.delete(String(course.course_id));
    card.classList.remove("compare-selected");
  }

  updateCompareButton();
});
}

function updateCompareButton() {
  const button = document.getElementById("goCompareBtn");
  const count = selectedCompareCourses.size;

  button.disabled = count < 2;
  button.classList.toggle("active", count >= 2);
  button.textContent = count >= 2
    ? `Compare ${Math.min(count, 2)} selected courses`
    : "Select at least 2 courses";
}

function setupCompareMode() {
  document.getElementById("toggleCompareMode").addEventListener("click", () => {
    compareMode = !compareMode;
    document.body.classList.toggle("compare-mode", compareMode);

    if (!compareMode) {
      selectedCompareCourses.clear();
      document.querySelectorAll(".course-compare-input").forEach(input => {
        input.checked = false;
      });
    }

    updateCompareButton();
  });

  document.getElementById("goCompareBtn").addEventListener("click", () => {
    const selected = Array.from(selectedCompareCourses.values()).slice(0, 2);
    saveCompareCourses(selected);
    window.location.href = "/compare.html";
  });
}

function setupFilters() {
  document.getElementById("gpaBoost").addEventListener("input", () => {
    updateBoostedAcademicScore();
    persistFinderState();
    debouncedFetchRankedCourses();
  });

  document.getElementById("preferredUniversities").addEventListener("change", fetchRankedCourses);
  document.getElementById("onlyWanted").addEventListener("change", fetchRankedCourses);
  document.getElementById("excludeUnwanted").addEventListener("change", fetchRankedCourses);

  document.getElementById("courseKeyword").addEventListener("input", () => {
    persistFinderState();
    renderCourses();
  });
}

async function loadUserBoostLabel() {
  try {
    const json = await fetchJson(`/users/${CURRENT_USER_ID}/profile`);
    const profile = json.data?.academic_profiles?.[0];

    const qualification = String(profile?.qualification_type || "").trim().toLowerCase();
    userQualificationType = qualification;

    const isAlevel =
      qualification.includes("a-level") ||
      qualification.includes("a level") ||
      qualification.includes("jc") ||
      qualification.includes("junior college");

    const isDiploma =
      qualification.includes("poly") ||
      qualification.includes("polytechnic") ||
      qualification.includes("diploma");

    const boostLabel = document.getElementById("boostLabel");
    const boostInput = document.getElementById("gpaBoost");
    const academicScoreLabel = document.getElementById("academicScoreLabel");

    if (isAlevel) {
      userAcademicValue = Number(profile?.rank_points ?? profile?.uas_70 ?? 0);

      boostLabel.textContent = "RP boost";
      academicScoreLabel.textContent = "RP after boost";
      boostInput.step = "0.1";
      boostInput.placeholder = "e.g. 2.5";
    } else if (isDiploma) {
      userAcademicValue = Number(profile?.projected_gpa ?? profile?.current_gpa ?? 0);

      boostLabel.textContent = "GPA boost";
      academicScoreLabel.textContent = "GPA after boost";
      boostInput.step = "0.01";
      boostInput.placeholder = "e.g. 0.15";
    } else {
      userAcademicValue = 0;

      boostLabel.textContent = "Academic boost";
      academicScoreLabel.textContent = "Academic score after boost";
      boostInput.step = "0.01";
      boostInput.placeholder = "Enter boost amount";
    }

    updateBoostedAcademicScore();
  } catch (error) {
    console.warn("Unable to load boost label:", error.message);

    document.getElementById("boostLabel").textContent = "Academic boost";
    document.getElementById("academicScoreLabel").textContent = "Academic score after boost";
  }
}

function updateBoostedAcademicScore() {
  const boostInput = document.getElementById("gpaBoost");
  const academicScoreInput = document.getElementById("academicScore");

  if (!academicScoreInput) return;

  const boostValue = Number(boostInput.value || 0);
  const boostedValue = userAcademicValue + boostValue;

  const isAlevel =
    userQualificationType.includes("a-level") ||
    userQualificationType.includes("a level") ||
    userQualificationType.includes("jc") ||
    userQualificationType.includes("junior college");

  academicScoreInput.value = isAlevel
    ? boostedValue.toFixed(1)
    : boostedValue.toFixed(2);
}

async function initCourseFinder() {
  applySavedFinderStateToInputs();

  renderPriority();
  updatePrestigeLock();
  setupPriorityDragDrop();
  setupFilters();
  setupCompareMode();
  renderUniversityFilters();
  renderCourses();

  await loadUserBoostLabel();
  await fetchRankedCourses();
}

initCourseFinder();