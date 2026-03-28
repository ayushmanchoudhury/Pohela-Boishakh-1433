'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import InvitationCard, { CARD_W, CARD_H } from './InvitationCard'

// ─────────────────────────────────────────────────────────────────────────────
// Stage machine: closed → open → (900ms) → slide → (1900ms) → expanded ↔ flipped
// ─────────────────────────────────────────────────────────────────────────────
type Stage = 'closed' | 'open' | 'slide' | 'expanded' | 'flipped'

const ENV_W = 640
const ENV_H = 380
const FLAP_FRAC = 0.43
const FLAP_H = Math.round(ENV_H * FLAP_FRAC) // 163px

// Card natural top = 380 - 6 - 342 = 32px from envelope top.
// At y=110 (translate), card top = 142px (21px above 163px apex → subtle peek).
// At y=140, card top = 172px (9px below apex → fully hidden by pocket mask).
const CARD_ANCHOR_BOTTOM = 6

const IVORY      = '#dfe9db'
const IVORY_DARK = '#cdddc9'

export default function Envelope() {
  const [stage, setStage] = useState<Stage>('closed')
  const [mounted, setMounted] = useState(false)
  const [muted, setMuted] = useState(false)
  const [audioStarted, setAudioStarted] = useState(false)
  const [sealBroken, setSealBroken] = useState(false)
  const [language, setLanguage] = useState<'en' | 'bn'>('bn')
  const audioRef = useRef<HTMLAudioElement>(null)

  // ── Responsive scaling ────────────────────────────────────────────────────
  // Both values start at their SSR-safe defaults (matching the server render)
  // and are updated in useEffect, which only runs on the client after
  // hydration. This prevents the server/client mismatch that causes the
  // "hydration error: transform: scale(1) vs scale(0.55)" warning.
  const [envScale,        setEnvScale]        = useState(1)
  const [cardPortalScale, setCardPortalScale] = useState(1.75)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      setEnvScale(Math.min(1, (vw - 24) / ENV_W))
      setCardPortalScale(Math.max(0.45, Math.min(1.75, (vw - 32) / CARD_W, (vh * 0.78) / CARD_H)))
    }
    update()  // apply correct scale immediately after hydration
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Seal rips off first (320ms), then flap opens
  const SEAL_DELAY = 320

  const handleEnvelopeClick = () => {
    if (stage !== 'closed') return
    setSealBroken(true)
    if (!audioStarted) {
      setAudioStarted(true)
      audioRef.current?.play().catch(() => {})
    }
    setTimeout(() => setStage('open'),                  SEAL_DELAY)
    setTimeout(() => setStage('slide'),    SEAL_DELAY + 900)
    setTimeout(() => setStage('expanded'), SEAL_DELAY + 2700)
  }

  const handleCardClick = () => {
    if (stage === 'expanded') setStage('flipped')
    if (stage === 'flipped')  setStage('expanded')
  }

  const handleReplay = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setStage('closed')
    setSealBroken(false)
    setAudioStarted(false)
    setMuted(false)
  }

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !muted
      setMuted(m => !m)
    }
  }

  const handleLanguageSwitch = () => {
    const newLang = language === 'en' ? 'bn' : 'en'
    setLanguage(newLang)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setStage('closed')
    setSealBroken(false)
    setAudioStarted(false)
    setMuted(false)
    // Auto-reopen after a brief pause so the reset is visible
    setTimeout(() => {
      setSealBroken(true)
      setAudioStarted(true)
      audioRef.current?.play().catch(() => {})
      setTimeout(() => setStage('open'),     SEAL_DELAY)
      setTimeout(() => setStage('slide'),    SEAL_DELAY + 900)
      setTimeout(() => setStage('expanded'), SEAL_DELAY + 2700)
    }, 500)
  }

  const flapOpen = stage !== 'closed'

  const flapClipFront = 'polygon(0 0, 100% 0, 50% 100%)'
  const flapClipBack  = 'polygon(0 100%, 100% 100%, 50% 0%)'
  const faceClip      = `polygon(0 0, 50% ${FLAP_FRAC * 100}%, 100% 0, 100% 100%, 0 100%)`

  // Interior fold crease convergence
  const CX = ENV_W * 0.5
  const CY = ENV_H * 0.56

  return (
    <>
      {/* Viewport-scale wrapper — scales the entire envelope scene uniformly
          so it fits on any screen without touching the animation logic.
          transform-origin: center keeps the envelope visually centred. */}
      <div style={{ display: 'inline-block', transform: `scale(${envScale})`, transformOrigin: 'center center' }}>
      <motion.div
        animate={{ scale: stage === 'closed' || stage === 'open' ? 0.88 : 1 }}
        transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        style={{ display: 'inline-block', willChange: 'transform' }}
      >
        <div style={{ position: 'relative', width: ENV_W, height: ENV_H }}>

          {/* ── CARD CONTAINER ────────────────────────────────────────────────
              Single container that holds the card for the entire open→slide
              sequence. z=9 places it above the front face (z=5) so the card
              can emerge over the envelope.

              The pocket mask (z=10, clipPath: faceClip) sits above this
              container and re-paints the ivory face region on top, so the card
              is only visible through the V-notch gap while it is still inside.
              As the card rises, more of it clears the top edge of the envelope
              (above y=0) where no mask exists.

              overflow:hidden clips the card at the envelope bottom so it never
              bleeds below the envelope silhouette.

              A SINGLE motion.div with key="card-main" persists across both the
              'open' and 'slide' stages. In 'open' it fades in at y=110. When
              stage becomes 'slide', framer-motion re-targets from the current
              position (y=110) directly to y=−230 — no remount, no jump.      */}
          <div style={{
            position: 'absolute',
            left: 0, right: 0,
            top: -500, bottom: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 9,
          }}>
            <AnimatePresence>
              {(stage === 'open' || stage === 'slide') && (
                <motion.div
                  key="card-main"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    x: '-50%',
                    bottom: CARD_ANCHOR_BOTTOM,
                    willChange: 'transform, opacity',
                  }}
                  initial={{ y: 110, opacity: 0 }}
                  animate={{
                    y: stage === 'slide' ? -230 : 110,
                    opacity: 1,
                  }}
                  exit={{ opacity: 0, transition: { duration: 0.3 } }}
                  transition={stage === 'slide'
                    ? { y: { duration: 1.8, ease: [0.4, 0.02, 0.25, 1] } }
                    : { opacity: { duration: 0.2, delay: 0.55 }, y: { duration: 0 } }
                  }
                >
                  <InvitationCard isFlipped={false} onClick={() => {}} language={language} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── ENVELOPE BODY ─────────────────────────────────────────────── */}
          <div
            onClick={handleEnvelopeClick}
            style={{
              position: 'absolute', inset: 0,
              cursor: stage === 'closed' ? 'pointer' : 'default',
              touchAction: 'manipulation',
            }}
          >

            {/* Drop shadow */}
            <div style={{
              position: 'absolute',
              bottom: -18, left: '8%', right: '8%', height: 28,
              background: 'radial-gradient(ellipse, rgba(0,0,0,0.22) 0%, transparent 68%)',
              zIndex: 0, pointerEvents: 'none',
            }} />

            {/* z=1: Interior base — warm parchment */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(165deg, #bfcfbc 0%, #b7c8b4 45%, #b0c1ad 100%)',
              borderRadius: 3,
              zIndex: 1,
              boxShadow: '0 12px 44px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.10)',
            }} />

            {/* z=2: Fine diagonal texture */}
            <div style={{
              position: 'absolute', inset: 0,
              borderRadius: 3,
              zIndex: 2, pointerEvents: 'none',
              background: [
                'repeating-linear-gradient(-45deg, rgba(255,255,255,0.028) 0px, rgba(255,255,255,0.028) 1px, transparent 1px, transparent 8px)',
                'repeating-linear-gradient( 45deg, rgba(0,0,0,0.012) 0px, rgba(0,0,0,0.012) 1px, transparent 1px, transparent 8px)',
              ].join(', '),
            }} />

            {/* z=3: Panel shading, fold lines, pocket depth */}
            <svg
              style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}
              width={ENV_W} height={ENV_H}
              viewBox={`0 0 ${ENV_W} ${ENV_H}`}
            >
              {/* Left and right side panels — slightly lighter */}
              <polygon points={`0,0 ${CX},${CY} 0,${ENV_H}`}               fill="rgba(255,255,255,0.05)" />
              <polygon points={`${ENV_W},0 ${CX},${CY} ${ENV_W},${ENV_H}`} fill="rgba(255,255,255,0.05)" />
              {/* Bottom panel — slightly darker */}
              <polygon points={`0,${ENV_H} ${CX},${CY} ${ENV_W},${ENV_H}`} fill="rgba(0,0,0,0.028)" />

              {/* Fold crease lines */}
              <line x1={0}     y1={ENV_H} x2={CX} y2={CY} stroke="rgba(0,0,0,0.10)" strokeWidth="0.85" />
              <line x1={ENV_W} y1={ENV_H} x2={CX} y2={CY} stroke="rgba(0,0,0,0.10)" strokeWidth="0.85" />
              <line x1={0}     y1={0}     x2={CX} y2={CY} stroke="rgba(0,0,0,0.06)" strokeWidth="0.7" />
              <line x1={ENV_W} y1={0}     x2={CX} y2={CY} stroke="rgba(0,0,0,0.06)" strokeWidth="0.7" />

              {/* Pocket depth shadow — soft ellipse where card sits */}
              <ellipse cx={CX} cy={CY + 14} rx={ENV_W * 0.28} ry={ENV_H * 0.10}
                fill="rgba(0,0,0,0.060)" />
              <ellipse cx={CX} cy={CY + 8}  rx={ENV_W * 0.16} ry={ENV_H * 0.055}
                fill="rgba(0,0,0,0.040)" />

              {/* Soft vignette along left/right interior edges */}
              <rect x={0} y={0} width={18} height={ENV_H}
                fill="url(#leftVig)" />
              <rect x={ENV_W - 18} y={0} width={18} height={ENV_H}
                fill="url(#rightVig)" />

              <defs>
                <linearGradient id="leftVig" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(0,0,0,0.06)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                </linearGradient>
                <linearGradient id="rightVig" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(0,0,0,0)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0.06)" />
                </linearGradient>
              </defs>
            </svg>

            {/* z=5: Exterior front face (ivory, V-notch clip) */}
            <div style={{
              position: 'absolute', inset: 0,
              background: IVORY,
              clipPath: faceClip,
              zIndex: 5,
            }} />

            {/* z=6: Front face lighting */}
            <div style={{
              position: 'absolute', inset: 0,
              clipPath: faceClip,
              zIndex: 6, pointerEvents: 'none',
              background: [
                'linear-gradient(138deg, rgba(255,255,255,0.10) 0%, transparent 52%)',
                'linear-gradient(0deg,   rgba(0,0,0,0.050) 0%, transparent 30%)',
                'linear-gradient(90deg,  rgba(0,0,0,0.030) 0%, transparent 20%)',
                'linear-gradient(270deg, rgba(0,0,0,0.022) 0%, transparent 20%)',
              ].join(', '),
            }} />

            {/* z=7: Paper-edge hairline */}
            <svg
              style={{ position: 'absolute', inset: 0, zIndex: 7, pointerEvents: 'none' }}
              width={ENV_W} height={ENV_H}
              viewBox={`0 0 ${ENV_W} ${ENV_H}`}
            >
              <polyline
                points={`0,0 ${ENV_W * 0.5},${FLAP_H} ${ENV_W},0`}
                fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="0.7"
              />
              <rect x={0.4} y={0} width={ENV_W - 0.8} height={ENV_H - 0.4}
                fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="0.7" rx="3" />
            </svg>

            {/* z=8: Monogram lozenge */}
            <svg
              style={{ position: 'absolute', inset: 0, zIndex: 8, pointerEvents: 'none' }}
              width={ENV_W} height={ENV_H}
              viewBox={`0 0 ${ENV_W} ${ENV_H}`}
            >
              <polygon
                points={`${ENV_W/2},${ENV_H*0.68-14} ${ENV_W/2+14},${ENV_H*0.68} ${ENV_W/2},${ENV_H*0.68+14} ${ENV_W/2-14},${ENV_H*0.68}`}
                fill="none" stroke={IVORY_DARK} strokeWidth="1"
              />
              <polygon
                points={`${ENV_W/2},${ENV_H*0.68-8} ${ENV_W/2+8},${ENV_H*0.68} ${ENV_W/2},${ENV_H*0.68+8} ${ENV_W/2-8},${ENV_H*0.68}`}
                fill="none" stroke={IVORY_DARK} strokeWidth="0.5" opacity="0.55"
              />
            </svg>

            {/* z=10: Pocket mask — ivory layer hides card while inside envelope */}
            <div style={{
              position: 'absolute', inset: 0,
              clipPath: faceClip,
              zIndex: 10, pointerEvents: 'none',
              backgroundColor: IVORY,
              backgroundImage: [
                'linear-gradient(138deg, rgba(255,255,255,0.10) 0%, transparent 52%)',
                'linear-gradient(0deg,   rgba(0,0,0,0.050) 0%, transparent 30%)',
                'linear-gradient(90deg,  rgba(0,0,0,0.030) 0%, transparent 20%)',
                'linear-gradient(270deg, rgba(0,0,0,0.022) 0%, transparent 20%)',
              ].join(', '),
            }} />

            {/* z=11: Pocket-mouth shadow (fades in as flap opens) */}
            <motion.div
              style={{
                position: 'absolute', inset: 0,
                clipPath: faceClip,
                zIndex: 11, pointerEvents: 'none',
                background: 'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, transparent 22%)',
                willChange: 'opacity',
              }}
              animate={{ opacity: flapOpen ? 1 : 0 }}
              transition={{ duration: 0.35, delay: flapOpen ? 0.28 : 0 }}
            />

            {/* z=12: V-crease lines (fade out when flap opens) */}
            <motion.svg
              style={{ position: 'absolute', inset: 0, zIndex: 12, pointerEvents: 'none', willChange: 'opacity' }}
              width={ENV_W} height={ENV_H}
              viewBox={`0 0 ${ENV_W} ${ENV_H}`}
              animate={{ opacity: flapOpen ? 0 : 1 }}
              transition={{ duration: 0.15 }}
            >
              <line x1={0}     y1={0} x2={ENV_W * 0.5} y2={FLAP_H}
                stroke="rgba(0,0,0,0.14)" strokeWidth="0.85" />
              <line x1={ENV_W} y1={0} x2={ENV_W * 0.5} y2={FLAP_H}
                stroke="rgba(0,0,0,0.14)" strokeWidth="0.85" />
            </motion.svg>

            {/* z=13 (closed) / z=7 (open): Flap */}
            <div style={{
              position: 'absolute',
              top: 0, left: 0, right: 0,
              height: FLAP_H,
              perspective: '900px',
              perspectiveOrigin: '50% 0%',
              zIndex: flapOpen ? 7 : 13,
            }}>
              <motion.div
                style={{
                  width: '100%', height: '100%',
                  transformOrigin: 'top center',
                  transformStyle: 'preserve-3d',
                  willChange: 'transform',
                }}
                animate={{ rotateX: flapOpen ? -162 : 0 }}
                transition={{ duration: 0.82, ease: [0.4, 0, 0.2, 1] }}
              >
                {/* Flap front face */}
                <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, background: IVORY, clipPath: flapClipFront }} />
                  <div style={{
                    position: 'absolute', inset: 0, clipPath: flapClipFront, pointerEvents: 'none',
                    background: [
                      'linear-gradient(160deg, rgba(255,255,255,0.09) 0%, transparent 55%)',
                      'linear-gradient(180deg, rgba(0,0,0,0.04) 0%, transparent 45%)',
                      'linear-gradient(90deg,  rgba(0,0,0,0.03) 0%, transparent 35%)',
                      'linear-gradient(270deg, rgba(0,0,0,0.02) 0%, transparent 35%)',
                    ].join(', '),
                  }} />
                </div>

                {/* Flap back face — interior of the flap */}
                <div style={{ position: 'absolute', inset: 0, transform: 'rotateX(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>

                  {/* Base interior paper color */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(160deg, #c4d4c1 0%, #bccbb8 50%, #b9c8b5 100%)',
                    clipPath: flapClipBack,
                  }} />

                  {/* Fine texture */}
                  <div style={{
                    position: 'absolute', inset: 0, clipPath: flapClipBack, pointerEvents: 'none',
                    background: [
                      'repeating-linear-gradient(-45deg, rgba(255,255,255,0.022) 0px, rgba(255,255,255,0.022) 1px, transparent 1px, transparent 8px)',
                      'repeating-linear-gradient( 45deg, rgba(0,0,0,0.010) 0px, rgba(0,0,0,0.010) 1px, transparent 1px, transparent 8px)',
                    ].join(', '),
                  }} />

                  {/* Subtle shading — slight darkening toward hinge edge */}
                  <div style={{
                    position: 'absolute', inset: 0, clipPath: flapClipBack, pointerEvents: 'none',
                    background: [
                      'linear-gradient(0deg, rgba(0,0,0,0.055) 0%, transparent 60%)',
                      'radial-gradient(ellipse 80% 65% at 50% 20%, rgba(255,255,255,0.06) 0%, transparent 100%)',
                    ].join(', '),
                  }} />

                  {/* ── Gum seal — adhesive strips along both slanted side edges.
                      Back face coords: y=0 = visual TOP (sealing tip),
                      y=163 = visual BOTTOM (hinge). Triangle: (320,0),(0,163),(640,163).
                      Left strip:  ~14px inward from the left edge  (320,0)→(0,163).
                      Right strip: ~14px inward from the right edge (320,0)→(640,163).
                      Inward offsets computed from edge perpendiculars (see below).
                      Left  inward normal of (-320,163): (+163,+320)/359 * 14 ≈ (+6.4,+12.5)
                      Right inward normal of (+320,163): (-163,+320)/359 * 14 ≈ (-6.4,+12.5) */}
                  <svg
                    style={{ position: 'absolute', inset: 0, pointerEvents: 'none', clipPath: flapClipBack }}
                    width={ENV_W} height={FLAP_H}
                    viewBox={`0 0 ${ENV_W} ${FLAP_H}`}
                  >
                    <defs>
                      <linearGradient id="gumLeft" x1="1" y1="0" x2="0" y2="0">
                        <stop offset="0%"   stopColor="rgba(255,252,228,0.78)" />
                        <stop offset="100%" stopColor="rgba(255,252,228,0.18)" />
                      </linearGradient>
                      <linearGradient id="gumRight" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%"   stopColor="rgba(255,252,228,0.78)" />
                        <stop offset="100%" stopColor="rgba(255,252,228,0.18)" />
                      </linearGradient>
                    </defs>
                    {/* Left side strip: outer edge (320,0)→(0,163), inner offset ~14px */}
                    <polygon points={`320,0 0,163 7,163 326,13`}
                      fill="url(#gumLeft)" />
                    <line x1={320} y1={0} x2={0} y2={163}
                      stroke="rgba(255,255,255,0.55)" strokeWidth="1.0" />
                    {/* Right side strip: outer edge (320,0)→(640,163), inner offset ~14px */}
                    <polygon points={`320,0 640,163 633,163 314,13`}
                      fill="url(#gumRight)" />
                    <line x1={320} y1={0} x2={640} y2={163}
                      stroke="rgba(255,255,255,0.55)" strokeWidth="1.0" />
                  </svg>

                </div>
              </motion.div>
            </div>

          </div>{/* envelope body */}

          {/* ── WAX SEAL ────────────────────────────────────────────────────────
              Lives OUTSIDE the flap's 3D transform so it doesn't rotate with
              the flap. Centred at y=FLAP_H (the exact apex of the triangle),
              so it straddles the junction: top half overlaps the flap tip,
              bottom half overlaps the envelope body — like a real wax seal.
              z=14 places it above the closed flap (z=13).
              On click: scale up + rotate + fly off in 0.26s, then the flap
              opens 320ms later.                                                */}
          <AnimatePresence>
            {!sealBroken && (
              <motion.div
                style={{
                  position: 'absolute',
                  top: FLAP_H - 18,   // seal centre sits exactly at y=FLAP_H
                  left: '50%',
                  x: '-50%',
                  zIndex: 14,
                  pointerEvents: 'none',
                  cursor: 'default',
                  willChange: 'transform, opacity',
                }}
                initial={{ scale: 1, opacity: 1 }}
                exit={{
                  scale: 1.55,
                  opacity: 0,
                  rotate: -18,
                  y: -28,
                  x: '-38%',
                  transition: { duration: 0.26, ease: [0.4, 0, 1, 1] },
                }}
              >
                <svg width={36} height={36} viewBox="0 0 36 36" overflow="visible"
                  style={{ filter: 'drop-shadow(0px 2px 2.5px rgba(0,0,0,0.30))' }}>
                  <defs>
                    <radialGradient id="sealGrad" cx="38%" cy="32%" r="65%">
                      <stop offset="0%"   stopColor="#d64040" />
                      <stop offset="100%" stopColor="#8b1a1a" />
                    </radialGradient>
                  </defs>
                  <circle cx={18} cy={18} r={17} fill="url(#sealGrad)" opacity="0.94" />
                  <circle cx={18} cy={18} r={12} fill="none" stroke="rgba(255,215,205,0.45)" strokeWidth="1.1" />
                  <text
                    x={18} y={22}
                    textAnchor="middle" fontSize="10"
                    fill="rgba(255,240,234,0.84)"
                    fontFamily="'Hind Siliguri','Noto Sans Bengali',Georgia,serif"
                  >ওঁ</text>
                </svg>
              </motion.div>
            )}
          </AnimatePresence>


        </div>
      </motion.div>
      </div>{/* end viewport-scale wrapper */}

      {/* Click-to-open hint — lives outside the scale wrapper so it stays
          readable on mobile. Vertical position tracks the scaled envelope. */}
      <AnimatePresence>
        {stage === 'closed' && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ delay: 0.6, duration: 0.55 }}
            style={{
              position: 'fixed',
              top: `calc(50vh + ${Math.round(ENV_H * envScale * 0.88 / 2) + 20}px)`,
              left: 0,
              right: 0,
              textAlign: 'center',
              margin: 0,
              color: 'rgba(98,86,70,0.72)',
              fontSize: 'clamp(11px, 3.5vw, 15px)',
              letterSpacing: '0.18em',
              paddingLeft: '0.20em', // compensate trailing letter-spacing so it looks optically centred
              textTransform: 'uppercase',
              fontFamily: 'Georgia, "Times New Roman", serif',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            Click to open
          </motion.p>
        )}
      </AnimatePresence>

      {/* ── Expanded card overlay (portal) ──────────────────────────────────── */}
      {/* Hidden audio player */}
      <audio ref={audioRef} src="/Eso%20Eso%20He%20Boishakh%20(Rabindra%20Sangeet)%20Piano%20Tutorial%20by%20Arup%20Paul.mp3" loop preload="none" />

      {/* Bottom-right stack: language toggle (top) + mute (bottom) */}
      {audioStarted && (
        <div style={{
          position: 'fixed',
          bottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
          right: 'max(16px, env(safe-area-inset-right, 16px))',
          zIndex: 600,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}>
          {/* Language button — on top of mute */}
          <motion.button
            onClick={handleLanguageSwitch}
            aria-label={language === 'bn' ? 'Switch to English' : 'Switch to Bangla'}
            whileHover={{ scale: 1.06, boxShadow: '0 4px 18px rgba(0,0,0,0.12)' }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.18 }}
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 18,
              border: '1px solid rgba(120,150,115,0.30)',
              background: 'rgba(238,244,237,0.82)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center',
              outline: 'none',
              boxShadow: '0 2px 14px rgba(0,0,0,0.09)',
              color: 'rgba(55,80,50,0.75)',
              fontSize: 'clamp(11px, 3vw, 13px)',
              letterSpacing: '0.08em',
              fontFamily: language === 'en'
                ? "'Hind Siliguri', 'Noto Sans Bengali', Georgia, serif"
                : 'Georgia, "Times New Roman", serif',
              touchAction: 'manipulation',
              whiteSpace: 'nowrap',
            }}
          >
            {language === 'bn' ? 'English' : 'বাংলা'}
          </motion.button>

          {/* Mute button */}
          <motion.button
            onClick={toggleMute}
            aria-label={muted ? 'Unmute music' : 'Mute music'}
            whileHover={{ scale: 1.06, boxShadow: '0 4px 18px rgba(0,0,0,0.12)' }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.18 }}
            style={{
              width: 46, height: 46,
              borderRadius: '50%',
              border: '1px solid rgba(120,150,115,0.30)',
              background: 'rgba(238,244,237,0.82)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
              outline: 'none',
              boxShadow: '0 2px 14px rgba(0,0,0,0.09)',
              color: 'rgba(55,80,50,0.75)',
              touchAction: 'manipulation',
            }}
          >
            {muted ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </motion.button>
        </div>
      )}

      {/* Replay button — appears after the full sequence completes */}
      <AnimatePresence>
        {(stage === 'expanded' || stage === 'flipped') && (
          <motion.button
            onClick={handleReplay}
            aria-label="Replay invitation"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.6, ease: 'easeInOut' } }}
            transition={{
              opacity: { duration: 0.45, delay: 0.8 },
              y: { duration: 0.45, delay: 0.8 },
            }}
            whileHover={{ scale: 1.03, boxShadow: '0 4px 18px rgba(0,0,0,0.12)', transition: { duration: 0.2, ease: 'easeOut' } }}
            whileTap={{ scale: 0.97, transition: { duration: 0.12, ease: 'easeOut' } }}
            style={{
              position: 'fixed',
              bottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
              left: 'max(16px, env(safe-area-inset-left, 16px))',
              zIndex: 600,
              height: 42,
              padding: '0 20px',
              borderRadius: 21,
              border: '1px solid rgba(120,150,115,0.30)',
              background: 'rgba(238,244,237,0.82)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              outline: 'none',
              boxShadow: '0 2px 14px rgba(0,0,0,0.09)',
              color: 'rgba(55,80,50,0.75)',
              fontSize: 'clamp(11px, 3vw, 14px)',
              letterSpacing: '0.13em',
              textTransform: 'uppercase',
              fontFamily: 'Georgia, "Times New Roman", serif',
              touchAction: 'manipulation',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-4.5" />
            </svg>
            Replay
          </motion.button>
        )}
      </AnimatePresence>

      {mounted && createPortal(
        <AnimatePresence>
          {(stage === 'expanded' || stage === 'flipped') && (
            <motion.div
              style={{
                position: 'fixed',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 500,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <motion.div
                style={{ position: 'absolute', inset: 0, background: 'rgba(20,14,8,0.22)', willChange: 'opacity' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.55 }}
              />
              <motion.div
                style={{ position: 'relative', zIndex: 1, cursor: 'pointer', willChange: 'transform, opacity' }}
                initial={{ scale: cardPortalScale * 0.46, y: -80, opacity: 0 }}
                animate={{ scale: cardPortalScale, y: 0, opacity: 1 }}
                exit={{ scale: cardPortalScale * 0.48, y: -60, opacity: 0 }}
                transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
                onClick={handleCardClick}
              >
                <InvitationCard isFlipped={stage === 'expanded'} onClick={handleCardClick} language={language} />
              </motion.div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1, duration: 0.5 }}
                style={{
                  position: 'absolute',
                  bottom: 32,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  margin: 0,
                  color: 'rgba(255,255,255,0.62)',
                  fontSize: 'clamp(10px, 2.8vw, 12px)',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              >
                Click card to flip
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
