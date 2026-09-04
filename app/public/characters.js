// Hand-coded SVG character art — no external image-gen service, no cost.
// Flat, rounded, friendly children's-book style. Each character has 5 poses:
// idle, talk, happy, confused, think — matching the design doc's "rig states."
// Built as plain functions so no build step / library is needed.

const PALETTE = {
  foxBody: "#FF7A47",
  foxBodyDark: "#E85F2A",
  foxCream: "#FFF3E6",
  owlBody: "#8B5E3C",
  owlBodyLight: "#B08968",
  owlCream: "#F5EBDD",
  ink: "#14181C",
  white: "#FFFFFF",
  blush: "#FFB4A0",
};

function svgWrap(inner) {
  return `<svg viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">${inner}</svg>`;
}

// --- Fox cub ---------------------------------------------------------

function foxEars(tilt = 0) {
  return `
    <g transform="rotate(${-15 + tilt} 60 70)">
      <path d="M55 75 Q45 20 75 55 Z" fill="${PALETTE.foxBody}" stroke="${PALETTE.ink}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M58 68 Q52 35 70 58 Z" fill="${PALETTE.foxBodyDark}"/>
    </g>
    <g transform="rotate(${15 - tilt} 160 70)">
      <path d="M165 75 Q175 20 145 55 Z" fill="${PALETTE.foxBody}" stroke="${PALETTE.ink}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M162 68 Q168 35 150 58 Z" fill="${PALETTE.foxBodyDark}"/>
    </g>`;
}

function foxHead() {
  return `<ellipse cx="110" cy="120" rx="70" ry="62" fill="${PALETTE.foxBody}" stroke="${PALETTE.ink}" stroke-width="5"/>
    <path d="M70 145 Q110 175 150 145 Q145 105 110 100 Q75 105 70 145 Z" fill="${PALETTE.foxCream}" stroke="${PALETTE.ink}" stroke-width="4"/>`;
}

function foxNose() {
  return `<path d="M110 128 L100 138 Q110 146 120 138 Z" fill="${PALETTE.ink}"/>`;
}

const foxEyes = {
  idle: `<circle cx="85" cy="115" r="11" fill="${PALETTE.white}" stroke="${PALETTE.ink}" stroke-width="3"/><circle cx="85" cy="116" r="5" fill="${PALETTE.ink}"/>
         <circle cx="135" cy="115" r="11" fill="${PALETTE.white}" stroke="${PALETTE.ink}" stroke-width="3"/><circle cx="135" cy="116" r="5" fill="${PALETTE.ink}"/>`,
  talk: `<circle cx="85" cy="113" r="10" fill="${PALETTE.white}" stroke="${PALETTE.ink}" stroke-width="3"/><circle cx="86" cy="114" r="5" fill="${PALETTE.ink}"/>
         <circle cx="135" cy="113" r="10" fill="${PALETTE.white}" stroke="${PALETTE.ink}" stroke-width="3"/><circle cx="134" cy="114" r="5" fill="${PALETTE.ink}"/>`,
  happy: `<path d="M75 115 Q85 102 95 115" stroke="${PALETTE.ink}" stroke-width="4" fill="none" stroke-linecap="round"/>
          <path d="M125 115 Q135 102 145 115" stroke="${PALETTE.ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  confused: `<circle cx="85" cy="118" r="10" fill="${PALETTE.white}" stroke="${PALETTE.ink}" stroke-width="3"/><circle cx="88" cy="118" r="5" fill="${PALETTE.ink}"/>
             <circle cx="135" cy="112" r="10" fill="${PALETTE.white}" stroke="${PALETTE.ink}" stroke-width="3"/><circle cx="132" cy="112" r="5" fill="${PALETTE.ink}"/>
             <path d="M118 92 Q128 86 140 90" stroke="${PALETTE.ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  think: `<circle cx="85" cy="115" r="10" fill="${PALETTE.white}" stroke="${PALETTE.ink}" stroke-width="3"/><circle cx="85" cy="108" r="5" fill="${PALETTE.ink}"/>
          <circle cx="135" cy="115" r="10" fill="${PALETTE.white}" stroke="${PALETTE.ink}" stroke-width="3"/><circle cx="135" cy="108" r="5" fill="${PALETTE.ink}"/>`,
};

const foxMouths = {
  idle: `<path d="M100 152 Q110 158 120 152" stroke="${PALETTE.ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
  talk: `<ellipse cx="110" cy="155" rx="13" ry="10" fill="${PALETTE.ink}"/><ellipse cx="110" cy="157" rx="7" ry="5" fill="#B4432E"/>`,
  happy: `<path d="M92 148 Q110 172 128 148" stroke="${PALETTE.ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  confused: `<path d="M100 156 Q110 150 122 154" stroke="${PALETTE.ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
  think: `<ellipse cx="112" cy="154" rx="6" ry="7" fill="${PALETTE.ink}"/>`,
};

function foxExtras(pose) {
  if (pose === "happy") {
    // little raised paw + motion sparkle — animated via CSS (see index.html)
    return `<g class="hero-paw-wave"><circle cx="185" cy="90" r="10" fill="${PALETTE.foxCream}" stroke="${PALETTE.ink}" stroke-width="3"/></g>
            <path class="hero-sparkle" d="M195 65 L199 75 L209 77 L199 79 L195 89 L191 79 L181 77 L191 75 Z" fill="#FFD23F"/>`;
  }
  if (pose === "confused") {
    return `<circle cx="45" cy="145" r="10" fill="${PALETTE.foxCream}" stroke="${PALETTE.ink}" stroke-width="3"/>
            <path d="M45 138 v-8 M42 133 l3 -5 l3 5" stroke="${PALETTE.ink}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
  }
  if (pose === "think") {
    return `<circle cx="165" cy="150" r="10" fill="${PALETTE.foxCream}" stroke="${PALETTE.ink}" stroke-width="3"/>
            <circle class="hero-think-bubble hero-think-bubble-1" cx="175" cy="60" r="4" fill="${PALETTE.foxCream}" stroke="${PALETTE.ink}" stroke-width="2"/>
            <circle class="hero-think-bubble hero-think-bubble-2" cx="185" cy="45" r="6" fill="${PALETTE.foxCream}" stroke="${PALETTE.ink}" stroke-width="2"/>`;
  }
  if (pose === "talk") {
    return `<path d="M150 60 q6 -4 10 2 M156 70 q8 -3 13 4" stroke="${PALETTE.foxBody}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.6"/>`;
  }
  return "";
}

function foxSVG(pose = "idle") {
  const eyes = foxEyes[pose] || foxEyes.idle;
  const mouth = foxMouths[pose] || foxMouths.idle;
  const tilt = pose === "confused" ? 8 : 0;
  // happy uses closed-arc eyes already — blinking those would look glitchy,
  // so only round-eye poses get the blink loop. "talk" gets a mouth-flap
  // loop so speech reads as motion, not a frozen frame (see index.html/CSS).
  const eyesClass = pose === "happy" ? "" : "hero-eyes";
  const mouthClass = pose === "talk" ? "hero-mouth-talk" : "";
  return svgWrap(`
    ${foxEars(tilt)}
    ${foxHead()}
    ${foxExtras(pose)}
    <g class="${eyesClass}">${eyes}</g>
    ${foxNose()}
    <g class="${mouthClass}">${mouth}</g>
  `);
}

// --- Owl ---------------------------------------------------------

function owlWings(pose) {
  const flap = pose === "happy" ? -18 : 0;
  return `
    <g transform="rotate(${18 + flap} 55 140)">
      <ellipse cx="50" cy="140" rx="22" ry="34" fill="${PALETTE.owlBodyLight}" stroke="${PALETTE.ink}" stroke-width="4"/>
    </g>
    <g transform="rotate(${-18 - flap} 165 140)">
      <ellipse cx="170" cy="140" rx="22" ry="34" fill="${PALETTE.owlBodyLight}" stroke="${PALETTE.ink}" stroke-width="4"/>
    </g>`;
}

function owlTufts(tilt = 0) {
  return `<g transform="rotate(${tilt} 110 110)">
    <path d="M78 68 Q72 40 90 58 Z" fill="${PALETTE.owlBody}" stroke="${PALETTE.ink}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M142 68 Q148 40 130 58 Z" fill="${PALETTE.owlBody}" stroke="${PALETTE.ink}" stroke-width="3.5" stroke-linejoin="round"/>
  </g>`;
}

function owlBody() {
  return `<ellipse cx="110" cy="125" rx="65" ry="68" fill="${PALETTE.owlBody}" stroke="${PALETTE.ink}" stroke-width="5"/>
    <ellipse cx="110" cy="140" rx="38" ry="42" fill="${PALETTE.owlCream}"/>`;
}

function owlBeak(open) {
  return open
    ? `<path d="M100 132 Q110 150 120 132 Q110 140 100 132 Z" fill="#F2A93B" stroke="${PALETTE.ink}" stroke-width="3"/>`
    : `<path d="M104 128 Q110 140 116 128 Z" fill="#F2A93B" stroke="${PALETTE.ink}" stroke-width="3"/>`;
}

const owlEyes = {
  idle: `<circle cx="85" cy="108" r="20" fill="${PALETTE.white}" stroke="${PALETTE.ink}" stroke-width="4"/><circle cx="85" cy="109" r="8" fill="${PALETTE.ink}"/>
         <circle cx="135" cy="108" r="20" fill="${PALETTE.white}" stroke="${PALETTE.ink}" stroke-width="4"/><circle cx="135" cy="109" r="8" fill="${PALETTE.ink}"/>`,
  talk: `<circle cx="85" cy="108" r="19" fill="${PALETTE.white}" stroke="${PALETTE.ink}" stroke-width="4"/><circle cx="86" cy="109" r="8" fill="${PALETTE.ink}"/>
         <circle cx="135" cy="108" r="19" fill="${PALETTE.white}" stroke="${PALETTE.ink}" stroke-width="4"/><circle cx="134" cy="109" r="8" fill="${PALETTE.ink}"/>`,
  happy: `<circle cx="85" cy="108" r="20" fill="${PALETTE.white}" stroke="${PALETTE.ink}" stroke-width="4"/><circle cx="85" cy="109" r="9" fill="${PALETTE.ink}"/>
          <circle cx="135" cy="108" r="20" fill="${PALETTE.white}" stroke="${PALETTE.ink}" stroke-width="4"/><circle cx="135" cy="109" r="9" fill="${PALETTE.ink}"/>
          <path d="M65 95 Q85 85 100 93" stroke="${PALETTE.ink}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.5"/>`,
  confused: `<circle cx="85" cy="112" r="19" fill="${PALETTE.white}" stroke="${PALETTE.ink}" stroke-width="4"/><circle cx="90" cy="112" r="8" fill="${PALETTE.ink}"/>
             <circle cx="135" cy="105" r="20" fill="${PALETTE.white}" stroke="${PALETTE.ink}" stroke-width="4"/><circle cx="130" cy="105" r="8" fill="${PALETTE.ink}"/>`,
  think: `<circle cx="85" cy="108" r="20" fill="${PALETTE.white}" stroke="${PALETTE.ink}" stroke-width="4"/><circle cx="85" cy="100" r="8" fill="${PALETTE.ink}"/>
          <circle cx="135" cy="108" r="20" fill="${PALETTE.white}" stroke="${PALETTE.ink}" stroke-width="4"/><circle cx="135" cy="100" r="8" fill="${PALETTE.ink}"/>`,
};

function owlExtras(pose) {
  if (pose === "confused") {
    return `<path d="M118 78 Q128 72 140 76" stroke="${PALETTE.ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
  }
  if (pose === "think") {
    return `<circle class="hero-think-bubble hero-think-bubble-1" cx="170" cy="55" r="4" fill="${PALETTE.owlCream}" stroke="${PALETTE.ink}" stroke-width="2"/>
            <circle class="hero-think-bubble hero-think-bubble-2" cx="180" cy="40" r="6" fill="${PALETTE.owlCream}" stroke="${PALETTE.ink}" stroke-width="2"/>`;
  }
  return "";
}

function owlSVG(pose = "idle") {
  const eyes = owlEyes[pose] || owlEyes.idle;
  const tilt = pose === "confused" ? -6 : 0;
  // owl has no closed-arc "happy" eyes (unlike fox) — safe to blink in
  // every pose. Beak gets the talk-flap loop, same idea as fox's mouth.
  const beakClass = pose === "talk" ? "hero-mouth-talk" : "";
  return svgWrap(`
    ${owlWings(pose)}
    ${owlBody()}
    ${owlTufts(tilt)}
    <g class="hero-eyes">${eyes}</g>
    <g class="${beakClass}">${owlBeak(pose === "talk")}</g>
    ${owlExtras(pose)}
  `);
}

// --- story-state -> {character, pose} mapping ---

const HERO_FOR_STATE = {
  fox_intro: { character: "fox", pose: "talk" },
  fox_question: { character: "fox", pose: "talk" },
  fox_correct: { character: "fox", pose: "happy" },
  fox_reask: { character: "fox", pose: "confused" },
  fox_reveal: { character: "fox", pose: "think" },
  owl_intro: { character: "owl", pose: "talk" },
  owl_question: { character: "owl", pose: "talk" },
  owl_correct: { character: "owl", pose: "happy" },
  owl_reask: { character: "owl", pose: "confused" },
  owl_reveal: { character: "owl", pose: "think" },
  ending: { character: "fox", pose: "happy" },
  parent_report: { character: "fox", pose: "idle" },
};

// Fox uses a real modular part-based rig (hand-illustrated cut-paper
// pieces: head/ears/body/arms/legs/tail, independently positioned) instead
// of the hand-coded SVG rig — parts are laid out on a fixed 320x430
// internal canvas, scaled to fit #heroStage via CSS (see index.html).
// Owl has no matching art yet, so it still falls back to the SVG rig.
const RIG = (part) => `/images/rig/rig_${part}.png`;

// {x, y, w, h} positions tuned by eye against the 320x430 canvas.
const FOX_RIG_LAYOUT = {
  tail: { x: 185, y: 230, w: 90, h: 90 },
  tail_tip: { x: 250, y: 250, w: 60, h: 62 },
  body: { x: 95, y: 150, w: 130, h: 218 },
  leg_front_l: { x: 65, y: 225, w: 48, h: 128 },
  leg_front_r: { x: 197, y: 225, w: 51, h: 128 },
  leg_back_l: { x: 88, y: 340, w: 49, h: 141 },
  leg_back_r: { x: 165, y: 340, w: 55, h: 143 },
  ear_l: { x: 78, y: 30, w: 62, h: 63 },
  ear_r: { x: 180, y: 30, w: 62, h: 63 },
  head: { x: 85, y: 70, w: 150, h: 94 },
  mouth: { x: 120, y: 133, w: 65, h: 23 },
};

function rigPiece(part, src, extraStyle = "", extraClass = "") {
  const { x, y, w, h } = FOX_RIG_LAYOUT[part];
  return `<img src="${src}" class="rig-part ${extraClass}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;${extraStyle}">`;
}

function foxRigHTML(pose) {
  const headSrc = pose === "think" ? RIG("head_closed") : RIG("head_open");
  const mouthClass = pose === "talk" ? "hero-mouth-talk" : "";
  return `<div class="rig-canvas">
    ${rigPiece("tail", RIG("tail"), "", "rig-tail")}
    ${rigPiece("tail_tip", RIG("tail_tip"), "", "rig-tail")}
    ${rigPiece("body", RIG("body"), "", "rig-body")}
    ${rigPiece("leg_front_l", RIG("leg_front_l"), "transform-origin:top center;", "rig-arm-l")}
    ${rigPiece("leg_front_r", RIG("leg_front_r"), "transform-origin:top center;", "rig-arm-r")}
    ${rigPiece("leg_back_l", RIG("leg_back_l"))}
    ${rigPiece("leg_back_r", RIG("leg_back_r"))}
    ${rigPiece("ear_l", RIG("ear_l"), "", "rig-ear-l")}
    ${rigPiece("ear_r", RIG("ear_r"), "", "rig-ear-r")}
    ${rigPiece("head", headSrc, "", "rig-head")}
    ${rigPiece("mouth", RIG("mouth"), "", mouthClass)}
  </div>`;
}

// GSAP-driven motion: desynchronized durations/delays and spring-ish
// easing per part, instead of identical CSS keyframes ticking in lockstep
// (which is exactly what reads as robotic/"zombie"). Re-run after every
// heroStage.innerHTML swap since the old animated nodes are discarded.
function animateFoxRig(root, pose) {
  if (typeof gsap === "undefined") return; // CDN blocked/offline — static rig still works fine
  const body = root.querySelector(".rig-body");
  const head = root.querySelector(".rig-head");
  const armL = root.querySelector(".rig-arm-l");
  const armR = root.querySelector(".rig-arm-r");
  const earL = root.querySelector(".rig-ear-l");
  const earR = root.querySelector(".rig-ear-r");
  const tails = root.querySelectorAll(".rig-tail");

  gsap.set(earL, { rotation: -8, transformOrigin: "80% 90%" });
  gsap.set(earR, { rotation: 8, transformOrigin: "20% 90%" });
  gsap.set(head, { transformOrigin: "50% 100%" });
  gsap.set(tails, { transformOrigin: "15% 20%" });

  // continuous idle life, always running underneath whatever the pose does
  gsap.to(body, { y: -5, duration: 1.7, ease: "sine.inOut", yoyo: true, repeat: -1 });
  gsap.to(head, { rotation: 2, duration: 2.1, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 0.15 });
  gsap.to(tails, { rotation: "+=9", duration: 1.9, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 0.3 });
  gsap.to(earR, { rotation: "+=6", duration: 2.6, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 0.2 });

  if (pose === "talk") {
    gsap.to(armL, { rotation: -10, duration: 0.28, ease: "power1.inOut", yoyo: true, repeat: -1 });
    gsap.to(armR, { rotation: 10, duration: 0.28, ease: "power1.inOut", yoyo: true, repeat: -1, delay: 0.14 });
    gsap.to(earL, { rotation: "-=5", duration: 2.4, ease: "sine.inOut", yoyo: true, repeat: -1 });
  } else if (pose === "happy") {
    gsap.to(armL, { rotation: -55, duration: 0.45, ease: "back.out(2.5)", yoyo: true, repeat: -1 });
    gsap.to(armR, { rotation: 55, duration: 0.45, ease: "back.out(2.5)", yoyo: true, repeat: -1, delay: 0.1 });
    gsap.to(earL, { rotation: "-=10", duration: 0.45, ease: "back.out(2)", yoyo: true, repeat: -1 });
  } else if (pose === "confused") {
    gsap.to(earL, { rotation: -30, duration: 1.5, ease: "sine.inOut", yoyo: true, repeat: -1 });
    gsap.to(armL, { rotation: -12, duration: 1.8, ease: "sine.inOut", yoyo: true, repeat: -1 });
  } else if (pose === "think") {
    gsap.to(armR, { rotation: 40, y: -18, duration: 1.4, ease: "sine.inOut", yoyo: true, repeat: -1 });
    gsap.to(earL, { rotation: "-=5", duration: 2.4, ease: "sine.inOut", yoyo: true, repeat: -1 });
  }
}

function renderHero(stateId) {
  const h = HERO_FOR_STATE[stateId] || { character: "fox", pose: "idle" };
  if (h.character === "owl") return owlSVG(h.pose);
  return foxRigHTML(h.pose);
}
