const TYPE_STYLES = {
    green:  { base: "#4ade80", deep: "#14532d" },
    yellow: { base: "#fbbf24", deep: "#fbbf24" },
    red:    { base: "#f87171", deep: "#450a0a" }
};

let segmentEntries = [
    { type: "green",  texts: ["$10", "$20"],       cursor: 0 },
    { type: "green",  texts: ["$25"],              cursor: 0 },
    { type: "yellow", texts: ["$50", "$100"],      cursor: 0 },
    { type: "yellow", texts: ["Jackpot"],          cursor: 0 },
    { type: "red",    texts: ["Try Again"],        cursor: 0 },
    { type: "yellow", texts: ["Bonus", "Bonus x2"], cursor: 0 },
    { type: "green",  texts: ["$75"],              cursor: 0 },
    { type: "red",    texts: ["Bankrupt"],         cursor: 0 }
];

const wheel = document.getElementById("spinwheel");
const spinButton = document.getElementById("spinButton");
const wheelPanel = wheel.closest(".wheel-panel");
const playTab = document.getElementById("playTab");
const editTab = document.getElementById("editTab");
const playView = document.getElementById("playView");
const editView = document.getElementById("editView");
const segmentList = document.getElementById("segmentList");
const addSegmentButton = document.getElementById("addSegmentButton");
const spinDurationMs = 5800;
const zoomDelayMs = 2300;
const zoomDurationMs = 3500;
const zoomResetDurationMs = 650;
const spinAgainPauseMs = 2000;
const textFadeMs = 300;
let currentRotation = 0;
let spinCompletionTimeout;
let zoomCompletionTimeout;
let pendingWinningIndex = null;

function resetCycleClasses() {
    wheelPanel.classList.remove("is-zooming", "is-zoomed", "is-resetting");
}

function clearCycleTimeouts() {
    window.clearTimeout(spinCompletionTimeout);
    window.clearTimeout(zoomCompletionTimeout);
}

function normalizeEntry(entry) {
    const chain = Array.isArray(entry.texts) ? entry.texts.slice() : [];

    if (chain.length === 0) {
        chain.push(typeof entry.text === "string" ? entry.text : "");
    }

    return {
        type: entry.type || "green",
        texts: chain.map((value) => String(value)),
        cursor: Number.isInteger(entry.cursor) ? Math.max(0, entry.cursor) : 0
    };
}

function clampCursor(entry) {
    const lastIndex = entry.texts.length - 1;
    entry.cursor = Math.min(Math.max(entry.cursor, 0), Math.max(lastIndex, 0));
}

function getCurrentSegmentText(entry) {
    clampCursor(entry);
    return entry.texts[entry.cursor] || "";
}

function applySegmentReplacement(index) {
    if (index == null || index < 0 || index >= segmentEntries.length) {
        return false;
    }

    const entry = segmentEntries[index];
    const lastIndex = entry.texts.length - 1;

    if (entry.cursor < lastIndex) {
        entry.cursor += 1;
        return true;
    }

    return false;
}

function startSpinCycle() {
    const segmentCount = segmentEntries.length;

    if (segmentCount < 2) {
        return;
    }

    const segmentSize = 360 / segmentCount;
    const fullTurns = 6;
    const winningIndex = Math.floor(Math.random() * segmentCount);
    pendingWinningIndex = winningIndex;
    const winningCenterAngle = winningIndex * segmentSize + segmentSize / 2;
    const restingRotation = (360 - winningCenterAngle) % 360;
    const normalizedCurrentRotation = ((currentRotation % 360) + 360) % 360;
    const rotationDelta = (restingRotation - normalizedCurrentRotation + 360) % 360;
    const nextRotation = currentRotation + fullTurns * 360 + rotationDelta;
    const spinUpPortion = 0.018;
    const spinUpRotation = currentRotation + (nextRotation - currentRotation) * spinUpPortion;

    wheel.style.setProperty("--spin-start", `${currentRotation}deg`);
    wheel.style.setProperty("--spin-up-end", `${spinUpRotation}deg`);
    wheel.style.setProperty("--spin-end", `${nextRotation}deg`);

    clearCycleTimeouts();
    resetCycleClasses();
    spinButton.disabled = true;
    wheel.classList.remove("is-spinning");
    void wheel.offsetWidth;
    wheelPanel.classList.add("is-zooming");
    wheel.classList.add("is-spinning");
    currentRotation = nextRotation % 360;

    spinCompletionTimeout = window.setTimeout(() => {
        wheel.classList.remove("is-spinning");
        wheel.style.transform = `rotate(${currentRotation}deg)`;
    }, spinDurationMs);

    zoomCompletionTimeout = window.setTimeout(() => {
        wheelPanel.classList.remove("is-zooming");
        wheelPanel.classList.add("is-zoomed");
        spinButton.disabled = false;
    }, zoomDelayMs + zoomDurationMs);
}

function queueNextSpin() {
    if (!wheelPanel.classList.contains("is-zoomed")) {
        return;
    }

    spinButton.disabled = true;
    wheelPanel.classList.add("is-holding");

    const winningIndex = pendingWinningIndex;
    const winningEntry = winningIndex != null ? segmentEntries[winningIndex] : null;
    const willTextChange = winningEntry != null && winningEntry.cursor < winningEntry.texts.length - 1;
    const previousGradient = wheel.style.getPropertyValue("--wheel-gradient");

    if (willTextChange) {
        const winningLabelText = wheel.querySelectorAll(".wheel-label-text")[winningIndex];
        if (winningLabelText) {
            winningLabelText.classList.add("is-fading-out");
        }
    }

    window.setTimeout(() => {
        applySegmentReplacement(winningIndex);
        pendingWinningIndex = null;
        buildWheel(false);
        renderSegmentList();

        if (willTextChange) {
            if (previousGradient) {
                wheel.style.setProperty("--wheel-gradient-prev", previousGradient);
                wheel.classList.remove("is-gradient-fading");
                void wheel.offsetWidth;
                wheel.classList.add("is-gradient-fading");
                window.setTimeout(() => {
                    wheel.classList.remove("is-gradient-fading");
                }, textFadeMs);
            }

            const newLabelText = wheel.querySelectorAll(".wheel-label-text")[winningIndex];
            if (newLabelText) {
                newLabelText.classList.add("is-fading-in");
            }
        }
    }, willTextChange ? textFadeMs : 0);

    const startResetCycle = () => {
        if (!wheelPanel.classList.contains("is-zoomed")) {
            return;
        }

        wheelPanel.classList.remove("is-holding");
        wheelPanel.classList.remove("is-zoomed");
        wheelPanel.classList.add("is-resetting");

        window.setTimeout(() => {
            if (!wheelPanel.classList.contains("is-resetting")) {
                return;
            }

            wheelPanel.classList.remove("is-resetting");
            startSpinCycle();
        }, zoomResetDurationMs);
    };

    window.setTimeout(startResetCycle, spinAgainPauseMs);
}

function lerpColor(hexA, hexB, t) {
    const pa = parseInt(hexA.slice(1), 16);
    const pb = parseInt(hexB.slice(1), 16);
    const ar = (pa >> 16) & 0xff, ag = (pa >> 8) & 0xff, ab = pa & 0xff;
    const br = (pb >> 16) & 0xff, bg = (pb >> 8) & 0xff, bb = pb & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const b = Math.round(ab + (bb - ab) * t);
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, "0")}`;
}

function getSegmentColor(entry) {
    const style = TYPE_STYLES[entry.type];
    if (!style) return "#888888";
    const totalSteps = Math.max(entry.texts.length - 1, 0);
    if (totalSteps === 0) return style.base;
    const t = Math.min(entry.cursor / totalSteps, 1);
    return lerpColor(style.base, style.deep, t);
}

function serializeToURL() {
    const params = new URLSearchParams();

    segmentEntries.forEach((entry, i) => {
        params.set(`s${i}`, [entry.type, ...entry.texts].join("|"));
    });

    history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
}

function loadFromURL() {
    const params = new URLSearchParams(location.search);
    const loaded = [];
    let i = 0;

    while (params.has(`s${i}`)) {
        const parts = params.get(`s${i}`).split("|");
        const type = TYPE_OPTIONS.includes(parts[0]) ? parts[0] : "green";
        const texts = parts.slice(1);

        if (texts.length === 0) {
            texts.push("");
        }

        loaded.push({ type, texts, cursor: 0 });
        i++;
    }

    if (loaded.length > 0) {
        segmentEntries = loaded.map(normalizeEntry);
    }
}

function setActiveView(viewName) {
    const showPlay = viewName === "play";

    playView.classList.toggle("is-active", showPlay);
    playView.hidden = !showPlay;
    editView.classList.toggle("is-active", !showPlay);
    editView.hidden = showPlay;

    playTab.classList.toggle("is-active", showPlay);
    playTab.setAttribute("aria-selected", String(showPlay));
    editTab.classList.toggle("is-active", !showPlay);
    editTab.setAttribute("aria-selected", String(!showPlay));
}

function resetWheelState() {
    clearCycleTimeouts();
    resetCycleClasses();
    wheel.classList.remove("is-spinning");
    currentRotation = 0;
    pendingWinningIndex = null;
    wheel.style.transform = "rotate(0deg)";
    spinButton.disabled = segmentEntries.length < 2;
}

const TYPE_OPTIONS = ["green", "yellow", "red"];

function moveSegment(fromIndex, toIndex) {
    if (
        fromIndex === toIndex
        || fromIndex < 0
        || toIndex < 0
        || fromIndex >= segmentEntries.length
        || toIndex >= segmentEntries.length
    ) {
        return;
    }

    const [movedEntry] = segmentEntries.splice(fromIndex, 1);
    segmentEntries.splice(toIndex, 0, movedEntry);
    buildWheel();
    renderSegmentList();
}

function renderSegmentList() {
    segmentList.innerHTML = "";

    segmentEntries.forEach((entry, index) => {
        const listItem = document.createElement("li");
        const mainControls = document.createElement("div");
        const textInput = document.createElement("input");
        const typeWrap = document.createElement("div");
        const typeDot = document.createElement("span");
        const typeSelect = document.createElement("select");
        const orderControls = document.createElement("div");
        const moveUp = document.createElement("button");
        const moveDown = document.createElement("button");
        const remove = document.createElement("button");
        const replacements = document.createElement("div");
        const replacementsTitle = document.createElement("p");
        const currentValue = document.createElement("p");
        const addReplacement = document.createElement("button");

        listItem.className = "segment-list-item";
        mainControls.className = "segment-main-controls";
        replacements.className = "segment-replacements";
        replacementsTitle.className = "segment-replacements-title";
        replacementsTitle.textContent = "Replacement texts";

        currentValue.className = "segment-current-value";
        currentValue.textContent = `Current live text: ${getCurrentSegmentText(entry) || "(empty)"}`;

        textInput.type = "text";
        textInput.className = "segment-text-input";
        textInput.maxLength = 24;
        textInput.placeholder = "Current text";
        textInput.value = entry.texts[0] || "";
        textInput.setAttribute("aria-label", "Segment text");
        textInput.addEventListener("input", () => {
            segmentEntries[index].texts[0] = textInput.value;
            buildWheel();
            currentValue.textContent = `Current live text: ${getCurrentSegmentText(segmentEntries[index]) || "(empty)"}`;
        });

        typeWrap.className = "segment-type-wrap";

        typeDot.className = "type-dot";
        typeDot.style.backgroundColor = getSegmentColor(entry);

        TYPE_OPTIONS.forEach((optVal) => {
            const opt = document.createElement("option");
            opt.value = optVal;
            opt.textContent = optVal.charAt(0).toUpperCase() + optVal.slice(1);
            opt.selected = optVal === entry.type;
            typeSelect.appendChild(opt);
        });

        typeSelect.className = "segment-type-select";
        typeSelect.setAttribute("aria-label", "Segment type");
        typeSelect.addEventListener("change", () => {
            segmentEntries[index].type = typeSelect.value;
            typeDot.style.backgroundColor = getSegmentColor(segmentEntries[index]);
            buildWheel();
        });

        orderControls.className = "segment-order-controls";

        moveUp.type = "button";
        moveUp.className = "segment-order-button";
        moveUp.textContent = "Up";
        moveUp.disabled = index === 0;
        moveUp.setAttribute("aria-label", `Move ${entry.texts[0] || "segment"} up`);
        moveUp.addEventListener("click", () => moveSegment(index, index - 1));

        moveDown.type = "button";
        moveDown.className = "segment-order-button";
        moveDown.textContent = "Down";
        moveDown.disabled = index === segmentEntries.length - 1;
        moveDown.setAttribute("aria-label", `Move ${entry.texts[0] || "segment"} down`);
        moveDown.addEventListener("click", () => moveSegment(index, index + 1));

        orderControls.append(moveUp, moveDown);

        remove.type = "button";
        remove.className = "remove-button";
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", `Remove ${entry.texts[0] || "segment"}`);
        remove.addEventListener("click", () => {
            segmentEntries = segmentEntries.filter((_, segmentIndex) => segmentIndex !== index);
            buildWheel();
            renderSegmentList();
        });

        addReplacement.type = "button";
        addReplacement.className = "add-replacement-button";
        addReplacement.textContent = "+ Add replacement";
        addReplacement.addEventListener("click", () => {
            segmentEntries[index].texts.push("");
            clampCursor(segmentEntries[index]);
            serializeToURL();
            renderSegmentList();
        });

        entry.texts.slice(1).forEach((replacementText, replacementOffset) => {
            const replacementIndex = replacementOffset + 1;
            const replacementRow = document.createElement("div");
            const replacementInput = document.createElement("input");
            const removeReplacement = document.createElement("button");

            replacementRow.className = "replacement-row";

            replacementInput.type = "text";
            replacementInput.className = "replacement-input";
            replacementInput.maxLength = 24;
            replacementInput.placeholder = `Replacement ${replacementIndex}`;
            replacementInput.value = replacementText;
            replacementInput.setAttribute("aria-label", `Replacement ${replacementIndex}`);
            replacementInput.addEventListener("input", () => {
                segmentEntries[index].texts[replacementIndex] = replacementInput.value;
                buildWheel();
                currentValue.textContent = `Current live text: ${getCurrentSegmentText(segmentEntries[index]) || "(empty)"}`;
            });

            removeReplacement.type = "button";
            removeReplacement.className = "remove-replacement-button";
            removeReplacement.textContent = "Remove";
            removeReplacement.addEventListener("click", () => {
                segmentEntries[index].texts.splice(replacementIndex, 1);
                clampCursor(segmentEntries[index]);
                buildWheel();
                renderSegmentList();
            });

            replacementRow.append(replacementInput, removeReplacement);
            replacements.appendChild(replacementRow);
        });

        typeWrap.append(typeDot, typeSelect);
        mainControls.append(textInput, typeWrap, orderControls, remove);
        replacements.append(replacementsTitle, currentValue, addReplacement);
        listItem.append(mainControls, replacements);
        segmentList.appendChild(listItem);
    });
}

function buildWheel(shouldResetState = true) {
    wheel.innerHTML = "";

    if (segmentEntries.length === 0) {
        wheel.style.setProperty("--wheel-gradient", "conic-gradient(#d1d5db 0deg 360deg)");
        if (shouldResetState) {
            resetWheelState();
        }
        return;
    }

    const segmentSize = 360 / segmentEntries.length;
    const gradientStops = segmentEntries.map((entry, index) => {
        const start = index * segmentSize;
        const end = start + segmentSize;
        const color = getSegmentColor(entry);

        return `${color} ${start}deg ${end}deg`;
    });

    wheel.style.setProperty("--wheel-gradient", `conic-gradient(${gradientStops.join(", ")})`);

    segmentEntries.forEach((entry, index) => {
        const label = document.createElement("span");
        const text = document.createElement("span");
        const angle = index * segmentSize + segmentSize / 2 - 90;

        label.className = "wheel-label";
        label.style.transform = `rotate(${angle}deg)`;

        text.className = "wheel-label-text";
        text.textContent = getCurrentSegmentText(entry);
        text.style.transform = `rotate(${90}deg)`;

        label.appendChild(text);
        wheel.appendChild(label);
    });

    if (shouldResetState) {
        resetWheelState();
        serializeToURL();
    }
}

playTab.addEventListener("click", () => setActiveView("play"));
editTab.addEventListener("click", () => setActiveView("edit"));

addSegmentButton.addEventListener("click", () => {
    segmentEntries.push({ type: "green", texts: [""], cursor: 0 });
    buildWheel();
    renderSegmentList();

    const newInput = segmentList.lastElementChild.querySelector(".segment-text-input");
    newInput.focus();
});

loadFromURL();

buildWheel();
renderSegmentList();

spinButton.addEventListener("click", () => {
    if (wheelPanel.classList.contains("is-zoomed")) {
        queueNextSpin();
        return;
    }

    if (wheel.classList.contains("is-spinning") || wheelPanel.classList.contains("is-resetting")) {
        return;
    }

    startSpinCycle();
});
