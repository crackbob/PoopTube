(function() {
    'use strict';

    let experimentFlags = null;
    let otherExperiments = null;
    let addedFlags = new Set();
    let addedRawFlags = new Set();

    function getStoredFlags() {
        try {
            return JSON.parse(localStorage.getItem("patched_experiment_flags") || "{}");
        } catch {
            return {};
        }
    }

    function saveStoredFlags(flags) {
        localStorage.setItem("patched_experiment_flags", JSON.stringify(flags));
    }

    function setExperimentFlag(name, value, isOther = false) {
        const stored = getStoredFlags();
        stored[name] = value;
        saveStoredFlags(stored);

        if (experimentFlags) experimentFlags[name] = value;
        if (otherExperiments) otherExperiments[name] = fixOtherExperimentValue(value);
    }

    function checkIsGetExperiment(fn) {
        return (
            typeof fn === "function" &&
            fn.toString().includes("return typeof") &&
            fn.toString().includes(`==="string"&&`)
        );
    }

    function checkIsGetOtherExperiment(fn) {
        return (
            typeof fn === "function" &&
            fn.toString().includes(`;JSON.stringify`)
        );
    }

    function hookGlobalObject(globalName, checker, patchedFn) {
        if (!window[globalName]) {
            window.__defineSetter__(globalName, (val) => {
                const proxied = new Proxy(val, {
                    set(target, prop, value, receiver) {
                        if (checker(value)) {
                            return (target[prop] = patchedFn);
                        }
                        return Reflect.set(target, prop, value, receiver);
                    },
                });

                Object.defineProperty(window, globalName, {
                    value: proxied,
                    writable: true,
                    configurable: true,
                    enumerable: true,
                });
            });
        } else {
            const obj = window[globalName];
            const fnKey = Object.keys(obj).find((k) => checker(obj[k]));
            if (fnKey) {
                obj[fnKey] = patchedFn;
            }
        }
    }

    function fixOtherExperimentValue (value) {
        if (typeof value == "boolean") return String(value);
        if (!isNaN(value)) return parseInt(value);
        return value;
    }

    hookGlobalObject("default_kevlar_base", checkIsGetExperiment, function(name) {
        if (experimentFlags == null) {
            let options = Object.values(default_kevlar_base).find(obj => obj?.EXPERIMENT_FLAGS);
            experimentFlags = options["EXPERIMENT_FLAGS"];

            const stored = getStoredFlags();
            for (const key in stored) {
                experimentFlags[key] = stored[key];
            }

            for (let name of Object.keys(experimentFlags)) addFlagToUI(name);
        }

        if (!experimentFlags[name]) {
            experimentFlags[name] = undefined;
            addFlagToUI(name);
        }

        return experimentFlags[name] ?? undefined;
    });

    hookGlobalObject("_yt_player", checkIsGetOtherExperiment, function(obj, name) {
        if (otherExperiments == null) {
            otherExperiments = obj.flags;

            const stored = getStoredFlags();
            for (const key in stored) {
                otherExperiments[key] = fixOtherExperimentValue(stored[key]);
            }

            let experimentsProto = obj.__proto__;
            let getFlagKey = Object.keys(experimentsProto).find(key => typeof experimentsProto[key] == "function" && experimentsProto[key].toString().includes("this.flags"));
            obj[getFlagKey] = function (flagName) {
                if (!otherExperiments[flagName]) {
                    otherExperiments[flagName] = undefined;
                    addRawFlagToUI(flagName);
                }
                return otherExperiments[flagName];
            }
        }

        for (let name of Object.keys(otherExperiments)) addRawFlagToUI(name);

        if (!otherExperiments[name]) {
            otherExperiments[name] = undefined;
            addRawFlagToUI(name);
        }

        return fixOtherExperimentValue(otherExperiments[name] ?? undefined);
    });

    let mods = {
        "New Player UI": {
            enabled: getStoredFlags()?.delhi_modern_web_player || false,
            onEnable: () => {
                experimentFlags["delhi_modern_web_player"] = true;
                setExperimentFlag("delhi_modern_web_player", true);
            },
            onDisable: () => {
                experimentFlags["delhi_modern_web_player"] = false;
                setExperimentFlag("delhi_modern_web_player", false);
            }
        },
        "New Icons": {
            enabled: getStoredFlags()?.enable_web_delhi_icons || false,
            onEnable: () => {
                experimentFlags["enable_web_delhi_icons"] = true;
                setExperimentFlag("enable_web_delhi_icons", true);
            },
            onDisable: () => {
                experimentFlags["enable_web_delhi_icons"] = false;
                setExperimentFlag("enable_web_delhi_icons", false);
            }
        }
    };

    let panel = document.createElement("div");
    Object.assign(panel.style, {
        color: "white",
        padding: "20px",
        borderRadius: "18px",
        background: "var(--yt-frosted-glass-desktop, rgba(0,0,0,0.85))",
        backdropFilter: "blur(48px)",
        position: "fixed",
        zIndex: "99999",
        top: "50%",
        left: "50%",
        width: "60%",
        maxWidth: "500px",
        maxHeight: "70%",
        transform: "translate(-50%, -50%)",
        boxSizing: "border-box",
        display: "none",
        overflowY: "auto",
        fontFamily: "Roboto, Arial, sans-serif",
        fontSize: "14px",
        border: "1px solid rgba(255,255,255,0.2)"
    });


    let modsLabel = document.createElement("div");
    modsLabel.innerText = "Mods";
    Object.assign(modsLabel.style, { fontWeight: "600", marginBottom: "8px", fontSize: "24px" });
    panel.appendChild(modsLabel);

    let modsContainer = document.createElement("div");
    Object.assign(modsContainer.style, {
        background: "rgba(0,0,0,0.3)",
        borderRadius: "10px",
        padding: "10px",
        maxHeight: "250px",
        overflowY: "auto",
        marginBottom: "15px"
    });
    panel.appendChild(modsContainer);

    function addModToggle(name) {
        if (!modsContainer || document.getElementById("mod_" + name)) return;

        let wrapper = document.createElement("div");
        wrapper.id = "mod_" + name;
        wrapper.style.display = "flex";
        wrapper.style.alignItems = "center";
        wrapper.style.justifyContent = "space-between";
        wrapper.style.padding = "4px 0";
        wrapper.style.marginBottom = "6px";

        let label = document.createElement("span");
        label.innerText = name;
        label.style.flex = "1";
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        label.style.whiteSpace = "nowrap";

        let toggle = document.createElement("input");
        toggle.type = "checkbox";
        toggle.className = "mod-toggle experiment-toggle";
        toggle.checked = !!mods[name].enabled;

        toggle.addEventListener("change", () => {
            mods[name].enabled = toggle.checked;
            if (toggle.checked) mods[name].onEnable?.();
            else mods[name].onDisable?.();
        });

        wrapper.appendChild(label);
        wrapper.appendChild(toggle);
        modsContainer.appendChild(wrapper);
    }

    for (let key of Object.keys(mods)) addModToggle(key);

    let flagsLabel = document.createElement("div");
    flagsLabel.innerText = "Experiment Flags";
    Object.assign(flagsLabel.style, { fontWeight: "600", marginBottom: "8px", fontSize: "24px" });
    panel.appendChild(flagsLabel);

    let flagsContainer = document.createElement("div");
    Object.assign(flagsContainer.style, {
        background: "rgba(0,0,0,0.3)",
        borderRadius: "10px",
        padding: "10px",
        maxHeight: "250px",
        overflowY: "auto",
        marginBottom: "15px"
    });
    panel.appendChild(flagsContainer);

    function addFlagToUI(name) {
        if (addedFlags.has(name)) return;
        addedFlags.add(name);

        if (!flagsContainer) return;

        let wrapper = document.createElement("div");
        wrapper.id = "flag_" + name;
        wrapper.style.display = "flex";
        wrapper.style.alignItems = "center";
        wrapper.style.justifyContent = "space-between";
        wrapper.style.padding = "4px 0";
        wrapper.style.marginBottom = "6px";

        let label = document.createElement("span");
        label.textContent = name;
        label.style.flex = "1";
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        label.style.whiteSpace = "nowrap";

        let toggle = document.createElement("input");
        toggle.type = "checkbox";
        toggle.className = "mod-toggle experiment-toggle";
        toggle.checked = !!experimentFlags[name];

        toggle.addEventListener("change", () => {
            experimentFlags[name] = toggle.checked;
            setExperimentFlag(name, toggle.checked);
        });

        wrapper.appendChild(label);
        wrapper.appendChild(toggle);
        flagsContainer.appendChild(wrapper);
    }

    let rawLabel = document.createElement("div");
    rawLabel.innerText = "Other Experiments";
    Object.assign(rawLabel.style, { fontWeight: "600", marginBottom: "8px", fontSize: "24px" });
    panel.appendChild(rawLabel);

    let rawContainer = document.createElement("div");
    Object.assign(rawContainer.style, {
        background: "rgba(0,0,0,0.3)",
        borderRadius: "10px",
        padding: "10px",
        maxHeight: "250px",
        overflowY: "auto",
        marginBottom: "15px"
    });
    panel.appendChild(rawContainer);

    function addRawFlagToUI(name) {
        if (addedRawFlags.has(name)) return;
        addedRawFlags.add(name);

        if (!rawContainer) return;

        let value = otherExperiments[name];

        let wrapper = document.createElement("div");
        wrapper.id = "raw_" + name;
        wrapper.style.display = "flex";
        wrapper.style.alignItems = "center";
        wrapper.style.justifyContent = "space-between";
        wrapper.style.padding = "4px 0";
        wrapper.style.marginBottom = "6px";

        let label = document.createElement("span");
        label.textContent = name;
        label.style.flex = "1";
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        label.style.whiteSpace = "nowrap";

        let toggle = document.createElement("input");
        toggle.type = "checkbox";
        toggle.className = "mod-toggle experiment-toggle";
        toggle.checked = value === "true";

        toggle.addEventListener("change", () => {
            otherExperiments[name] = toggle.checked ? "true" : "false";
            setExperimentFlag(name, toggle.checked, true);
        });

        wrapper.appendChild(label);
        wrapper.appendChild(toggle);
        rawContainer.appendChild(wrapper);
    }

    let style = document.createElement("style");
    style.textContent = `
        .mod-toggle {
            appearance: none;
            width: 60px;
            height: 30px;
            border-radius: 30px;
            background: rgba(255,255,255,0.1);
            position: relative;
            cursor: pointer;
            outline: none;
            transition: background 0.3s;
        }
        .mod-toggle::before {
            content: "";
            position: absolute;
            top: 3px;
            left: 3px;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: white;
            transition: transform 0.3s;
        }
        .mod-toggle:checked {
            background: #ff0033;
        }
        .mod-toggle:checked::before {
            transform: translateX(30px);
        }
        .experiment-toggle {
            width: 40px !important;
            height: 20px !important;
        }
        .experiment-toggle::before {
            width: 16px !important;
            height: 16px !important;
            top: 2px !important;
            left: 2px !important;
        }
        .experiment-toggle:checked::before {
            transform: translateX(20px) !important;
        }
    `;

    function injectModsButton() {
        if (document.querySelector("#modsBtn")) return;
        let rightButtons = document.querySelector("#end #buttons") || document.querySelector("ytd-masthead #end");
        if (!rightButtons) return;

        let modsBtn = document.createElement("button");
        modsBtn.id = "modsBtn";
        modsBtn.innerText = "Mods";
        Object.assign(modsBtn.style, {
            color: "white",
            background: "rgba(255,255,255,0.1)",
            padding: "0px 15px",
            borderRadius: "18px",
            border: "none",
            height: "36px",
            margin: "8px",
            fontFamily: "Roboto, Arial, sans-serif",
            fontSize: "14px",
            fontWeight: "500",
            cursor: "pointer"
        });

        modsBtn.addEventListener("mouseenter", () => {
            modsBtn.style.background = "rgba(255,255,255,0.2)";
        });
        modsBtn.addEventListener("mouseleave", () => {
            modsBtn.style.background = "rgba(255,255,255,0.1)";
        });
        modsBtn.addEventListener("mousedown", () => {
            modsBtn.style.background = "rgba(255,255,255,0.3)";
        });
        modsBtn.addEventListener("mouseup", () => {
            modsBtn.style.background = "rgba(255,255,255,0.2)";
        });

        modsBtn.addEventListener("click", () => {
            panel.style.display = panel.style.display === "none" ? "block" : "none";
        });

        rightButtons.prepend(modsBtn);
    }

    setInterval(() => {
        if (!document.querySelector("#modsBtn")) injectModsButton();
    }, 500);

    if (document.readyState == "complete") {
        document.head.appendChild(style);
        document.body.appendChild(panel);
    } else {
        window.onload = () => {
            document.head.appendChild(style);
            document.body.appendChild(panel);
        }
    }
})();