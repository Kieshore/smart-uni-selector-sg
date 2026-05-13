let interests = [];

const state = {
  modalTarget: null,
  selectedInterests: getInterestState(),
};

async function loadUserProfile() {
  try {
    const json = await fetchJson(`/users/${CURRENT_USER_ID}/profile`);
    const user = json.data;
    const profile = user.academic_profiles?.[0];

    document.getElementById("fullName").value = user.full_name || "";
    document.getElementById("email").value = user.email || "";
    document.getElementById("school").value = profile?.institution_name || "";
    document.getElementById("course").value = profile?.diploma_name || "";
    document.getElementById("gradYear").value = profile?.graduation_year || "";

    const qualification = String(profile?.qualification_type || "").toLowerCase();
    const isAlevel =
      qualification.includes("a-level") ||
      qualification.includes("a level") ||
      qualification.includes("jc");

    document.getElementById("qualification").value = isAlevel ? "A Level" : "Diploma";
    updateScoreLabel();

    document.getElementById("academicScore").value = isAlevel
      ? profile?.rank_points || profile?.uas_70 || ""
      : profile?.projected_gpa || profile?.current_gpa || "";
  } catch (error) {
    console.warn("Unable to load user profile:", error.message);
  }
}

async function loadInterests() {
  try {
    const json = await fetchJson("/interest-groups");
    interests = json.data
      .map(item => item.interest_name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    interests = [];
    console.warn("Unable to load interests:", error.message);
  }
}

function updateScoreLabel() {
  const qualification = document.getElementById("qualification").value;
  document.getElementById("scoreLabel").textContent =
    qualification === "A Level" ? "RP" : "GPA";
}

function persistInterests() {
  saveInterestState(state.selectedInterests);
}

function makePill(name, onRemove) {
  const pill = document.createElement("span");
  pill.className = "pill";
  pill.innerHTML = `<span>${name}</span><button type="button">×</button>`;
  pill.querySelector("button").addEventListener("click", onRemove);
  return pill;
}

function renderTierLists() {
  document.querySelectorAll(".tier-list").forEach(list => {
    const kind = list.dataset.kind;

    list.querySelectorAll(".tier-row").forEach(row => {
      const tier = row.dataset.tier;
      const zone = row.querySelector(".tier-dropzone");

      zone.innerHTML = "";

      state.selectedInterests[kind][tier].forEach(name => {
        zone.appendChild(
          makePill(name, () => {
            state.selectedInterests[kind][tier] =
              state.selectedInterests[kind][tier].filter(item => item !== name);

            persistInterests();
            renderTierLists();
          })
        );
      });
    });
  });
}

function openInterestModal(button) {
  const row = button.closest(".tier-row");
  const list = button.closest(".tier-list");

  state.modalTarget = {
    kind: list.dataset.kind,
    tier: row.dataset.tier,
  };

  document.getElementById("modalContext").textContent =
    `${state.modalTarget.kind === "wanted" ? "Favoured" : "Unfavoured"} · ${state.modalTarget.tier}`;

  document.getElementById("interestSearch").value = "";
  document.getElementById("interestModal").classList.add("active");

  renderInterestChoices();
}

function closeInterestModal() {
  document.getElementById("interestModal").classList.remove("active");
}

function renderInterestChoices() {
  const query = document.getElementById("interestSearch").value.trim().toLowerCase();
  const results = document.getElementById("interestResults");

  const matches = interests.filter(item => item.toLowerCase().includes(query));

  results.innerHTML = "";

  if (!matches.length) {
    results.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No interests found.</div>`;
    return;
  }

  matches.forEach(item => {
    const btn = document.createElement("button");
    btn.className = "interest-choice";
    btn.textContent = item;

    btn.addEventListener("click", () => {
      const { kind, tier } = state.modalTarget;
      const current = state.selectedInterests[kind][tier];

      const alreadyUsed = Object.values(state.selectedInterests.wanted)
        .flat()
        .concat(Object.values(state.selectedInterests.unwanted).flat())
        .includes(item);

      if (!alreadyUsed && !current.includes(item)) {
        current.push(item);
      }

      persistInterests();
      closeInterestModal();
      renderTierLists();
    });

    results.appendChild(btn);
  });
}

document.getElementById("qualification").addEventListener("change", updateScoreLabel);

document.querySelectorAll(".plus-btn-tier").forEach(button => {
  button.addEventListener("click", () => openInterestModal(button));
});

document.getElementById("closeModal").addEventListener("click", closeInterestModal);

document.getElementById("interestModal").addEventListener("click", event => {
  if (event.target.id === "interestModal") closeInterestModal();
});

document.getElementById("interestSearch").addEventListener("input", renderInterestChoices);

async function initProfile() {
  renderTierLists();
  await loadUserProfile();
  await loadInterests();
}

initProfile();