/* ============================================
   SWIFTGLOBAL LOGISTICS — SHIPMENT MANAGEMENT
   Full Firebase Firestore Integration
   ============================================ */

import {
  addShipment, updateShipment,
  deleteShipment as fbDeleteShipment,
  listenShipments, getAllTrackingNumbers,
  uploadParcelImage, deleteParcelImage,
} from "./firebase.js";

/* ---------- STATUS CONFIG ---------- */
const SHIP_STATUS = {
  pending:          { label: "Pending",           icon: "fa-clock",                color: "#718096", bg: "rgba(160,174,192,0.15)" },
  pickup:           { label: "Picked Up",          icon: "fa-box",                  color: "#C8891A", bg: "rgba(232,163,23,0.12)"  },
  in_transit:       { label: "In Transit",         icon: "fa-truck",                color: "#2B6CB0", bg: "rgba(49,130,206,0.12)"  },
  customs:          { label: "Customs Clearance",  icon: "fa-file-contract",        color: "#6B46C1", bg: "rgba(128,90,213,0.12)"  },
  out_for_delivery: { label: "Out for Delivery",   icon: "fa-truck-fast",           color: "#276749", bg: "rgba(56,161,105,0.12)"  },
  delivered:        { label: "Delivered",          icon: "fa-circle-check",         color: "#22543D", bg: "rgba(56,161,105,0.2)"   },
  exception:        { label: "Exception",          icon: "fa-triangle-exclamation", color: "#C53030", bg: "rgba(229,62,62,0.12)"   },
};

/* ---------- STATE ---------- */
let allShipments      = [];
let editingShipmentId = null;
let tempEvents        = [];
let unsubShipments    = null;
let currentImageFile  = null;
let existingImageUrl = null;

/* ---------- HELPERS ---------- */
function escHtmlS(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDT(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDateOnly(iso) {
  if (!iso) return "—";
  const parts = iso.split("-");
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/* ---------- GENERATE TRACKING NUMBER ---------- */
async function generateTrackingNumber() {
  const existing = await getAllTrackingNumbers();
  let attempt = 0;
  while (attempt < 20) {
    const now    = new Date();
    const date   = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0");
    const random = Math.floor(1000 + Math.random() * 9000);
    const num    = `SGT-${date}-${random}`;
    if (!existing.has(num)) return num;
    attempt++;
  }
  return `SGT-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

/* ---------- UPDATE SHIPMENT BADGE ---------- */
function updateShipmentBadge() {
  const badge = document.getElementById("shipmentBadge");
  if (badge) badge.textContent = allShipments.length > 0 ? allShipments.length : "";
}

/* ---------- START REAL-TIME LISTENER ---------- */
function startShipmentsListener() {
  if (unsubShipments) return; /* Already listening */
  unsubShipments = listenShipments(ships => {
    allShipments = ships;
    updateShipmentBadge();
    renderShipments();
  });
}

/* ---------- OPEN CREATE SHIPMENT ---------- */
async function openCreateShipment() {
  editingShipmentId = null;
  tempEvents        = [];
  currentImageFile  = null;
  existingImageUrl = null;

  document.getElementById("shipmentModalTitle").innerHTML =
    '<i class="fa fa-plus"></i> Create New Shipment';

  /* Generate unique tracking number from Firestore */
  const trackNum = await generateTrackingNumber();
  document.getElementById("trackingNumValue").textContent   = trackNum;
  document.getElementById("trackingNumValue").dataset.value = trackNum;

  /* Reset all fields */
  [
    "senderName","senderPhone","senderEmail","senderAddress",
    "receiverName","receiverPhone","receiverEmail","receiverAddress",
    "shipPkgWeight","shipPkgDimensions","pkgDescription","pkgInstructions",
    "pkgValue","routeOrigin","routeDestination","routeStops","routeCurrent",
    "parcelImageUrl",
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  document.getElementById("pkgCount").value       = "1";
  document.getElementById("pkgType").value        = "";
  document.getElementById("serviceType").value    = "";
  document.getElementById("shipmentStatus").value = "pending";

  const now = new Date();
  document.getElementById("shipDate").value = now.toISOString().slice(0, 16);
  const eta = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  document.getElementById("estDelivery").value = eta.toISOString().slice(0, 10);

  /* Reset image preview */
  resetImagePreview();

  switchShipmentTab("details", document.querySelector(".shipment-tab"));
  renderEventsList();
  document.getElementById("shipmentModalOverlay").style.display = "flex";
}

/* ---------- OPEN EDIT SHIPMENT ---------- */
function openEditShipment(id) {
  const ship = allShipments.find(s => s.id === id);
  if (!ship) return;

  editingShipmentId = id;
  tempEvents        = [...(ship.events || [])];
  currentImageFile  = null;
  existingImageUrl = ship.package?.imageUrl || null;

  document.getElementById("shipmentModalTitle").innerHTML =
    '<i class="fa fa-pen"></i> Edit Shipment';

  document.getElementById("trackingNumValue").textContent   = ship.trackingNumber;
  document.getElementById("trackingNumValue").dataset.value = ship.trackingNumber;

  document.getElementById("senderName").value        = ship.sender?.name        || "";
  document.getElementById("senderPhone").value       = ship.sender?.phone       || "";
  document.getElementById("senderEmail").value       = ship.sender?.email       || "";
  document.getElementById("senderAddress").value     = ship.sender?.address     || "";
  document.getElementById("receiverName").value      = ship.receiver?.name      || "";
  document.getElementById("receiverPhone").value     = ship.receiver?.phone     || "";
  document.getElementById("receiverEmail").value     = ship.receiver?.email     || "";
  document.getElementById("receiverAddress").value   = ship.receiver?.address   || "";
  document.getElementById("shipPkgWeight").value     = ship.package?.weight     || "";
  document.getElementById("shipPkgDimensions").value = ship.package?.dimensions || "";
  document.getElementById("pkgCount").value          = ship.package?.count      || 1;
  document.getElementById("pkgDescription").value    = ship.package?.description|| "";
  document.getElementById("pkgInstructions").value   = ship.package?.instructions|| "";
  document.getElementById("pkgValue").value          = ship.package?.value      || "";
  document.getElementById("pkgType").value           = ship.package?.type       || "";
  document.getElementById("serviceType").value       = ship.serviceType         || "";
  document.getElementById("shipmentStatus").value    = ship.status              || "pending";
  document.getElementById("shipDate").value          = ship.shipDate ? ship.shipDate.slice(0, 16) : "";
  document.getElementById("estDelivery").value       = ship.estDelivery         || "";
  document.getElementById("routeOrigin").value       = ship.route?.origin       || "";
  document.getElementById("routeDestination").value  = ship.route?.destination  || "";
  document.getElementById("routeStops").value        = ship.route?.stops        || "";
  document.getElementById("routeCurrent").value      = ship.route?.current      || "";
  document.getElementById("parcelImageUrl").value    = ship.package?.imageUrl   || "";

  /* Load existing image preview */
  if (existingImageUrl) {
    showImagePreview(existingImageUrl);
  } else {
    resetImagePreview();
  }

  switchShipmentTab("details", document.querySelector(".shipment-tab"));
  renderEventsList();
  document.getElementById("shipmentModalOverlay").style.display = "flex";
}

/* ---------- CLOSE SHIPMENT MODAL ---------- */
function closeShipmentModal() {
  document.getElementById("shipmentModalOverlay").style.display = "none";
  document.getElementById("mapPreviewContainer").style.display  = "none";
  editingShipmentId = null;
  tempEvents        = [];
  currentImageFile  = null;
  existingImageUrl = null;
  resetImagePreview();
}

/* ---------- SWITCH TAB ---------- */
function switchShipmentTab(tab, btn) {
  document.querySelectorAll(".shipment-tab-content").forEach(c => c.classList.remove("active"));
  document.querySelectorAll(".shipment-tab").forEach(b => b.classList.remove("active"));
  document.getElementById(`tab-${tab}`)?.classList.add("active");
  if (btn) btn.classList.add("active");
}

/* ---------- COPY TRACKING NUMBER ---------- */
function copyTrackingNum() {
  const num = document.getElementById("trackingNumValue").dataset.value ||
              document.getElementById("trackingNumValue").textContent;
  navigator.clipboard.writeText(num).then(() => {
    const btn = document.querySelector(".tnd-copy");
    btn.innerHTML = '<i class="fa fa-check"></i>';
    setTimeout(() => { btn.innerHTML = '<i class="fa fa-copy"></i>'; }, 2000);
  });
}

/* ---------- SAVE SHIPMENT → FIRESTORE ---------- */
async function saveShipment() {
  /* Validation */
  const required = [
    { id: "senderName",       label: "Sender Name",      tab: "details" },
    { id: "senderAddress",    label: "Sender Address",   tab: "details" },
    { id: "receiverName",     label: "Receiver Name",    tab: "details" },
    { id: "receiverAddress",  label: "Receiver Address", tab: "details" },
    { id: "serviceType",      label: "Service Type",     tab: "details" },
    { id: "routeOrigin",      label: "Origin",           tab: "route"   },
    { id: "routeDestination", label: "Destination",      tab: "route"   },
  ];

  for (const f of required) {
    if (!document.getElementById(f.id)?.value.trim()) {
      alert(`Please fill in the required field: ${f.label}`);
      if (f.tab === "route") {
        switchShipmentTab("route", document.querySelectorAll(".shipment-tab")[2]);
      } else {
        switchShipmentTab("details", document.querySelector(".shipment-tab"));
      }
      document.getElementById(f.id).focus();
      return;
    }
  }

  const shipDateVal = document.getElementById("shipDate").value;
  const estDelVal   = document.getElementById("estDelivery").value;
  if (shipDateVal && estDelVal) {
    if (new Date(shipDateVal) > new Date(estDelVal + "T23:59:00")) {
      alert("Ship Date cannot be after the Estimated Delivery date.");
      switchShipmentTab("details", document.querySelector(".shipment-tab"));
      document.getElementById("shipDate").focus();
      return;
    }
  }

  const pkgCountVal = Math.max(1, parseInt(document.getElementById("pkgCount").value) || 1);
  const trackingNumber = document.getElementById("trackingNumValue").dataset.value ||
                         document.getElementById("trackingNumValue").textContent;

  const saveBtn = document.querySelector('[onclick="saveShipment()"]');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fa fa-circle-notch fa-spin"></i> Saving...'; }

  try {
    const existingShip = editingShipmentId ? allShipments.find(s => s.id === editingShipmentId) : null;
    let imageUrl = existingImageUrl;

    /* Handle image upload */
    if (currentImageFile) {
      imageUrl = await uploadParcelImage(currentImageFile, trackingNumber);
      /* Delete old image if editing and had a different image */
      if (editingShipmentId && existingShip?.package?.imageUrl && existingShip.package.imageUrl !== imageUrl) {
        deleteParcelImage(existingShip.package.imageUrl).catch(() => {});
      }
    }

    const shipment = {
      id:             editingShipmentId || Date.now().toString(),
      trackingNumber: trackingNumber.toUpperCase(),
      status:         document.getElementById("shipmentStatus").value,
      serviceType:    document.getElementById("serviceType").value,
      shipDate:       shipDateVal,
      estDelivery:    estDelVal,
      sender: {
        name:    document.getElementById("senderName").value.trim(),
        phone:   document.getElementById("senderPhone").value.trim(),
        email:   document.getElementById("senderEmail").value.trim(),
        address: document.getElementById("senderAddress").value.trim(),
      },
      receiver: {
        name:    document.getElementById("receiverName").value.trim(),
        phone:   document.getElementById("receiverPhone").value.trim(),
        email:   document.getElementById("receiverEmail").value.trim(),
        address: document.getElementById("receiverAddress").value.trim(),
      },
      package: {
        weight:       document.getElementById("shipPkgWeight").value,
        dimensions:   document.getElementById("shipPkgDimensions").value.trim(),
        count:        pkgCountVal,
        value:        document.getElementById("pkgValue").value,
        type:         document.getElementById("pkgType").value,
        description:  document.getElementById("pkgDescription").value.trim(),
        instructions: document.getElementById("pkgInstructions").value.trim(),
        imageUrl:     imageUrl || null,
      },
      route: {
        origin:      document.getElementById("routeOrigin").value.trim(),
        destination: document.getElementById("routeDestination").value.trim(),
        stops:       document.getElementById("routeStops").value.trim(),
        current:     document.getElementById("routeCurrent").value.trim(),
      },
      events: [...tempEvents].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)),
    };

    if (editingShipmentId) {
      await updateShipment(editingShipmentId, shipment);
    } else {
      await addShipment(shipment);
    }

    closeShipmentModal();
    showShipmentToast(
      editingShipmentId
        ? "Shipment updated successfully!"
        : `Shipment created! Tracking: ${trackingNumber}`,
      "success"
    );
  } catch (err) {
    console.error("Save shipment error:", err);
    showShipmentToast("Failed to save shipment. Please try again.", "error");
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa fa-floppy-disk"></i> Save Shipment'; }
  }
}

/* ---------- DELETE SHIPMENT ---------- */
function deleteShipment(id) {
  /* Uses showConfirm from admin.js (window.showConfirm is not exposed —
     use the inline confirm or the admin confirm dialog) */
  if (!confirm("Delete this shipment? The tracking number will no longer work.")) return;
  fbDeleteShipment(id).then(() => {
    showShipmentToast("Shipment deleted.", "success");
  });
}

/* ---------- RENDER SHIPMENTS LIST ---------- */
function renderShipments() {
  const container = document.getElementById("shipmentsList");
  if (!container) return;

  const search = (document.getElementById("shipmentSearch")?.value || "").toLowerCase();
  const statF  = document.getElementById("shipmentStatusFilter")?.value || "all";

  let list = [...allShipments];
  if (statF !== "all") list = list.filter(s => s.status === statF);
  if (search) list = list.filter(s =>
    (s.trackingNumber + (s.sender?.name || "") + (s.receiver?.name || "") +
     (s.route?.origin || "") + (s.route?.destination || "")).toLowerCase().includes(search)
  );

  if (list.length === 0) {
    container.innerHTML = `
      <div class="admin-empty">
        <i class="fa fa-box-open"></i>
        <p>No shipments found. Click <strong>"Create Shipment"</strong> to add the first one.</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(ship => {
    const st  = SHIP_STATUS[ship.status] || SHIP_STATUS.pending;
    const svc = ship.serviceType
      ? `<span style="margin-left:8px;font-size:0.75rem;color:var(--admin-text-light);">${escHtmlS(ship.serviceType)}</span>` : "";

    return `
      <div class="shipment-card" onclick="openEditShipment('${ship.id}')">
        <div class="shipment-card-icon">
          <i class="fa ${st.icon}" style="color:${st.color};"></i>
        </div>
        <div>
          <div class="shipment-card-tracking">${escHtmlS(ship.trackingNumber)}</div>
          <div class="shipment-card-route">
            <i class="fa fa-circle" style="color:#38A169;font-size:0.55rem;"></i>
            ${escHtmlS(ship.route?.origin || "—")}
            <i class="fa fa-arrow-right" style="font-size:0.65rem;color:var(--admin-text-light);"></i>
            <i class="fa fa-location-dot" style="color:#E53E3E;font-size:0.75rem;"></i>
            ${escHtmlS(ship.route?.destination || "—")}
          </div>
          <div class="shipment-card-meta">
            <span><i class="fa fa-user"></i> ${escHtmlS(ship.receiver?.name || "—")}</span>
            <span><i class="fa fa-calendar"></i> ETA: ${formatDateOnly(ship.estDelivery)}</span>
            <span><i class="fa fa-list"></i> ${ship.events?.length || 0} events</span>
          </div>
        </div>
        <div class="shipment-card-right">
          <span class="ship-status ship-status-${ship.status}">${st.label}${svc}</span>
          <div class="shipment-card-actions">
            <button class="msg-btn" title="Edit"
              onclick="event.stopPropagation();openEditShipment('${ship.id}')">
              <i class="fa fa-pen"></i>
            </button>
            <button class="msg-btn" title="Copy Tracking Number"
              onclick="event.stopPropagation();copyText('${escHtmlS(ship.trackingNumber)}')">
              <i class="fa fa-copy"></i>
            </button>
            <button class="msg-btn delete" title="Delete"
              onclick="event.stopPropagation();deleteShipment('${ship.id}')">
              <i class="fa fa-trash"></i>
            </button>
          </div>
        </div>
      </div>`;
  }).join("");
}

/* ---------- EVENTS ---------- */
function addEvent() {
  document.getElementById("eventModalTitle").textContent = "Add Tracking Event";
  document.getElementById("editingEventIndex").value    = "-1";
  document.getElementById("eventStatus").value          = "in_transit";
  document.getElementById("eventDescription").value     = "";
  document.getElementById("eventLocation").value        = "";
  document.getElementById("eventDateTime").value        = new Date().toISOString().slice(0, 16);
  document.getElementById("eventModalOverlay").style.display = "flex";
}

function editEvent(index) {
  const ev = tempEvents[index];
  if (!ev) return;
  document.getElementById("eventModalTitle").textContent = "Edit Tracking Event";
  document.getElementById("editingEventIndex").value     = index;
  document.getElementById("eventStatus").value           = ev.status;
  document.getElementById("eventDescription").value      = ev.description;
  document.getElementById("eventLocation").value         = ev.location;
  document.getElementById("eventDateTime").value         = ev.dateTime?.slice(0, 16) || "";
  document.getElementById("eventModalOverlay").style.display = "flex";
}

function saveEvent() {
  const status      = document.getElementById("eventStatus").value;
  const description = document.getElementById("eventDescription").value.trim();
  const location    = document.getElementById("eventLocation").value.trim();
  const dateTime    = document.getElementById("eventDateTime").value;
  const editIdx     = parseInt(document.getElementById("editingEventIndex").value);

  if (!description || !location || !dateTime) {
    alert("Please fill in all event fields.");
    return;
  }

  const ev = { status, description, location, dateTime, id: Date.now() };
  if (editIdx >= 0) tempEvents[editIdx] = ev;
  else tempEvents.push(ev);

  closeEventModal();
  renderEventsList();
}

function deleteEvent(index) {
  tempEvents.splice(index, 1);
  renderEventsList();
}

function closeEventModal() {
  document.getElementById("eventModalOverlay").style.display = "none";
}

function renderEventsList() {
  const container = document.getElementById("eventsList");
  if (!container) return;

  const sorted = [...tempEvents].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));

  if (sorted.length === 0) {
    container.innerHTML = `
      <div class="admin-empty" style="padding:30px;">
        <i class="fa fa-timeline"></i>
        <p>No events yet. Click "Add Event" to add the first tracking update.</p>
      </div>`;
    return;
  }

  container.innerHTML = sorted.map(ev => {
    const realIdx = tempEvents.indexOf(ev);
    const st = SHIP_STATUS[ev.status] || SHIP_STATUS.in_transit;
    return `
      <div class="event-item">
        <div class="event-status-dot" style="background:${st.bg};color:${st.color};">
          <i class="fa ${st.icon}"></i>
        </div>
        <div class="event-info">
          <strong>${escHtmlS(ev.description)}</strong>
          <span>
            <i class="fa fa-location-dot" style="color:var(--admin-accent);"></i>
            ${escHtmlS(ev.location)} &nbsp;·&nbsp;
            <i class="fa fa-clock"></i> ${formatDT(ev.dateTime)}
          </span>
        </div>
        <div class="event-actions">
          <button class="msg-btn" onclick="editEvent(${realIdx})" title="Edit">
            <i class="fa fa-pen"></i>
          </button>
          <button class="msg-btn delete" onclick="deleteEvent(${realIdx})" title="Delete">
            <i class="fa fa-trash"></i>
          </button>
        </div>
      </div>`;
  }).join("");
}

/* ---------- MAP PREVIEW ---------- */
function previewMap() {
  const origin = document.getElementById("routeOrigin").value.trim();
  const dest   = document.getElementById("routeDestination").value.trim();
  if (!origin || !dest) { alert("Please enter both Origin and Destination first."); return; }
  const frame = document.getElementById("mapPreviewFrame");
  frame.src   = `https://maps.google.com/maps?q=${encodeURIComponent(`${origin} to ${dest}`)}&output=embed&z=4`;
  document.getElementById("mapPreviewContainer").style.display = "block";
}

/* ---------- COPY TEXT ---------- */
function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showShipmentToast(`Copied: ${text}`, "success"));
}

/* ---------- TOAST ---------- */
function showShipmentToast(msg, type = "success") {
  document.querySelector(".ship-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "chat-notify-toast ship-toast";
  toast.style.background = type === "success" ? "var(--admin-primary)" : "var(--admin-danger)";
  toast.innerHTML = `<i class="fa fa-${type === "success" ? "check-circle" : "exclamation-circle"}"></i> ${msg}`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity   = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.4s ease";
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

/* ---------- IMAGE UPLOAD HELPERS ---------- */
function previewParcelImage(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    if (file.size > 5 * 1024 * 1024) {
      alert("Image size must be less than 5MB");
      input.value = "";
      return;
    }
    currentImageFile = file;
    const reader = new FileReader();
    reader.onload = function(e) {
      showImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  }
}

function showImagePreview(url) {
  const preview = document.getElementById("parcelImagePreview");
  const img = document.getElementById("parcelImagePreviewImg");
  const removeBtn = document.getElementById("removeParcelImageBtn");
  
  if (preview && img) {
    img.src = url;
    preview.style.display = "flex";
    if (removeBtn) removeBtn.style.display = "inline-flex";
  }
}

function resetImagePreview() {
  const preview = document.getElementById("parcelImagePreview");
  const img = document.getElementById("parcelImagePreviewImg");
  const removeBtn = document.getElementById("removeParcelImageBtn");
  const input = document.getElementById("parcelImageInput");
  
  if (preview) preview.style.display = "none";
  if (img) img.src = "";
  if (removeBtn) removeBtn.style.display = "none";
  if (input) input.value = "";
  document.getElementById("parcelImageUrl").value = "";
}

function removeParcelImage() {
  currentImageFile = null;
  existingImageUrl = null;
  resetImagePreview();
}

/* ---------- EXPOSE GLOBALS ---------- */
window.openCreateShipment  = openCreateShipment;
window.openEditShipment    = openEditShipment;
window.closeShipmentModal  = closeShipmentModal;
window.switchShipmentTab   = switchShipmentTab;
window.copyTrackingNum     = copyTrackingNum;
window.saveShipment        = saveShipment;
window.deleteShipment      = deleteShipment;
window.renderShipments     = renderShipments;
window.filterShipments     = () => renderShipments();
window.addEvent            = addEvent;
window.editEvent           = editEvent;
window.saveEvent           = saveEvent;
window.deleteEvent         = deleteEvent;
window.closeEventModal     = closeEventModal;
window.previewMap          = previewMap;
window.copyText            = copyText;
window.previewParcelImage  = previewParcelImage;
window.removeParcelImage   = removeParcelImage;

/* ---------- INIT ---------- */
document.addEventListener("DOMContentLoaded", startShipmentsListener);