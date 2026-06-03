const TYPE_STYLES = {
    green:  { base: "#4ade80", deep: "#14532d" },
    yellow: { base: "#fbbf24", deep: "#fbbf24" },
    red:    { base: "#f87171", deep: "#450a0a" }
};

let segmentEntries = [
    { type: "green", texts: ["$10", "$20"], timers: [null, null], cursor: 0 },
    { type: "green", texts: ["$25"], timers: [null], cursor: 0 },
    { type: "yellow", texts: ["$50", "$100"], timers: [null, null], cursor: 0 },
    { type: "yellow", texts: ["Jackpot"], timers: [null], cursor: 0 },
    { type: "red", texts: ["Try Again"], timers: [null], cursor: 0 },
    { type: "yellow", texts: ["Bonus", "Bonus x2"], timers: [null, null], cursor: 0 },
    { type: "green", texts: ["$75"], timers: [null], cursor: 0 },
    { type: "red", texts: ["Bankrupt"], timers: [null], cursor: 0 }
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
const cornerTimer = document.getElementById("cornerTimer");
const cornerTimerDisplay = document.getElementById("cornerTimerDisplay");

const spinDurationMs = 5800;
const zoomDelayMs = 2300;
const zoomDurationMs = 3500;
const zoomResetDurationMs = 650;
const spinAgainPauseMs = 2000;
const textFadeMs = 300;
const TYPE_OPTIONS = ["green", "yellow", "red"];

let currentRotation = 0;
let spinCompletionTimeout;
let zoomCompletionTimeout;
let pendingWinningIndex = null;
let timerFrameHandle;
let timerDurationMs = 0;
let timerEndsAtMs = 0;
let timerIsRunning = false;
let timerReadySeconds = null;

function resetCycleClasses() {
    wheelPanel.classList.remove("is-zooming", "is-zoomed", "is-resetting");
}

function clearCycleTimeouts() {
    window.clearTimeout(spinCompletionTimeout);
    window.clearTimeout(zoomCompletionTimeout);
}

function formatDurationInput(totalSeconds) {
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
        return "";
    }

    const seconds = Math.floor(totalSeconds);
    const minutesPart = Math.floor(seconds / 60);
    const secondsPart = seconds % 60;

    if (minutesPart > 0 && secondsPart > 0) {
        return `${minutesPart}m${secondsPart}s`;
    }

    if (minutesPart > 0) {
        return `${minutesPart}m`;
    }

    return `${secondsPart}s`;
}

function parseDurationInput(rawValue) {
    const normalized = String(rawValue || "").trim().toLowerCase().replace(/\s+/g, "");

    if (!normalized) {
        return { valid: true, seconds: null };
    }

    const parts = normalized.match(/^(?:(\d+)m)?(?:(\d+)s)?$/);

    if (!parts || (!parts[1] && !parts[2])) {
        return { valid: false, seconds: null };
    }

    const minutes = parts[1] ? Number(parts[1]) : 0;
    const seconds = parts[2] ? Number(parts[2]) : 0;
    const totalSeconds = minutes * 60 + seconds;

    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
        return { valid: false, seconds: null };
    }

    return { valid: true, seconds: totalSeconds };
}

function formatRemainingTime(remainingMs) {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutesPart = Math.floor(totalSeconds / 60);
    const secondsPart = totalSeconds % 60;
    return `${String(minutesPart).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}`;
}

function hideCornerTimer() {
    if (timerFrameHandle) {
        window.cancelAnimationFrame(timerFrameHandle);
        timerFrameHandle = undefined;
    }

    timerDurationMs = 0;
    timerEndsAtMs = 0;
    timerIsRunning = false;
    timerReadySeconds = null;

    cornerTimer.hidden = true;
    cornerTimer.classList.remove("is-visible", "is-ready", "is-running");
    cornerTimer.style.setProperty("--timer-progress", "0deg");
    cornerTimerDisplay.textContent = "00:00";
}

function armCornerTimer(totalSeconds) {
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
        hideCornerTimer();
        return;
    }

    if (timerFrameHandle) {
        window.cancelAnimationFrame(timerFrameHandle);
        timerFrameHandle = undefined;
    }

    timerDurationMs = 0;
    timerEndsAtMs = 0;
    timerIsRunning = false;
    timerReadySeconds = Math.floor(totalSeconds);

    cornerTimer.hidden = false;
    cornerTimer.classList.add("is-visible", "is-ready");
    cornerTimer.classList.remove("is-running");
    cornerTimer.style.setProperty("--timer-progress", "0deg");
    cornerTimerDisplay.textContent = formatRemainingTime(timerReadySeconds * 1000);
}

function startArmedCornerTimer() {
    if (timerIsRunning || !Number.isFinite(timerReadySeconds) || timerReadySeconds <= 0) {
        return;
    }

    timerDurationMs = timerReadySeconds * 1000;
    timerEndsAtMs = performance.now() + timerDurationMs;
    timerIsRunning = true;

    cornerTimer.classList.remove("is-ready");
    cornerTimer.classList.add("is-running");

    const tick = (now) => {
        const remainingMs = Math.max(0, timerEndsAtMs - now);
        const elapsedRatio = Math.min((timerDurationMs - remainingMs) / timerDurationMs, 1);

        cornerTimer.style.setProperty("--timer-progress", `${elapsedRatio * 360}deg`);
        cornerTimerDisplay.textContent = formatRemainingTime(remainingMs);

        if (remainingMs > 0) {
            timerFrameHandle = window.requestAnimationFrame(tick);
            return;
        }

        timerFrameHandle = undefined;
        timerIsRunning = false;
        cornerTimer.classList.remove("is-running");
    };

    timerFrameHandle = window.requestAnimationFrame(tick);
}

function normalizeEntry(entry) {
    const chain = Array.isArray(entry.texts) ? entry.texts.slice() : [];

    if (chain.length === 0) {
        chain.push(typeof entry.text === "string" ? entry.text : "");
    }

    const rawTimers = Array.isArray(entry.timers) ? entry.timers.slice() : [];
    const legacyTimer = Number.isInteger(entry.timerSeconds) && entry.timerSeconds > 0 ? entry.timerSeconds : null;

    while (rawTimers.length < chain.length) {
        rawTimers.push(null);
    }

    if (rawTimers.length > chain.length) {
        rawTimers.length = chain.length;
    }

    return {
        type: entry.type || "green",
        texts: chain.map((value) => String(value)),
        timers: rawTimers.map((value, index) => {
            if (Number.isInteger(value) && value > 0) {
                return value;
            }

            if (index === 0 && legacyTimer != null) {
                return legacyTimer;
            }

            return null;
        }),
        cursor: Number.isInteger(entry.cursor) ? Math.max(0, entry.cursor) : 0
    };
}

function clampCursor(entry) {
    const lastIndex = entry.texts.length - 1;
    entry.cursor = Math.min(Math.max(entry.cursor, 0), Math.max(lastIndex, 0));

    if (!Array.isArray(entry.timers)) {
        entry.timers = [];
    }

    while (entry.timers.length < entry.texts.length) {
        entry.timers.push(null);
    }

    if (entry.timers.length > entry.texts.length) {
        entry.timers.length = entry.texts.length;
    }
}

function getCurrentSegmentText(entry) {
    clampCursor(entry);
    return entry.texts[entry.cursor] || "";
}

function getCurrentSegmentTimer(entry) {
    clampCursor(entry);
    const seconds = entry.timers[entry.cursor];
    return Number.isInteger(seconds) && seconds > 0 ? seconds : null;
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

        const winningEntry = pendingWinningIndex != null ? segmentEntries[pendingWinningIndex] : null;
        armCornerTimer(winningEntry ? getCurrentSegmentTimer(winningEntry) : null);
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
    const ar = (pa >> 16) & 0xff;
    const ag = (pa >> 8) & 0xff;
    const ab = pa & 0xff;
    const br = (pb >> 16) & 0xff;
    const bg = (pb >> 8) & 0xff;
    const bb = pb & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const b = Math.round(ab + (bb - ab) * t);
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, "0")}`;
}

function getSegmentColor(entry) {
    const style = TYPE_STYLES[entry.type];
    if (!style) {
        return "#888888";
    }

    const totalSteps = Math.max(entry.texts.length - 1, 0);
    if (totalSteps === 0) {
        return style.base;
    }

    const t = Math.min(entry.cursor / totalSteps, 1);
    return lerpColor(style.base, style.deep, t);
}

function serializeToURL() {
    const params = new URLSearchParams();

    segmentEntries.forEach((entry, i) => {
        clampCursor(entry);
        params.set(`s${i}`, [entry.type, ...entry.texts].join("|"));

        if (entry.timers.some((seconds) => Number.isInteger(seconds) && seconds > 0)) {
            params.set(
                `t${i}`,
                entry.timers.map((seconds) => (Number.isInteger(seconds) && seconds > 0 ? String(seconds) : "")).join("|")
            );
        }
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
        const timersRaw = params.get(`t${i}`);
        const timers = timersRaw == null
            ? []
            : timersRaw.split("|").map((value) => {
                if (!/^\d+$/.test(value)) {
                    return null;
                }

                const seconds = Number(value);
                return Number.isInteger(seconds) && seconds > 0 ? seconds : null;
            });

        if (texts.length === 0) {
            texts.push("");
        }

        while (timers.length < texts.length) {
            timers.push(null);
        }

        if (timers.length > texts.length) {
            timers.length = texts.length;
        }

        loaded.push({ type, texts, timers, cursor: 0 });
        i += 1;
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

    if (!showPlay) {
        hideCornerTimer();
    }
}

function resetWheelState() {
    clearCycleTimeouts();
    resetCycleClasses();
    wheel.classList.remove("is-spinning");
    currentRotation = 0;
    pendingWinningIndex = null;
    wheel.style.transform = "rotate(0deg)";
    spinButton.disabled = segmentEntries.length < 2;
    hideCornerTimer();
}

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
        clampCursor(entry);

        const listItem = document.createElement("li");
        const mainControls = document.createElement("div");
        const textInput = document.createElement("input");
        const currentTimerInput = document.createElement("input");
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

        currentTimerInput.type = "text";
        currentTimerInput.className = "segment-timer-input";
        currentTimerInput.placeholder = "Current timer (30s, 2m, 1m30s)";
        currentTimerInput.value = formatDurationInput(entry.timers[0]);
        currentTimerInput.setAttribute("aria-label", "Current text timer");
        currentTimerInput.addEventListener("input", () => {
            const parsed = parseDurationInput(currentTimerInput.value);
            currentTimerInput.classList.toggle("is-invalid", !parsed.valid);
            currentTimerInput.title = parsed.valid ? "" : "Use a duration like 30s, 2m, or 1m30s";

            if (parsed.valid) {
                segmentEntries[index].timers[0] = parsed.seconds;
                serializeToURL();
            }
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
            segmentEntries[index].timers.push(null);
            clampCursor(segmentEntries[index]);
            serializeToURL();
            renderSegmentList();
        });

        entry.texts.slice(1).forEach((replacementText, replacementOffset) => {
            const replacementIndex = replacementOffset + 1;
            const replacementRow = document.createElement("div");
            const replacementInput = document.createElement("input");
            const replacementTimerInput = document.createElement("input");
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

            replacementTimerInput.type = "text";
            replacementTimerInput.className = "replacement-timer-input";
            replacementTimerInput.placeholder = "Timer";
            replacementTimerInput.value = formatDurationInput(entry.timers[replacementIndex]);
            replacementTimerInput.setAttribute("aria-label", `Replacement ${replacementIndex} timer`);
            replacementTimerInput.addEventListener("input", () => {
                const parsed = parseDurationInput(replacementTimerInput.value);
                replacementTimerInput.classList.toggle("is-invalid", !parsed.valid);
                replacementTimerInput.title = parsed.valid ? "" : "Use a duration like 30s, 2m, or 1m30s";

                if (parsed.valid) {
                    segmentEntries[index].timers[replacementIndex] = parsed.seconds;
                    serializeToURL();
                }
            });

            removeReplacement.type = "button";
            removeReplacement.className = "remove-replacement-button";
            removeReplacement.textContent = "Remove";
            removeReplacement.addEventListener("click", () => {
                segmentEntries[index].texts.splice(replacementIndex, 1);
                segmentEntries[index].timers.splice(replacementIndex, 1);
                clampCursor(segmentEntries[index]);
                buildWheel();
                renderSegmentList();
            });

            replacementRow.append(replacementInput, replacementTimerInput, removeReplacement);
            replacements.appendChild(replacementRow);
        });

        typeWrap.append(typeDot, typeSelect);
        mainControls.append(textInput, currentTimerInput, typeWrap, orderControls, remove);
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
        text.style.transform = "rotate(90deg)";

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
    segmentEntries.push({ type: "green", texts: [""], timers: [null], cursor: 0 });
    buildWheel();
    renderSegmentList();

    const newInput = segmentList.lastElementChild.querySelector(".segment-text-input");
    newInput.focus();
});

cornerTimer.addEventListener("click", () => {
    if (!cornerTimer.classList.contains("is-ready")) {
        return;
    }

    startArmedCornerTimer();
});

loadFromURL();
buildWheel();
renderSegmentList();

spinButton.addEventListener("click", () => {
    hideCornerTimer();

    if (wheelPanel.classList.contains("is-zoomed")) {
        queueNextSpin();
        return;
    }

    if (wheel.classList.contains("is-spinning") || wheelPanel.classList.contains("is-resetting")) {
        return;
    }

    startSpinCycle();
});
