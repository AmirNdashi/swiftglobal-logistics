/* ============================================
   SWIFTGLOBAL LOGISTICS — TRACKING ENGINE
   Firebase Firestore Integration
   SGT-* numbers now read from Firestore
   ============================================ */

import { getShipmentByTracking } from "../admin/firebase.js";

/* ---------- TRACKINGMORE CONFIG ---------- */
const TRACKING_CONFIG = {
  apiKey:  "tmy9kzwf-7awg-kcfp-uhb5-8143f5lsepel",
  apiBase: "https://api.trackingmore.com/v4/trackings",
};

/* ---------- STATUS MAPS ---------- */
const STATUS_MAP = {
  pending:          { label: "Pending",          color: "#A0AEC0", bg: "rgba(160,174,192,0.12)", icon: "fa-clock",                step: 1 },
  pickup:           { label: "Picked Up",         color: "#E8A317", bg: "rgba(232,163,23,0.12)",  icon: "fa-box",                  step: 1 },
  in_transit:       { label: "In Transit",        color: "#3182CE", bg: "rgba(49,130,206,0.12)",  icon: "fa-truck",                step: 3 },
  out_for_delivery: { label: "Out for Delivery",  color: "#805AD5", bg: "rgba(128,90,213,0.12)",  icon: "fa-truck-fast",           step: 4 },
  delivered:        { label: "Delivered",         color: "#38A169", bg: "rgba(56,161,105,0.12)",  icon: "fa-circle-check",         step: 5 },
  attempt_fail:     { label: "Delivery Failed",   color: "#E53E3E", bg: "rgba(229,62,62,0.12)",   icon: "fa-triangle-exclamation", step: 4 },
  exception:        { label: "Exception",         color: "#E53E3E", bg: "rgba(229,62,62,0.12)",   icon: "fa-circle-exclamation",   step: 3 },
  expired:          { label: "Expired",           color: "#718096", bg: "rgba(113,128,150,0.12)", icon: "fa-calendar-xmark",       step: 1 },
  notfound:         { label: "Not Found",         color: "#718096", bg: "rgba(113,128,150,0.12)", icon: "fa-magnifying-glass",     step: 0 },
};

const CUSTOM_STATUS_MAP = {
  pending:          { label: "Pending",           color: "#718096", bg: "rgba(160,174,192,0.12)", icon: "fa-clock",                step: 1 },
  pickup:           { label: "Picked Up",          color: "#E8A317", bg: "rgba(232,163,23,0.12)",  icon: "fa-box",                  step: 1 },
  in_transit:       { label: "In Transit",         color: "#3182CE", bg: "rgba(49,130,206,0.12)",  icon: "fa-truck",                step: 3 },
  customs:          { label: "Customs Clearance",  color: "#805AD5", bg: "rgba(128,90,213,0.12)",  icon: "fa-file-contract",        step: 3 },
  out_for_delivery: { label: "Out for Delivery",   color: "#38A169", bg: "rgba(56,161,105,0.12)",  icon: "fa-truck-fast",           step: 4 },
  delivered:        { label: "Delivered",          color: "#22543D", bg: "rgba(56,161,105,0.2)",   icon: "fa-circle-check",         step: 5 },
  exception:        { label: "Exception",          color: "#E53E3E", bg: "rgba(229,62,62,0.12)",   icon: "fa-triangle-exclamation", step: 3 },
};

/* ---------- HELPERS ---------- */
function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = dateStr?.toDate ? dateStr.toDate() : new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(dateStr) {
  if (!dateStr) return "—";
  const parts = String(dateStr).split("-");
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    if (!isNaN(d)) return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  const d = new Date(dateStr);
  return isNaN(d) ? dateStr : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function getStatusInfo(code) {
  return STATUS_MAP[code] || STATUS_MAP["in_transit"];
}

function sanitize(str) {
  if (!str) return "—";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- UI STATE ---------- */
function showState(state) {
  ["trackingLoading", "trackingError", "trackingSuccess"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  if (state === "loading") document.getElementById("trackingLoading").style.display = "flex";
  if (state === "error")   document.getElementById("trackingError").style.display   = "flex";
  if (state === "success") document.getElementById("trackingSuccess").style.display = "block";
}

function resetTracking() {
  showState("none");
  const inp = document.getElementById("trackingInput");
  if (inp) { inp.value = ""; inp.focus(); }
  const cb = document.getElementById("clearBtn");
  if (cb) cb.style.display = "none";
}
window.resetTracking = resetTracking;

function trackAnother() {
  const num = document.getElementById("trackAnotherInput")?.value.trim();
  if (num) {
    document.getElementById("trackingInput").value = num;
    trackParcel();
    window.scrollTo({ top: document.querySelector(".tracking-page-section")?.offsetTop - 100, behavior: "smooth" });
  }
}
window.trackAnother = trackAnother;

/* ---------- PROGRESS STEPS ---------- */
function updateProgressSteps(stepNumber) {
  document.querySelectorAll(".tp-step").forEach(step => {
    step.classList.remove("active", "completed");
    const n = parseInt(step.getAttribute("data-step"));
    if (n < stepNumber)  step.classList.add("completed");
    if (n === stepNumber) step.classList.add("active");
  });
  document.querySelectorAll(".tp-step-line").forEach((line, i) => {
    line.classList.toggle("filled", i + 2 <= stepNumber);
  });
}

/* ---------- RENDER TIMELINE (TrackingMore) ---------- */
function renderTimeline(events) {
  const container = document.getElementById("trackingTimeline");
  const countEl   = document.getElementById("eventCount");
  container.innerHTML = "";

  if (!events?.length) {
    container.innerHTML = '<p class="no-events">No tracking events available yet.</p>';
    countEl.textContent = "0 events";
    return;
  }

  countEl.textContent = `${events.length} event${events.length > 1 ? "s" : ""}`;
  events.forEach((event, index) => {
    const isFirst    = index === 0;
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
      </div>`;
    container.appendChild(item);
  });
}

/* ---------- RENDER SUMMARY (TrackingMore) ---------- */
function renderSummary(data, trackingNum) {
  const statusInfo = getStatusInfo(data.delivery_status || "in_transit");
  document.getElementById("resultTrackingNum").textContent = trackingNum;
  document.getElementById("resultCarrier").textContent     = data.courier_name || data.courier_code || "—";
  document.getElementById("resultOrigin").textContent      = data.origin_country || "—";
  document.getElementById("resultDestination").textContent = data.destination_country || "—";
  document.getElementById("resultETA").textContent         = formatDateShort(data.scheduled_delivery_date || data.estimated_delivery_time) || "—";

  const badge = document.getElementById("resultStatusBadge");
  badge.style.background = statusInfo.bg;
  badge.style.color      = statusInfo.color;
  badge.style.border     = `1.5px solid ${statusInfo.color}`;
  document.getElementById("resultStatusIcon").className   = `fa ${statusInfo.icon}`;
  document.getElementById("resultStatusText").textContent = statusInfo.label;

  const latestEvent = data.origin_info?.trackinfo?.[0] || data.destination_info?.trackinfo?.[0];
  if (latestEvent) {
    document.getElementById("resultLastUpdate").textContent = `Last update: ${formatDate(latestEvent.time)}`;
  }
  document.getElementById("pkgWeight").textContent     = data.weight     ? `${data.weight} kg` : "—";
  document.getElementById("pkgDimensions").textContent = data.dimension  || "—";
  document.getElementById("pkgService").textContent    = data.service_type || data.shipping_type || "—";
  document.getElementById("pkgSigned").textContent     = data.signed_by  || "—";

  updateProgressSteps(statusInfo.step);
}

function mergeEvents(data) {
  let events = [];
  if (data.origin_info?.trackinfo?.length) {
    events = events.concat(data.origin_info.trackinfo.map(e => ({ ...e, location: e.checkpoint_location || data.origin_country || "" })));
  }
  if (data.destination_info?.trackinfo?.length) {
    events = events.concat(data.destination_info.trackinfo.map(e => ({ ...e, location: e.checkpoint_location || data.destination_country || "" })));
  }
  const seen = new Set();
  events = events.filter(e => {
    const key = `${e.time}|${e.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  events.sort((a, b) => new Date(b.time) - new Date(a.time));
  return events;
}

/* ============================================
   MAIN TRACK FUNCTION
   ============================================ */
async function trackParcel() {
  const input       = document.getElementById("trackingInput");
  const trackingNum = input.value.trim().replace(/\s+/g, "");

  if (!trackingNum) {
    input.style.borderColor = "var(--error)";
    input.focus();
    setTimeout(() => input.style.borderColor = "", 2000);
    return;
  }
  if (trackingNum.length < 4) {
    document.getElementById("trackingErrorTitle").textContent = "Invalid Tracking Number";
    document.getElementById("trackingErrorMsg").textContent   = "Please enter a valid tracking number (minimum 4 characters).";
    showState("error");
    return;
  }

  /* SGT- prefix = custom SwiftGlobal shipment from Firestore */
  if (trackingNum.toUpperCase().startsWith("SGT-")) {
    await trackCustomShipment(trackingNum.toUpperCase());
    return;
  }

  input.style.borderColor = "";
  showState("loading");
  document.getElementById("trackingResults")?.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const createRes = await fetch(`${TRACKING_CONFIG.apiBase}/create`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Tracking-Api-Key": TRACKING_CONFIG.apiKey },
      body:    JSON.stringify({ tracking_number: trackingNum }),
    });
    if (!createRes.ok && createRes.status !== 400) throw new Error(`API error: ${createRes.status}`);

    const getRes = await fetch(
      `${TRACKING_CONFIG.apiBase}/get?tracking_numbers=${encodeURIComponent(trackingNum)}&created_at_min=2020-01-01`,
      { method: "GET", headers: { "Content-Type": "application/json", "Tracking-Api-Key": TRACKING_CONFIG.apiKey } }
    );
    if (!getRes.ok) throw new Error(`Fetch error: ${getRes.status}`);

    const json  = await getRes.json();
    const items = json?.data?.items || json?.data || [];
    if (!items?.length) {
      document.getElementById("trackingErrorTitle").textContent = "No Results Found";
      document.getElementById("trackingErrorMsg").textContent   = `We couldn't find tracking information for "${trackingNum}".`;
      showState("error");
      return;
    }

    renderSummary(items[0], trackingNum);
    renderTimeline(mergeEvents(items[0]));
    showState("success");
  } catch (err) {
    console.error("Tracking error:", err);
    document.getElementById("trackingErrorTitle").textContent =
      err.message.includes("fetch") ? "Connection Error" : "Something Went Wrong";
    document.getElementById("trackingErrorMsg").textContent   =
      "Unable to retrieve tracking information. Please try again.";
    showState("error");
  }
}

window.trackParcel = trackParcel;

/* ============================================
   CUSTOM SHIPMENT TRACKING — reads Firestore
   ============================================ */
async function trackCustomShipment(trackingNum) {
  showState("loading");
  document.getElementById("trackingResults")?.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const ship = await getShipmentByTracking(trackingNum);

    if (!ship) {
      document.getElementById("trackingErrorTitle").textContent = "Shipment Not Found";
      document.getElementById("trackingErrorMsg").textContent   =
        `No shipment found for "${trackingNum}". Please verify the number or contact SwiftGlobal Logistics.`;
      showState("error");
      return;
    }

    renderCustomShipment(ship);
    showState("success");
  } catch (err) {
    console.error("Custom tracking error:", err);
    document.getElementById("trackingErrorTitle").textContent = "Tracking Error";
    document.getElementById("trackingErrorMsg").textContent   = "An error occurred. Please try again.";
    showState("error");
  }
}

function renderCustomShipment(ship) {
  const st = CUSTOM_STATUS_MAP[ship.status] || CUSTOM_STATUS_MAP.in_transit;

  document.getElementById("resultTrackingNum").textContent  = ship.trackingNumber;
  document.getElementById("resultCarrier").textContent      = "SwiftGlobal Logistics";
  document.getElementById("resultOrigin").textContent       = ship.route?.origin      || "—";
  document.getElementById("resultDestination").textContent  = ship.route?.destination || "—";
  document.getElementById("resultETA").textContent          = ship.estDelivery ? formatDateShort(ship.estDelivery) : "—";

  const badge = document.getElementById("resultStatusBadge");
  badge.style.background = st.bg;
  badge.style.color      = st.color;
  badge.style.border     = `1.5px solid ${st.color}`;
  document.getElementById("resultStatusIcon").className   = `fa ${st.icon}`;
  document.getElementById("resultStatusText").textContent = st.label;

  const latestEvent = ship.events?.[0];
  if (latestEvent) {
    document.getElementById("resultLastUpdate").textContent =
      `Last update: ${new Date(latestEvent.dateTime).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`;
  }

  document.getElementById("pkgWeight").textContent     = ship.package?.weight ? `${ship.package.weight} kg` : "—";
  document.getElementById("pkgDimensions").textContent = ship.package?.dimensions || "—";
  document.getElementById("pkgService").textContent    = ship.serviceType || "—";
  document.getElementById("pkgSigned").textContent     = ship.status === "delivered" ? (ship.receiver?.name || "—") : "—";

  updateProgressSteps(st.step);
  renderCustomTimeline(ship.events || []);
  setTimeout(() => injectCustomExtras(ship), 100);
}

function renderCustomTimeline(events) {
  const container = document.getElementById("trackingTimeline");
  const countEl   = document.getElementById("eventCount");

  if (!events?.length) {
    container.innerHTML = '<p class="no-events">No tracking events available yet.</p>';
    countEl.textContent = "0 events";
    return;
  }

  const sorted = [...events].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
  countEl.textContent = `${sorted.length} event${sorted.length > 1 ? "s" : ""}`;

  container.innerHTML = sorted.map((ev, i) => {
    const st      = CUSTOM_STATUS_MAP[ev.status] || CUSTOM_STATUS_MAP.in_transit;
    const isFirst = i === 0;
    return `
      <div class="timeline-event${isFirst ? " timeline-event--latest" : ""}">
        <div class="timeline-dot"
          style="background:${isFirst ? st.color : "var(--border)"};border-color:${st.color};">
          ${isFirst ? `<i class="fa ${st.icon}" style="color:#fff;font-size:0.6rem;"></i>` : ""}
        </div>
        <div class="timeline-connector"></div>
        <div class="timeline-content">
          <div class="timeline-content-top">
            <span class="timeline-status-label" style="color:${st.color};background:${st.bg};">${st.label}</span>
            <span class="timeline-date">
              ${new Date(ev.dateTime).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <p class="timeline-detail">${sanitize(ev.description)}</p>
          ${ev.location ? `<span class="timeline-location"><i class="fa fa-location-dot"></i> ${sanitize(ev.location)}</span>` : ""}
        </div>
      </div>`;
  }).join("");
}

function injectCustomExtras(ship) {
  document.getElementById("customShipExtras")?.remove();
  const successEl = document.getElementById("trackingSuccess");
  if (!successEl) return;

  const origin   = sanitize(ship.route?.origin      || "");
  const dest     = sanitize(ship.route?.destination || "");
  const current  = sanitize(ship.route?.current     || "");
  const stopsRaw = ship.route?.stops || "";

  let mapQuery = `${ship.route?.origin || ""} to ${ship.route?.destination || ""}`;
  if (stopsRaw) mapQuery = `${ship.route?.origin || ""} to ${stopsRaw.split("|")[0].trim()} to ${ship.route?.destination || ""}`;
  const mapSrc = `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed&z=3`;

  const stopsHtml = stopsRaw
    ? stopsRaw.split("|").map(s => `
        <i class="fa fa-chevron-right" style="color:var(--text-light);font-size:0.65rem;"></i>
        <span style="font-size:0.82rem;color:var(--text-mid);font-weight:500;">${sanitize(s.trim())}</span>
      `).join("") : "";

  successEl.insertAdjacentHTML("beforeend", `
    <div id="customShipExtras" data-aos="fade-up" data-aos-delay="200">

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
        <div class="tracking-timeline-card" style="padding:0;">
          <div class="tracking-card-header"><i class="fa fa-user"></i><h3>Sender</h3></div>
          <ul class="tracking-info-list">
            <li><span class="ti-label">Name</span><span class="ti-value">${sanitize(ship.sender?.name) || "—"}</span></li>
            <li><span class="ti-label">Address</span><span class="ti-value">${sanitize(ship.sender?.address) || "—"}</span></li>
            ${ship.sender?.phone ? `<li><span class="ti-label">Phone</span><span class="ti-value">${sanitize(ship.sender.phone)}</span></li>` : ""}
          </ul>
        </div>
        <div class="tracking-timeline-card" style="padding:0;">
          <div class="tracking-card-header"><i class="fa fa-user-check"></i><h3>Receiver</h3></div>
          <ul class="tracking-info-list">
            <li><span class="ti-label">Name</span><span class="ti-value">${sanitize(ship.receiver?.name) || "—"}</span></li>
            <li><span class="ti-label">Address</span><span class="ti-value">${sanitize(ship.receiver?.address) || "—"}</span></li>
            ${ship.receiver?.phone ? `<li><span class="ti-label">Phone</span><span class="ti-value">${sanitize(ship.receiver.phone)}</span></li>` : ""}
          </ul>
        </div>
      </div>

      ${ship.package?.description ? `
      <div class="tracking-timeline-card" style="padding:0;margin-bottom:24px;">
        <div class="tracking-card-header"><i class="fa fa-box"></i><h3>Package Description</h3></div>
        <div style="padding:16px 24px;">
          <p style="font-size:0.92rem;color:var(--text-mid);">${sanitize(ship.package.description)}</p>
          ${ship.package?.instructions ? `<p style="font-size:0.85rem;color:var(--text-light);margin-top:8px;"><i class="fa fa-circle-info" style="color:var(--accent);"></i> ${sanitize(ship.package.instructions)}</p>` : ""}
        </div>
      </div>` : ""}

      ${current ? `
      <div class="tracking-timeline-card" style="padding:0;margin-bottom:24px;">
        <div class="tracking-card-header"><i class="fa fa-map-pin"></i><h3>Current Location</h3></div>
        <div style="padding:16px 24px;display:flex;align-items:center;gap:12px;">
          <i class="fa fa-location-dot" style="color:var(--accent);font-size:1.2rem;"></i>
          <span style="font-size:0.95rem;font-weight:600;color:var(--primary);">${current}</span>
        </div>
      </div>` : ""}

      <div class="tracking-timeline-card" style="padding:0;margin-bottom:30px;">
        <div class="tracking-card-header">
          <i class="fa fa-map"></i><h3>Shipment Route Map</h3>
          <span style="margin-left:auto;font-size:0.78rem;color:var(--text-light);">${origin} → ${dest}</span>
        </div>
        <div style="padding:16px;">
          <iframe src="${mapSrc}" width="100%" height="360"
            style="border:0;border-radius:var(--radius);display:block;"
            allowfullscreen="" loading="lazy" title="Shipment Route Map"></iframe>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:14px;padding:12px;background:var(--bg-light);border-radius:var(--radius-sm);">
            <span style="display:flex;align-items:center;gap:5px;font-size:0.82rem;font-weight:600;color:#38A169;">
              <i class="fa fa-circle" style="font-size:0.6rem;"></i> ${origin}
            </span>
            ${stopsHtml}
            <i class="fa fa-chevron-right" style="color:var(--text-light);font-size:0.65rem;"></i>
            <span style="display:flex;align-items:center;gap:5px;font-size:0.82rem;font-weight:600;color:#E53E3E;">
              <i class="fa fa-location-dot" style="font-size:0.75rem;"></i> ${dest}
            </span>
          </div>
        </div>
      </div>
    </div>
  `);

  if (typeof AOS !== "undefined") AOS.refresh();
}

/* ---------- CLEAR BUTTON + URL AUTO-TRACK ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const input    = document.getElementById("trackingInput");
  const clearBtn = document.getElementById("clearBtn");

  if (input && clearBtn) {
    input.addEventListener("input",  () => { clearBtn.style.display = input.value ? "flex" : "none"; });
    clearBtn.addEventListener("click", () => { input.value = ""; clearBtn.style.display = "none"; input.focus(); showState("none"); });
    input.addEventListener("keydown", e => { if (e.key === "Enter") trackParcel(); });
  }

  const numFromUrl = new URLSearchParams(window.location.search).get("number");
  if (numFromUrl && input) {
    input.value = numFromUrl;
    if (clearBtn) clearBtn.style.display = "flex";
    setTimeout(() => trackParcel(), 600);
  }
});