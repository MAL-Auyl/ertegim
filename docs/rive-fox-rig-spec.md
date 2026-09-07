# Fox hero — Rive rig spec

Target: replace the current video-chromakey + GSAP whole-image fox
(`public/characters.js`: `FOX_POSE_VIDEO` / `animateFoxPose`) with one
`.riv` file, bone-rigged from cut-out parts, driven by a state machine.
Matches the animation approach already committed in `IDEA.md`
("Персонаж — риг в Rive/Lottie с 4-5 состояниями... Рот двигается по
амплитуде TTS-аудио").

Built in the Rive editor (rive.app) — this doc is the contract the
`.riv` file has to satisfy so `public/characters.js` (`mountFoxRive`)
can drive it without any code changes once it lands at
`public/rive/fox.riv`.

## 1. Parts to import

Cut-out PNGs, transparent background, one bone/board each. Existing
set in `public/images/rig/` is the older 4-legged version; use it only
for parts that map directly. Reference art (the sheet you're building
from) has richer, more posable parts — import at these roles:

| Rive layer name | Source part | Notes |
|---|---|---|
| `body` | body teardrop | root bone anchors here |
| `chest` | cream belly patch | pinned to `body`, no independent bone needed |
| `head_open` | head w/ open eyes baked in | swapped for `head_closed` on blink — see §3 |
| `head_closed` | head w/ closed-eye arcs | same silhouette/anchor point as `head_open`, so the swap doesn't jump |
| `ear_l`, `ear_r` | separate ears | own bone each, parented to `head` bone, for the perk-on-happy / droop-on-confused motion |
| `mouth` | separate mouth shape | parented to `head`, driven by `talkLevel` (§4) — keep as its own layer even though `head_open`/`head_closed` also carry a mouth, so it can move independently of the blink swap |
| `arm_l`, `arm_r` | bent arm w/ hand | 2-bone chain each (shoulder→elbow→hand) for gesture poses |
| `leg_l`, `leg_r` | paw/foot | single bone each, mostly for idle weight-shift, not big motion |
| `tail` | large fringed tail | 2-3 bone chain (base→mid→tip) for wag/secondary motion |
| `tail_tip` | small tip overlay | parented to the last tail bone if not merged into the tail chain |

Pivot points: put each bone's origin at the joint that part rotates
from in real anatomy (shoulder for arms, base for ears/tail, jaw
hinge for mouth) — not the shape's bounding-box center. This is what
makes IK/rotation read as a joint instead of a floating sticker.

## 2. Bone hierarchy

```
root
└─ body
   ├─ chest (no bone, pinned)
   ├─ head
   │  ├─ ear_l
   │  ├─ ear_r
   │  ├─ mouth
   ├─ arm_l (shoulder → elbow → hand)
   ├─ arm_r (shoulder → elbow → hand)
   ├─ leg_l
   ├─ leg_r
   └─ tail (base → mid → tip)
```

`head_open`/`head_closed` are two full-head layers switched by
visibility (not bones) — everything else on the head (ears, mouth)
stays mounted on a single `head` bone so it doesn't need to jump
between two skeletons when blinking.

## 3. Animations (timelines)

One looping timeline per state, all built off the same bone rig so
they blend cleanly in the state machine:

- **idle** — breathing (body scale ~1.00→1.02, 2.4s ease-in-out
  loop), ears at rest with a slight independent sway (offset phase
  from the body so it doesn't read as one rigid unit), tail slow
  wag, occasional blink (`head_open`→`head_closed`→`head_open`,
  ~120ms closed, random-ish 3-5s interval — fine to hand-place 2-3
  blinks in a 6-8s loop that repeats).
- **talk** — same idle body motion as a base, plus a subtle
  forward head bob and one hand gesture (small rise/fall on `arm_r`)
  so talking has body language, not just a moving mouth. Mouth itself
  is *not* baked into this timeline's main drive — see §4, talkLevel
  overrides mouth openness live.
- **happy** — ears perk up (rotate outward/up from rest), tail wag
  speeds up and widens, both arms rise (small "ta-da"/wave gesture),
  body does one bigger bounce (scale + a few px lift) then settles —
  give this one real squash-and-stretch, it's the emotional payoff
  beat.
- **confused** — head tilt (rotate 6-8°), one ear droops, tail stops
  wagging (or wags slower/lower), a small back-and-forth weight
  shift on the body (uncertainty, not distress).
- **think** — head tilts up/away, one arm bone raised near the chin
  (paw-to-chin gesture if the hand shape supports it, otherwise a
  raised arm reads fine), slower/stiller body than idle, eyes could
  look up if the eye layer supports it — optional, skip if it adds
  rig complexity you don't have time for before the 10.09 deadline.

Squash-and-stretch and secondary motion (ears/tail lagging half a
beat behind the body) are what make this read as "alive" instead of
a slideshow of poses — worth spending polish time on `happy` and
`idle` specifically, since those are seen the most (idle is the
default/rest state, happy is the reward moment).

## 4. State machine — `HeroSM`

Two inputs, both **Number** (Rive has no enum input type):

| Input | Range | Meaning |
|---|---|---|
| `pose` | `0`=idle, `1`=talk, `2`=happy, `3`=confused, `4`=think | discrete pose selection — driven from `HERO_FOR_STATE` in `characters.js` on every story-state change |
| `talkLevel` | `0.0`–`1.0` | continuous, fed every animation frame from the hero's own TTS audio RMS while it's playing (see `app.js`'s talk-level loop) — **not** tied to the `talk` pose only; it's always being written, just near-zero outside of speech |

**States**, one per pose value, connected by transitions gated on
`pose` (e.g. `pose == 1` → Talk state), default entry = Idle:

```
        pose==1              pose==2
Idle ───────────► Talk    Idle ───────────► Happy
  ▲                 │        ▲                 │
  └── pose==0 ───────┘        └── pose==0 ──────┘
        (same pattern for pose==3 → Confused, pose==4 → Think)
```

Any state can transition directly to any other on the matching
`pose` value (not forced through Idle) — set transition duration to
150-250ms with an ease so pose swaps blend instead of snapping,
except Idle→Happy which can be quicker/punchier (100ms) since that's
a reaction, not a drift.

**Mouth drive:** inside every state (or as a global layer that
applies on top — check whichever your Rive version makes easier),
add a **1D Blend State** or a direct bone-rotation binding on the
`mouth` bone's Y-scale/rotation, driven by the `talkLevel` input:
`talkLevel=0` → mouth layer matches the closed/neutral pose already
baked into that state's timeline; `talkLevel=1` → mouth fully open.
This is the "viseme" IDEA.md describes — it's not lip-sync to
phonemes, just amplitude-driven open/close, which is enough for a
3-7yo audience and works with any TTS voice without per-phoneme data.

## 5. Export

- Artboard name: `Fox` (any size — `characters.js` doesn't read
  artboard dimensions, canvas sizing is CSS-driven).
- File: `public/rive/fox.riv`.
- State machine name must be exactly `HeroSM`, input names exactly
  `pose` and `talkLevel` — `mountFoxRive` in `characters.js` looks
  these up by name and silently falls back to the pre-Rive renderer
  if they're missing, so a typo here just means Rive quietly never
  activates rather than an error you'd see.

## 6. What's out of scope for this pass

- The owl stays hand-coded SVG — no rig for it yet. Same `HeroSM`
  approach could apply later if the owl gets pulled into Rive too,
  but that's a separate rig/asset job.
- Phoneme-accurate lip-sync — amplitude-driven mouth openness only
  (§4). Real viseme mapping would need per-phoneme timing data Piper
  doesn't give you.
- Eye look-direction / pupil tracking — mentioned as optional under
  `think` in §3, skip it if it costs more than an hour; it's not
  load-bearing for the demo.
