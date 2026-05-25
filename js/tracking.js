/* ============================================
   SWIFTTGLOBAL LOGISTICS — TRACKING ENGINE
   TrackingMore API v4 Integration
   ============================================ */

/* ---------- CONFIG ----------
   IMPORTANT: Replace the value below with
   your actual TrackingMore API key once
   you have it from your dashboard.
   ----------------------------------------- */
const TRACKING_CONFIG = {
  apiKey: "tmy9kzwf-7awg-kcfp-uhb5-8143f5lsepel", // ← Replace this
  apiBase: "https://api.trackingmore.com/v4/trackings",
};

/* ---------- STATUS MAP ----------
   Maps TrackingMore status codes to
   human-readable labels, colors, icons,
   and progress step numbers.
   ----------------------------------------- */
const STATUS_MAP = {
  pending: {
    label: "Pending",
    color: "#A0AEC0",
    bg: "rgba(160,174,192,0.12)",
    icon: "fa-clock",
    step: 1,
  },
  pickup: {
    label: "Picked Up",
    color: "#E8A317",
    bg: "rgba(232,163,23,0.12)",
    icon: "fa-box",
    step: 1,
  },
  in_transit: {
    label: "In Transit",
    color: "#3182CE",
    bg: "rgba(49,130,206,0.12)",
    icon: "fa-truck",
    step: 3,
  },
  out_for_delivery: {
    label: "Out for Delivery",
    color: "#805AD5",
    bg: "rgba(128,90,213,0.12)",
    icon: "fa-truck-fast",
    step: 4,
  },
  delivered: {
    label: "Delivered",
    color: "#38A169",
    bg: "rgba(56,161,105,0.12)",
    icon: "fa-circle-check",
    step: 5,
  },
  attempt_fail: {
    label: "Delivery Failed",
    color: "#E53E3E",
    bg: "rgba(229,62,62,0.12)",
    icon: "fa-triangle-exclamation",
    step: 4,
  },
  exception: {
    label: "Exception",
    color: "#E53E3E",
    bg: "rgba(229,62,62,0.12)",
    icon: "fa-circle-exclamation",
    step: 3,
  },
  expired: {
    label: "Expired",
    color: "#718096",
    bg: "rgba(113,128,150,0.12)",
    icon: "fa-calendar-xmark",
    step: 1,
  },
  notfound: {
    label: "Not Found",
    color: "#718096",
    bg: "rgba(113,128,150,0.12)",
    icon: "fa-magnifying-glass",
    step: 0,
  },
};

/* ---------- HELPERS ---------- */

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getStatusInfo(statusCode) {
  return STATUS_MAP[statusCode] || STATUS_MAP["in_transit"];
}

function sanitize(str) {
  if (!str) return "—";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- UI STATE HELPERS ---------- */

function showState(state) {
  document.getElementById("trackingLoading").style.display = "none";
  document.getElementById("trackingError").style.display = "none";
  document.getElementById("trackingSuccess").style.display = "none";

  if (state === "loading") {
    document.getElementById("trackingLoading").style.display = "flex";
  } else if (state === "error") {
    document.getElementById("trackingError").style.display = "flex";
  } else if (state === "success") {
    document.getElementById("trackingSuccess").style.display = "block";
  }
}

function resetTracking() {
  showState("none");
  document.getElementById("trackingInput").value = "";
  document.getElementById("trackingInput").focus();
  document.getElementById("clearBtn").style.display = "none";
}

function trackAnother() {
  const num = document.getElementById("trackAnotherInput").value.trim();
  if (num) {
    document.getElementById("trackingInput").value = num;
    trackParcel();
    window.scrollTo({
      top: document.querySelector(".tracking-page-section").offsetTop - 100,
      behavior: "smooth",
    });
  }
}

/* ---------- PROGRESS STEPS ---------- */

function updateProgressSteps(stepNumber) {
  const steps = document.querySelectorAll(".tp-step");
  const lines = document.querySelectorAll(".tp-step-line");

  steps.forEach((step, i) => {
    step.classList.remove("active", "completed");
    const sNum = parseInt(step.getAttribute("data-step"));
    if (sNum < stepNumber) step.classList.add("completed");
    if (sNum === stepNumber) step.classList.add("active");
  });

  lines.forEach((line, i) => {
    line.classList.remove("filled");
    if (i + 2 <= stepNumber) line.classList.add("filled");
  });
}

/* ---------- RENDER TIMELINE ---------- */

function renderTimeline(events) {
  const container = document.getElementById("trackingTimeline");
  const countEl = document.getElementById("eventCount");
  container.innerHTML = "";

  if (!events || events.length === 0) {
    container.innerHTML =
      '<p class="no-events">No tracking events available yet.</p>';
    countEl.textContent = "0 events";
    return;
  }

  countEl.textContent = `${events.length} event${events.length > 1 ? "s" : ""}`;

  events.forEach((event, index) => {
    const isFirst = index === 0;
    const statusInfo = getStatusInfo(event.status || "in_transit");

    const item = document.createElement("div");
    item.className = `timeline-event${isFirst ? " timeline-event--latest" : ""}`;
    item.innerHTML = `
      <div class="timeline-dot" style="background:${isFirst ? statusInfo.color : "var(--border)"};border-color:${statusInfo.color};">
        ${isFirst ? `<i class="fa ${statusInfo.icon}" style="color:#fff;font-size:0.6rem;"></i>` : ""}
      </div>
      <div class="timeline-connector"></div>
      <div class="timeline-content">
        <div class="timeline-content-top">
          <span class="timeline-status-label" style="color:${statusInfo.color};background:${statusInfo.bg};">
            ${sanitize(event.status_name || statusInfo.label)}
          </span>
          <span class="timeline-date">${formatDate(event.time)}</span>
        </div>
        <p class="timeline-detail">${sanitize(event.description || event.details || "Status updated")}</p>
        ${event.location ? `<span class="timeline-location"><i class="fa fa-location-dot"></i> ${sanitize(event.location)}</span>` : ""}
      </div>
    `;
    container.appendChild(item);
  });
}

/* ---------- RENDER SUMMARY ---------- */

function renderSummary(data, trackingNum) {
  const statusInfo = getStatusInfo(data.delivery_status || "in_transit");

  // Basic info
  document.getElementById("resultTrackingNum").textContent = trackingNum;
  document.getElementById("resultCarrier").textContent =
    data.courier_name || data.courier_code || "—";
  document.getElementById("resultOrigin").textContent =
    data.origin_country || data.origin_info?.weblink || "—";
  document.getElementById("resultDestination").textContent =
    data.destination_country || "—";
  document.getElementById("resultETA").textContent =
    formatDateShort(
      data.scheduled_delivery_date || data.estimated_delivery_time,
    ) || "—";

  // Status badge
  const badge = document.getElementById("resultStatusBadge");
  badge.style.background = statusInfo.bg;
  badge.style.color = statusInfo.color;
  badge.style.border = `1.5px solid ${statusInfo.color}`;
  document.getElementById("resultStatusIcon").className =
    `fa ${statusInfo.icon}`;
  document.getElementById("resultStatusText").textContent = statusInfo.label;

  // Last updated
  const latestEvent =
    data.origin_info?.trackinfo?.[0] || data.destination_info?.trackinfo?.[0];
  if (latestEvent) {
    document.getElementById("resultLastUpdate").textContent =
      `Last update: ${formatDate(latestEvent.time)}`;
  }

  // Package details
  document.getElementById("pkgWeight").textContent = data.weight
    ? `${data.weight} kg`
    : "—";
  document.getElementById("pkgDimensions").textContent = data.dimension
    ? data.dimension
    : "—";
  document.getElementById("pkgService").textContent =
    data.service_type || data.shipping_type || "—";
  document.getElementById("pkgSigned").textContent = data.signed_by || "—";

  // Progress steps
  updateProgressSteps(statusInfo.step);
}

/* ---------- MERGE EVENTS ---------- */

function mergeEvents(data) {
  let events = [];

  if (data.origin_info?.trackinfo?.length) {
    events = events.concat(
      data.origin_info.trackinfo.map((e) => ({
        ...e,
        location: e.checkpoint_location || data.origin_country || "",
      })),
    );
  }

  if (data.destination_info?.trackinfo?.length) {
    events = events.concat(
      data.destination_info.trackinfo.map((e) => ({
        ...e,
        location: e.checkpoint_location || data.destination_country || "",
      })),
    );
  }

  // Deduplicate by time+description and sort newest first
  const seen = new Set();
  events = events.filter((e) => {
    const key = `${e.time}|${e.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  events.sort((a, b) => new Date(b.time) - new Date(a.time));
  return events;
}

/* ---------- MAIN TRACK FUNCTION ---------- */

async function trackParcel() {
  const input = document.getElementById("trackingInput");
  const trackingNum = input.value.trim().replace(/\s+/g, "");

  // Validate input
  if (!trackingNum) {
    input.style.borderColor = "var(--error)";
    input.focus();
    setTimeout(() => (input.style.borderColor = ""), 2000);
    return;
  }

  if (trackingNum.length < 4) {
    input.style.borderColor = "var(--error)";
    document.getElementById("trackingErrorTitle").textContent =
      "Invalid Tracking Number";
    document.getElementById("trackingErrorMsg").textContent =
      "Please enter a valid tracking number (minimum 4 characters).";
    showState("error");
    return;
  }

  // Check API key is set
  if (TRACKING_CONFIG.apiKey === "YOUR_TRACKINGMORE_API_KEY") {
    document.getElementById("trackingErrorTitle").textContent =
      "API Key Not Configured";
    document.getElementById("trackingErrorMsg").textContent =
      "Please open js/tracking.js and replace YOUR_TRACKINGMORE_API_KEY with your actual TrackingMore API key.";
    showState("error");
    return;
  }

  // Reset UI & show loading
  input.style.borderColor = "";
  showState("loading");

  // Scroll to results smoothly
  document
    .getElementById("trackingResults")
    .scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    /* ----- STEP 1: Create tracking ----- */
    const createRes = await fetch(`${TRACKING_CONFIG.apiBase}/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Tracking-Api-Key": TRACKING_CONFIG.apiKey,
      },
      body: JSON.stringify({ tracking_number: trackingNum }),
    });

    if (!createRes.ok && createRes.status !== 400) {
      throw new Error(`API error: ${createRes.status}`);
    }

    /* ----- STEP 2: Fetch tracking data ----- */
    const getRes = await fetch(
      `${TRACKING_CONFIG.apiBase}/get?tracking_numbers=${encodeURIComponent(trackingNum)}&created_at_min=2020-01-01`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Tracking-Api-Key": TRACKING_CONFIG.apiKey,
        },
      },
    );

    if (!getRes.ok) {
      throw new Error(`Fetch error: ${getRes.status}`);
    }

    const json = await getRes.json();

    /* ----- STEP 3: Parse response ----- */
    const items = json?.data?.items || json?.data || [];

    if (!items || items.length === 0) {
      document.getElementById("trackingErrorTitle").textContent =
        "No Results Found";
      document.getElementById("trackingErrorMsg").textContent =
        `We couldn't find tracking information for "${trackingNum}". The number may be invalid or not yet registered with any carrier. Please check and try again.`;
      showState("error");
      return;
    }

    const trackData = items[0];

    /* ----- STEP 4: Render results ----- */
    renderSummary(trackData, trackingNum);
    renderTimeline(mergeEvents(trackData));
    showState("success");
  } catch (err) {
    console.error("Tracking error:", err);

    if (
      err.message.includes("Failed to fetch") ||
      err.message.includes("NetworkError")
    ) {
      document.getElementById("trackingErrorTitle").textContent =
        "Connection Error";
      document.getElementById("trackingErrorMsg").textContent =
        "Unable to reach the tracking service. Please check your internet connection and try again.";
    } else {
      document.getElementById("trackingErrorTitle").textContent =
        "Something Went Wrong";
      document.getElementById("trackingErrorMsg").textContent =
        "An unexpected error occurred. Please try again in a moment. If the problem persists, contact our support team.";
    }
    showState("error");
  }
}

/* ---------- CLEAR BUTTON ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("trackingInput");
  const clearBtn = document.getElementById("clearBtn");

  if (input && clearBtn) {
    input.addEventListener("input", () => {
      clearBtn.style.display = input.value ? "flex" : "none";
    });

    clearBtn.addEventListener("click", () => {
      input.value = "";
      clearBtn.style.display = "none";
      input.focus();
      showState("none");
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") trackParcel();
    });
  }

  /* ---------- AUTO-TRACK FROM URL ----------
     When user clicks "Track Now" from the
     homepage quick tracking strip, the
     number is passed in the URL as ?number=
     This reads it and auto-triggers tracking.
     ----------------------------------------- */
  const urlParams = new URLSearchParams(window.location.search);
  const numFromUrl = urlParams.get("number");

  if (numFromUrl) {
    const inputEl = document.getElementById("trackingInput");
    if (inputEl) {
      inputEl.value = numFromUrl;
      if (clearBtn) clearBtn.style.display = "flex";
      setTimeout(() => trackParcel(), 600);
    }
  }
});
